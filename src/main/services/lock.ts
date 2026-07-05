/**
 * Sequential execution of operations on one resource (by key).
 *
 * IPC handlers are async and can interleave at awaits; read-modify-write
 * manifest operations lose each other's changes without serialization.
 * All project mutations and backup operations take the lock keyed by the
 * project path.
 */

const tails = new Map<string, Promise<void>>()

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const tail = tails.get(key) ?? Promise.resolve()
  const run = tail.then(fn, fn)
  const next = run.then(
    () => undefined,
    () => undefined
  )
  tails.set(key, next)
  // Keep the map from growing forever: if the tail is unchanged, the queue is empty.
  void next.then(() => {
    if (tails.get(key) === next) tails.delete(key)
  })
  return run
}
