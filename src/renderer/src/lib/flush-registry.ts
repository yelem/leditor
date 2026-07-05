/**
 * Registry of flushers — functions that immediately write pending (debounced)
 * changes to disk: chapter text, notes, etc.
 *
 * Components with autosave register their flush; flushAll() runs before the
 * window closes (on main's request) and before a backup restore, so unsaved
 * edits are neither lost nor written over the restored state.
 */

type Flusher = () => Promise<void> | void

const flushers = new Set<Flusher>()

/** Register a flusher. Returns an unregister function. */
export function registerFlusher(fn: Flusher): () => void {
  flushers.add(fn)
  return () => {
    flushers.delete(fn)
  }
}

/** Run all registered flushers; errors do not stop the rest. */
export async function flushAll(): Promise<void> {
  await Promise.allSettled([...flushers].map((fn) => Promise.resolve().then(fn)))
}
