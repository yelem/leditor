/**
 * Cached per-document word/character counts for the whole-project counter.
 *
 * The counter refreshes after every autosave. Re-reading and re-parsing every
 * chapter each time made each typing pause cost a full pass over the book on
 * disk (and an antivirus scan of every file). Counts are now cached by file
 * identity (mtime + size): a refresh only stats the files and re-reads the
 * ones that changed — normally none, since a save records its own count.
 */

import { promises as fs } from 'node:fs'
import type { DocumentContent, ProjectStats } from '@shared/project-types'
import { countDocument } from '@shared/document-text'
import { documentFilePath, readDocument } from './storage'

interface Entry {
  mtimeMs: number
  size: number
  stats: ProjectStats
}

// projectPath → docId → entry
const cache = new Map<string, Map<string, Entry>>()

function projectCache(projectPath: string): Map<string, Entry> {
  let map = cache.get(projectPath)
  if (!map) {
    map = new Map()
    cache.set(projectPath, map)
  }
  return map
}

/** Record the count of a document that was just written. */
export async function rememberDocumentStats(
  projectPath: string,
  docId: string,
  content: DocumentContent
): Promise<void> {
  try {
    const st = await fs.stat(documentFilePath(projectPath, docId))
    projectCache(projectPath).set(docId, {
      mtimeMs: st.mtimeMs,
      size: st.size,
      stats: countDocument(content)
    })
  } catch {
    projectCache(projectPath).delete(docId)
  }
}

/** Count of one document, from the cache when the file has not changed. */
async function documentStats(projectPath: string, docId: string): Promise<ProjectStats | null> {
  const map = projectCache(projectPath)
  let st: { mtimeMs: number; size: number }
  try {
    st = await fs.stat(documentFilePath(projectPath, docId))
  } catch {
    map.delete(docId)
    return null
  }
  const hit = map.get(docId)
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.stats
  const content = await readDocument(projectPath, docId)
  if (!content) return null
  const stats = countDocument(content)
  map.set(docId, { mtimeMs: st.mtimeMs, size: st.size, stats })
  return stats
}

/** Total words/characters over the given documents. */
export async function projectStats(projectPath: string, docIds: string[]): Promise<ProjectStats> {
  let words = 0
  let chars = 0
  for (const docId of docIds) {
    // A corrupt or unreadable chapter must not break the counter for the rest.
    const c = await documentStats(projectPath, docId).catch(() => null)
    if (!c) continue
    words += c.words
    chars += c.chars
  }
  return { words, chars }
}
