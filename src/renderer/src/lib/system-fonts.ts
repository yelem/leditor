/**
 * Доступ к системным шрифтам через Local Font Access API.
 * Вызывать по жесту пользователя (фокус/клик), иначе API может отклонить запрос.
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
