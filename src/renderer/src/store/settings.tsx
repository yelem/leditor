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

  // Language for non-React consumers (editor placeholder, etc.).
  useEffect(() => {
    setRendererLanguage(settings.language)
  }, [settings.language])

  const persist = useCallback((next: GlobalSettings) => {
    setSettings(next)
    void window.api.settings.set(next).then((saved) => setSettings(saved))
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
    () => ({ settings, loaded, patch, toggleTheme }),
    [settings, loaded, patch, toggleTheme]
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
