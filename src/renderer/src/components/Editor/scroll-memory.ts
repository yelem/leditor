/**
 * Per-document scroll positions of the editor.
 *
 * All chapters share one scroll container, so without this the browser just
 * keeps the previous chapter's offset (clamped to the new length): a short
 * chapter resets a long one to the top, and scrolling one chapter to the
 * bottom drags every other chapter there too.
 *
 * Positions live in memory (survive the editor remounting, e.g. after the
 * combined view) and are mirrored to localStorage per project, so a chapter
 * reopens where it was left even after a restart.
 */

const storageKey = (projectPath: string): string => `book-editor.scroll:${projectPath}`

const cache = new Map<string, Record<string, number>>()
const dirty = new Set<string>()
let persistTimer: ReturnType<typeof setTimeout> | null = null

function positions(projectPath: string): Record<string, number> {
  let map = cache.get(projectPath)
  if (!map) {
    map = {}
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(projectPath)) ?? '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        map = parsed as Record<string, number>
      }
    } catch {
      /* unreadable or unavailable storage — start empty */
    }
    cache.set(projectPath, map)
  }
  return map
}

/** Write changed projects to localStorage now. */
export function persistScrollPositions(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  for (const projectPath of dirty) {
    try {
      localStorage.setItem(storageKey(projectPath), JSON.stringify(positions(projectPath)))
    } catch {
      /* storage full or unavailable — positions still work for this session */
    }
  }
  dirty.clear()
}

/** Saved scroll offset of a document (0 when unknown). */
export function getScrollPosition(projectPath: string, docId: string): number {
  const value = positions(projectPath)[docId]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Remember a document's scroll offset; persisted with a short debounce. */
export function setScrollPosition(projectPath: string, docId: string, top: number): void {
  const map = positions(projectPath)
  const value = Math.max(0, Math.round(top))
  if (map[docId] === value) return
  map[docId] = value
  dirty.add(projectPath)
  if (!persistTimer) persistTimer = setTimeout(persistScrollPositions, 1000)
}
