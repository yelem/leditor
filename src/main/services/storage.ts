/**
 * On-disk project storage layer.
 *
 * A project is a `*.bookproj` folder. All writes are atomic: data goes to a
 * temp file which is then renamed over the target, so a crash mid-write
 * cannot corrupt the existing file.
 */

import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  type DocumentContent,
  type ProjectManifest,
  CONTENT_DIRNAME,
  MANIFEST_FILENAME,
  NOTES_DIRNAME,
  SCHEMA_VERSION,
  BACKUPS_DIRNAME,
  createEmptyDocument
} from '@shared/project-types'
import { collectDocumentIds } from '../domain/project-model'
import { tMain } from '../i18n'

/** Atomic JSON write: temp file in the same folder + rename over the target. */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmpPath = join(dir, `.${basename(filePath)}.${randomUUID()}.tmp`)
  try {
    // fsync before rename: without it, after a power failure the rename may
    // survive the reboot while the data does not (leaving an empty file).
    const handle = await fs.open(tmpPath, 'w')
    try {
      await handle.writeFile(JSON.stringify(data, null, 2), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    // fs.rename replaces an existing file atomically on Windows and POSIX.
    await fs.rename(tmpPath, filePath)
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * Node id that is safe to use as a file name. Nodes are created with
 * randomUUID, but the id arrives from the renderer — validate the format to
 * rule out escaping the project folder (../, slashes, dots).
 */
function safeNodeId(nodeId: string): string {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(nodeId)) {
    throw new Error(tMain('main.errBadNodeId', { id: JSON.stringify(nodeId).slice(0, 80) }))
  }
  return nodeId
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw) as T
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

const manifestPath = (projectPath: string): string => join(projectPath, MANIFEST_FILENAME)
const contentDir = (projectPath: string): string => join(projectPath, CONTENT_DIRNAME)
const documentPath = (projectPath: string, nodeId: string): string =>
  join(contentDir(projectPath), `${safeNodeId(nodeId)}.json`)

/**
 * Create a new project on disk: folder structure, manifest, and empty content
 * files for every document node of the starter tree.
 */
export async function createProject(
  projectPath: string,
  manifest: ProjectManifest
): Promise<void> {
  await fs.mkdir(projectPath, { recursive: true })
  await fs.mkdir(contentDir(projectPath), { recursive: true })
  await fs.mkdir(join(projectPath, BACKUPS_DIRNAME), { recursive: true })

  await atomicWriteJson(manifestPath(projectPath), manifest)

  for (const docId of collectDocumentIds(manifest.tree)) {
    await atomicWriteJson(documentPath(projectPath, docId), createEmptyDocument())
  }
}

/** Read and validate the project manifest. */
export async function readManifest(projectPath: string): Promise<ProjectManifest> {
  const file = manifestPath(projectPath)
  if (!(await pathExists(file))) {
    throw new Error(tMain('main.errNotProject'))
  }

  const manifest = await readJson<ProjectManifest>(file)

  if (typeof manifest.schemaVersion !== 'number') {
    throw new Error(tMain('main.errCorruptManifest'))
  }
  if (manifest.schemaVersion > SCHEMA_VERSION) {
    throw new Error(tMain('main.errNewerProject', { v: manifest.schemaVersion }))
  }
  if (!Array.isArray(manifest.tree)) {
    throw new Error(tMain('main.errCorruptTree'))
  }
  // Older projects may lack the trash field.
  if (!Array.isArray(manifest.trash)) {
    manifest.trash = []
  }

  return manifest
}

/** Write the manifest, refreshing the modification timestamp. */
export async function writeManifest(
  projectPath: string,
  manifest: ProjectManifest
): Promise<ProjectManifest> {
  const updated: ProjectManifest = { ...manifest, updatedAt: new Date().toISOString() }
  await atomicWriteJson(manifestPath(projectPath), updated)
  return updated
}

/** Read document contents. Returns null if the file does not exist yet. */
export async function readDocument(
  projectPath: string,
  nodeId: string
): Promise<DocumentContent | null> {
  const file = documentPath(projectPath, nodeId)
  if (!(await pathExists(file))) return null
  return readJson<DocumentContent>(file)
}

/** Write document contents atomically. */
export async function writeDocument(
  projectPath: string,
  nodeId: string,
  content: DocumentContent
): Promise<void> {
  await atomicWriteJson(documentPath(projectPath, nodeId), content)
}

/** Delete a document's content file (e.g. when the node is removed). */
export async function deleteDocument(projectPath: string, nodeId: string): Promise<void> {
  await fs.rm(documentPath(projectPath, nodeId), { force: true })
}

// --- Chapter notes (notes/<id>.json) ---

const notePath = (projectPath: string, nodeId: string): string =>
  join(projectPath, NOTES_DIRNAME, `${safeNodeId(nodeId)}.json`)

/** Read a chapter note (or an empty string). */
export async function readNote(projectPath: string, nodeId: string): Promise<string> {
  const file = notePath(projectPath, nodeId)
  if (!(await pathExists(file))) return ''
  try {
    const data = await readJson<string>(file)
    return typeof data === 'string' ? data : ''
  } catch {
    return ''
  }
}

/** Write a chapter note. */
export async function writeNote(projectPath: string, nodeId: string, text: string): Promise<void> {
  await atomicWriteJson(notePath(projectPath, nodeId), text)
}

/** Delete a chapter note (when the node is removed). */
export async function deleteNote(projectPath: string, nodeId: string): Promise<void> {
  await fs.rm(notePath(projectPath, nodeId), { force: true })
}

// --- Chat history and the summaries cache ---

const chatPath = (projectPath: string): string => join(projectPath, 'chat.json')
const summariesPath = (projectPath: string): string => join(projectPath, 'summaries.json')

/** Read the project chat history (or an empty one). */
export async function readChat(projectPath: string): Promise<unknown[]> {
  const file = chatPath(projectPath)
  if (!(await pathExists(file))) return []
  try {
    const data = await readJson<unknown>(file)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** Write the project chat history. */
export async function writeChat(projectPath: string, messages: unknown[]): Promise<void> {
  await atomicWriteJson(chatPath(projectPath), messages)
}

/** Read the summaries cache (docId → text). */
export async function readSummaries(projectPath: string): Promise<Record<string, string>> {
  const file = summariesPath(projectPath)
  if (!(await pathExists(file))) return {}
  try {
    const data = await readJson<Record<string, string>>(file)
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

/** Write the summaries cache. */
export async function writeSummaries(
  projectPath: string,
  summaries: Record<string, string>
): Promise<void> {
  await atomicWriteJson(summariesPath(projectPath), summaries)
}
