/**
 * Access to system fonts via the Local Font Access API.
 * Call on a user gesture (focus/click), otherwise the API may reject the request.
 */

interface FontData {
  family: string
}

let cache: string[] | null = null
let pending: Promise<string[]> | null = null

export function getCachedFonts(): string[] {
  return cache ?? []
}

export async function loadSystemFonts(): Promise<string[]> {
  if (cache) return cache
  if (pending) return pending
  const query = (window as unknown as { queryLocalFonts?: () => Promise<FontData[]> }).queryLocalFonts
  if (typeof query !== 'function') {
    cache = []
    return cache
  }
  pending = query()
    .then((fonts) => {
      const set = new Set<string>()
      for (const f of fonts) if (f.family) set.add(f.family)
      cache = Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
      return cache
    })
    .catch(() => {
      cache = []
      return cache
    })
  return pending
}
