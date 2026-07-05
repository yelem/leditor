/**
 * Сервис резервного копирования.
 *
 * Снапшот — полная копия project.json + content/ (+ notes/) в backups/<id>/,
 * где id — сортируемая метка времени. Хранится meta.json с временем и причиной.
 * Ротация ограничивает число копий. Восстановление перед перезаписью делает
 * защитный снапшот текущего состояния (pre-restore).
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
 * Папка снапшотов проекта. Пустой customLocation — внутри проекта (backups/).
 * Иначе — <customLocation>/<имя проекта>-<хеш полного пути> (чтобы разные
 * проекты с одинаковым именем не смешивались).
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

/** Сортируемая метка времени для имени папки: 20260624-163012-345. */
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

/** Создать снапшот проекта и применить ротацию. Возвращает описание копии. */
export async function createSnapshot(
  projectPath: string,
  reason: BackupReason,
  maxBackups: number,
  customLocation = ''
): Promise<BackupInfo> {
  const now = new Date()
  let id = timestampId(now)
  // Гарантируем уникальность имени папки.
  let dir = snapshotDir(projectPath, id, customLocation)
  let suffix = 0
  while (await pathExists(dir)) {
    suffix += 1
    id = `${timestampId(now)}-${suffix}`
    dir = snapshotDir(projectPath, id, customLocation)
  }

  await fs.mkdir(dir, { recursive: true })

  // Копируем манифест и содержимое (backups/ в снапшот не входит).
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

/** Список снапшотов, отсортированный от новых к старым. */
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
    // meta.json пишется последним — его отсутствие означает, что снапшот
    // оборван (например, выход по таймауту). Такие не показываем и не
    // восстанавливаем; мусор подчищает rotate().
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

/** Удалить лишние снапшоты сверх лимита (самые старые) и мусор от обрыва. */
async function rotate(projectPath: string, maxBackups: number, customLocation: string): Promise<void> {
  const all = await listSnapshots(projectPath, customLocation)
  const excess = all.slice(Math.max(0, maxBackups))
  for (const info of excess) {
    await fs.rm(snapshotDir(projectPath, info.id, customLocation), { recursive: true, force: true })
  }

  // Папки без meta.json — оборванные снапшоты. Удаляем только старше часа:
  // совсем свежая папка может быть снапшотом, который пишется прямо сейчас.
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
    /* папки бэкапов может не быть — игнорируем */
  }
}

/** Удалить один снапшот по id. */
export async function deleteSnapshot(
  projectPath: string,
  id: string,
  customLocation = ''
): Promise<void> {
  await fs.rm(snapshotDir(projectPath, id, customLocation), { recursive: true, force: true })
}

/**
 * Восстановить проект из снапшота. Перед перезаписью делает защитный снапшот
 * текущего состояния (pre-restore). Возвращает восстановленный манифест.
 */
export async function restoreSnapshot(
  projectPath: string,
  id: string,
  maxBackups: number,
  customLocation = ''
): Promise<ProjectManifest> {
  const src = snapshotDir(projectPath, id, customLocation)
  // meta.json пишется последним — без него снапшот оборван и восстанавливать
  // его нельзя (молча потерялись бы главы).
  if (
    !(await pathExists(join(src, MANIFEST_FILENAME))) ||
    !(await pathExists(join(src, 'meta.json')))
  ) {
    throw new Error(tMain('main.errSnapshotMissing'))
  }

  // Защитная копия текущего состояния — чтобы восстановление было обратимым.
  // Без ротации: ротация могла бы удалить сам восстанавливаемый снапшот
  // (когда он самый старый, а лимит уже достигнут). Ротируем после копирования.
  await createSnapshot(projectPath, 'pre-restore', Number.POSITIVE_INFINITY, customLocation)

  // Манифест.
  await fs.copyFile(join(src, MANIFEST_FILENAME), join(projectPath, MANIFEST_FILENAME))

  // Содержимое: заменяем целиком.
  const contentDest = join(projectPath, CONTENT_DIRNAME)
  await fs.rm(contentDest, { recursive: true, force: true })
  const contentSrc = join(src, CONTENT_DIRNAME)
  if (await pathExists(contentSrc)) {
    await fs.cp(contentSrc, contentDest, { recursive: true })
  } else {
    await fs.mkdir(contentDest, { recursive: true })
  }

  // Заметки.
  const notesDest = join(projectPath, NOTES_DIRNAME)
  const notesSrc = join(src, NOTES_DIRNAME)
  if (await pathExists(notesSrc)) {
    await fs.rm(notesDest, { recursive: true, force: true })
    await fs.cp(notesSrc, notesDest, { recursive: true })
  }

  // Отложенная ротация (см. выше): восстановление завершено, лишнее можно удалять.
  await rotate(projectPath, maxBackups, customLocation)

  return readManifest(projectPath)
}
