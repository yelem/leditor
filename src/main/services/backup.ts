/**
 * Backup service.
 *
 * A snapshot is a full copy of project.json + content/ (+ notes/) placed in
 * backups/<id>/, where id is a sortable timestamp. meta.json stores the time
 * and reason. Rotation caps the number of copies. Restoring first takes a
 * protective snapshot of the current state (pre-restore).
 */

import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  type ProjectManifest,
  BACKUPS_DIRNAME,
  CONTENT_DIRNAME,
  MANIFEST_FILENAME,
  NOTES_DIRNAME,
  PROJECT_EXTENSION
} from '@shared/project-types'
import type { BackupInfo, BackupReason } from '@shared/backup-types'
import { collectDocumentIds } from '../domain/project-model'
import { atomicWriteJson, readManifest } from './storage'
import { tMain } from '../i18n'

/**
 * The project's snapshots folder. Empty customLocation — inside the project
 * (backups/). Otherwise — <customLocation>/<project name>-<full-path hash>
 * (so different projects with the same name do not mix).
 */
function backupsDir(projectPath: string, customLocation: string): string {
  if (!customLocation) return join(projectPath, BACKUPS_DIRNAME)
  const base =
    basename(projectPath)
      .replace(new RegExp(`\\${PROJECT_EXTENSION}$`, 'i'), '')
      .replace(/[\\/:*?"<>|]+/g, '_') || 'project'
  const hash = createHash('sha1').update(projectPath).digest('hex').slice(0, 8)
  return join(customLocation, `${base}-${hash}`)
}

const snapshotDir = (projectPath: string, id: string, customLocation: string): string =>
  join(backupsDir(projectPath, customLocation), id)

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

/** Sortable timestamp for the folder name: 20260624-163012-345. */
function timestampId(date: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}` +
    `-${p(date.getMilliseconds(), 3)}`
  )
}

interface SnapshotMeta {
  createdAt: string
  reason: BackupReason
  documentCount: number
}

/** Create a project snapshot and apply rotation. Returns the snapshot info. */
export async function createSnapshot(
  projectPath: string,
  reason: BackupReason,
  maxBackups: number,
  customLocation = ''
): Promise<BackupInfo> {
  const now = new Date()
  let id = timestampId(now)
  // Guarantee folder-name uniqueness.
  let dir = snapshotDir(projectPath, id, customLocation)
  let suffix = 0
  while (await pathExists(dir)) {
    suffix += 1
    id = `${timestampId(now)}-${suffix}`
    dir = snapshotDir(projectPath, id, customLocation)
  }

  await fs.mkdir(dir, { recursive: true })

  // Copy the manifest and contents (backups/ itself is not included).
  const manifest = await readManifest(projectPath)
  await fs.copyFile(join(projectPath, MANIFEST_FILENAME), join(dir, MANIFEST_FILENAME))

  const contentSrc = join(projectPath, CONTENT_DIRNAME)
  if (await pathExists(contentSrc)) {
    await fs.cp(contentSrc, join(dir, CONTENT_DIRNAME), { recursive: true })
  }
  const notesSrc = join(projectPath, NOTES_DIRNAME)
  if (await pathExists(notesSrc)) {
    await fs.cp(notesSrc, join(dir, NOTES_DIRNAME), { recursive: true })
  }

  const documentCount = collectDocumentIds(manifest.tree).length
  const meta: SnapshotMeta = { createdAt: now.toISOString(), reason, documentCount }
  await atomicWriteJson(join(dir, 'meta.json'), meta)

  await rotate(projectPath, maxBackups, customLocation)

  return { id, createdAt: meta.createdAt, reason, documentCount }
}

/** List of snapshots, newest first. */
export async function listSnapshots(
  projectPath: string,
  customLocation = ''
): Promise<BackupInfo[]> {
  const root = backupsDir(projectPath, customLocation)
  if (!(await pathExists(root))) return []

  const entries = await fs.readdir(root, { withFileTypes: true })
  const infos: BackupInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const id = entry.name
    let meta: SnapshotMeta | null = null
    try {
      meta = JSON.parse(await fs.readFile(join(root, id, 'meta.json'), 'utf8')) as SnapshotMeta
    } catch {
      meta = null
    }
    // meta.json is written last — its absence means the snapshot was cut off
    // (e.g. quit by timeout). Such snapshots are neither listed nor restorable;
    // rotate() cleans up the leftovers.
    if (!meta) continue
    infos.push({
      id,
      createdAt: meta.createdAt,
      reason: meta.reason,
      documentCount: meta.documentCount
    })
  }

  infos.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  return infos
}

/** Delete snapshots over the limit (oldest first) and interrupted leftovers. */
async function rotate(projectPath: string, maxBackups: number, customLocation: string): Promise<void> {
  const all = await listSnapshots(projectPath, customLocation)
  const excess = all.slice(Math.max(0, maxBackups))
  for (const info of excess) {
    await fs.rm(snapshotDir(projectPath, info.id, customLocation), { recursive: true, force: true })
  }

  // Folders without meta.json are interrupted snapshots. Delete only those
  // older than an hour: a very fresh folder may be a snapshot being written now.
  const complete = new Set(all.map((i) => i.id))
  const root = backupsDir(projectPath, customLocation)
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || complete.has(entry.name)) continue
      const stat = await fs.stat(join(root, entry.name)).catch(() => null)
      if (stat && Date.now() - stat.mtimeMs > 3_600_000) {
        await fs.rm(join(root, entry.name), { recursive: true, force: true })
      }
    }
  } catch {
    /* the backups folder may not exist — ignore */
  }
}

/** Delete one snapshot by id. */
export async function deleteSnapshot(
  projectPath: string,
  id: string,
  customLocation = ''
): Promise<void> {
  await fs.rm(snapshotDir(projectPath, id, customLocation), { recursive: true, force: true })
}

/**
 * Restore the project from a snapshot. Takes a protective snapshot of the
 * current state (pre-restore) before overwriting. Returns the restored manifest.
 */
export async function restoreSnapshot(
  projectPath: string,
  id: string,
  maxBackups: number,
  customLocation = ''
): Promise<ProjectManifest> {
  const src = snapshotDir(projectPath, id, customLocation)
  // meta.json is written last — without it the snapshot is incomplete and
  // must not be restored (chapters would silently go missing).
  if (
    !(await pathExists(join(src, MANIFEST_FILENAME))) ||
    !(await pathExists(join(src, 'meta.json')))
  ) {
    throw new Error(tMain('main.errSnapshotMissing'))
  }

  // Protective copy of the current state — makes the restore reversible.
  // Without rotation: rotation could delete the very snapshot being restored
  // (when it is the oldest and the limit is reached). Rotate after copying.
  await createSnapshot(projectPath, 'pre-restore', Number.POSITIVE_INFINITY, customLocation)

  // Manifest.
  await fs.copyFile(join(src, MANIFEST_FILENAME), join(projectPath, MANIFEST_FILENAME))

  // Contents: replaced wholesale.
  const contentDest = join(projectPath, CONTENT_DIRNAME)
  await fs.rm(contentDest, { recursive: true, force: true })
  const contentSrc = join(src, CONTENT_DIRNAME)
  if (await pathExists(contentSrc)) {
    await fs.cp(contentSrc, contentDest, { recursive: true })
  } else {
    await fs.mkdir(contentDest, { recursive: true })
  }

  // Notes.
  const notesDest = join(projectPath, NOTES_DIRNAME)
  const notesSrc = join(src, NOTES_DIRNAME)
  if (await pathExists(notesSrc)) {
    await fs.rm(notesDest, { recursive: true, force: true })
    await fs.cp(notesSrc, notesDest, { recursive: true })
  }

  // Deferred rotation (see above): the restore is done, extras can be deleted.
  await rotate(projectPath, maxBackups, customLocation)

  return readManifest(projectPath)
}
