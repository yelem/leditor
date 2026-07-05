/**
 * Слой хранения проекта на диске.
 *
 * Проект — это папка `*.bookproj`. Все записи атомарны:
 * данные пишутся во временный файл и переименовываются поверх целевого, чтобы
 * сбой посреди записи не повредил существующий файл.
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

/** Атомарная запись JSON: temp-файл в той же папке + переименование поверх цели. */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmpPath = join(dir, `.${basename(filePath)}.${randomUUID()}.tmp`)
  try {
    // fsync перед rename: без него при сбое питания переименование может
    // пережить перезагрузку, а данные — нет (остался бы пустой файл).
    const handle = await fs.open(tmpPath, 'w')
    try {
      await handle.writeFile(JSON.stringify(data, null, 2), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    // fs.rename на Windows и POSIX заменяет существующий файл атомарно.
    await fs.rename(tmpPath, filePath)
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * Идентификатор узла, безопасный для имени файла. Узлы создаются через
 * randomUUID, но id приходит из renderer — проверяем формат, чтобы исключить
 * выход за пределы папки проекта (../, слэши, точки).
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
 * Создать новый проект на диске: структура папок, манифест и пустые файлы
 * содержимого для всех узлов-документов из стартового дерева.
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

/** Прочитать и провалидировать манифест проекта. */
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
  // У старых проектов поля корзины может не быть.
  if (!Array.isArray(manifest.trash)) {
    manifest.trash = []
  }

  return manifest
}

/** Записать манифест, обновив отметку времени изменения. */
export async function writeManifest(
  projectPath: string,
  manifest: ProjectManifest
): Promise<ProjectManifest> {
  const updated: ProjectManifest = { ...manifest, updatedAt: new Date().toISOString() }
  await atomicWriteJson(manifestPath(projectPath), updated)
  return updated
}

/** Прочитать содержимое документа. Возвращает null, если файла ещё нет. */
export async function readDocument(
  projectPath: string,
  nodeId: string
): Promise<DocumentContent | null> {
  const file = documentPath(projectPath, nodeId)
  if (!(await pathExists(file))) return null
  return readJson<DocumentContent>(file)
}

/** Записать содержимое документа атомарно. */
export async function writeDocument(
  projectPath: string,
  nodeId: string,
  content: DocumentContent
): Promise<void> {
  await atomicWriteJson(documentPath(projectPath, nodeId), content)
}

/** Удалить файл содержимого документа (например, при удалении узла). */
export async function deleteDocument(projectPath: string, nodeId: string): Promise<void> {
  await fs.rm(documentPath(projectPath, nodeId), { force: true })
}

// --- Заметки глав (notes/<id>.json) ---

const notePath = (projectPath: string, nodeId: string): string =>
  join(projectPath, NOTES_DIRNAME, `${safeNodeId(nodeId)}.json`)

/** Прочитать заметку главы (или пустую строку). */
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

/** Записать заметку главы. */
export async function writeNote(projectPath: string, nodeId: string, text: string): Promise<void> {
  await atomicWriteJson(notePath(projectPath, nodeId), text)
}

/** Удалить заметку главы (при удалении узла). */
export async function deleteNote(projectPath: string, nodeId: string): Promise<void> {
  await fs.rm(notePath(projectPath, nodeId), { force: true })
}

// --- История чата и кэш кратких содержаний ---

const chatPath = (projectPath: string): string => join(projectPath, 'chat.json')
const summariesPath = (projectPath: string): string => join(projectPath, 'summaries.json')

/** Прочитать историю чата проекта (или пустую). */
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

/** Записать историю чата проекта. */
export async function writeChat(projectPath: string, messages: unknown[]): Promise<void> {
  await atomicWriteJson(chatPath(projectPath), messages)
}

/** Прочитать кэш кратких содержаний (docId → текст). */
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

/** Записать кэш кратких содержаний. */
export async function writeSummaries(
  projectPath: string,
  summaries: Record<string, string>
): Promise<void> {
  await atomicWriteJson(summariesPath(projectPath), summaries)
}
