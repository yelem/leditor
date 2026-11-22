import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { type GlobalSettings, DEFAULT_GLOBAL_SETTINGS } from '@shared/settings-types'
import { setRendererLanguage } from '@renderer/lib/i18n'

interface SettingsContextValue {
  settings: GlobalSettings
  loaded: boolean
  /** Merge partial top-level changes and persist to userData. */
  patch: (partial: Partial<GlobalSettings>) => void
  /** Take settings main has already saved (e.g. after a dialog it showed). */
  adopt: (saved: GlobalSettings) => void
  toggleTheme: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Load global settings on startup.
  useEffect(() => {
    let cancelled = false
    window.api.settings
      .get()
      .then((s) => {
        if (cancelled) return
        setSettings(s)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [])

  // Apply the theme to the document root.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
  }, [settings.theme])

  // Language for non-React consumers (editor placeholder, etc.). The document
  // lang follows it too: index.html can only carry a static one, and the
  // engine reads the attribute for hyphenation and line breaking.
  useEffect(() => {
    setRendererLanguage(settings.language)
    document.documentElement.lang = settings.language
  }, [settings.language])

  // Only the reply to the latest save is applied: an earlier reply arriving
  // after a newer change would roll the screen back, and the next patch built
  // on that state would drop the newer change.
  const saveSeqRef = useRef(0)

  const persist = useCallback((next: GlobalSettings) => {
    const seq = ++saveSeqRef.current
    setSettings(next)
    window.api.settings
      .set(next)
      .then((saved) => {
        if (seq === saveSeqRef.current) setSettings(saved)
      })
      .catch(() => {
        // Not written: show what is actually stored instead of the edit.
        if (seq !== saveSeqRef.current) return
        void window.api.settings.get().then((stored) => {
          if (seq === saveSeqRef.current) setSettings(stored)
        })
      })
  }, [])

  const adopt = useCallback((saved: GlobalSettings) => {
    saveSeqRef.current++
    setSettings(saved)
  }, [])

  const patch = useCallback(
    (partial: Partial<GlobalSettings>) => {
      persist({ ...settingsRef.current, ...partial })
    },
    [persist]
  )

  const toggleTheme = useCallback(() => {
    const current = settingsRef.current
    persist({ ...current, theme: current.theme === 'light' ? 'dark' : 'light' })
  }, [persist])

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loaded, patch, adopt, toggleTheme }),
    [settings, loaded, patch, adopt, toggleTheme]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used inside <SettingsProvider>')
  }
  return ctx
}
