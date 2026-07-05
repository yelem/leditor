import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

/** Side-panel width limits (px). */
export const PANEL_LIMITS = {
  left: { min: 180, max: 480, default: 280 },
  right: { min: 260, max: 560, default: 360 }
} as const

/** Window layout (panel widths, collapsing) — stored locally in the browser. */
interface UiState {
  leftWidth: number
  rightWidth: number
  leftCollapsed: boolean
  rightCollapsed: boolean
}

interface UiContextValue extends UiState {
  /** Focus mode: editor only, no panels or toolbar. */
  focusMode: boolean
  resizeLeft: (deltaX: number) => void
  resizeRight: (deltaX: number) => void
  toggleLeft: () => void
  toggleRight: () => void
  toggleFocus: () => void
  setFocus: (value: boolean) => void
}

const STORAGE_KEY = 'book-editor.ui'

const DEFAULT_STATE: UiState = {
  leftWidth: PANEL_LIMITS.left.default,
  rightWidth: PANEL_LIMITS.right.default,
  leftCollapsed: false,
  rightCollapsed: false
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function loadState(): UiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<UiState>
    return {
      leftWidth: clamp(
        parsed.leftWidth ?? DEFAULT_STATE.leftWidth,
        PANEL_LIMITS.left.min,
        PANEL_LIMITS.left.max
      ),
      rightWidth: clamp(
        parsed.rightWidth ?? DEFAULT_STATE.rightWidth,
        PANEL_LIMITS.right.min,
        PANEL_LIMITS.right.max
      ),
      leftCollapsed: Boolean(parsed.leftCollapsed),
      rightCollapsed: Boolean(parsed.rightCollapsed)
    }
  } catch {
    return DEFAULT_STATE
  }
}

const UiContext = createContext<UiContextValue | null>(null)

export function UiProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<UiState>(loadState)
  // Focus mode is not persisted between launches (always starts off).
  const [focusMode, setFocusMode] = useState(false)

  // Persist the layout between launches.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, [state])

  const resizeLeft = useCallback((deltaX: number) => {
    setState((s) => ({
      ...s,
      leftWidth: clamp(s.leftWidth + deltaX, PANEL_LIMITS.left.min, PANEL_LIMITS.left.max)
    }))
  }, [])

  const resizeRight = useCallback((deltaX: number) => {
    // Right divider: moving left widens the panel.
    setState((s) => ({
      ...s,
      rightWidth: clamp(s.rightWidth - deltaX, PANEL_LIMITS.right.min, PANEL_LIMITS.right.max)
    }))
  }, [])

  const toggleLeft = useCallback(() => {
    setState((s) => ({ ...s, leftCollapsed: !s.leftCollapsed }))
  }, [])

  const toggleRight = useCallback(() => {
    setState((s) => ({ ...s, rightCollapsed: !s.rightCollapsed }))
  }, [])

  const toggleFocus = useCallback(() => setFocusMode((v) => !v), [])
  const setFocus = useCallback((value: boolean) => setFocusMode(value), [])

  const value = useMemo<UiContextValue>(
    () => ({
      ...state,
      focusMode,
      resizeLeft,
      resizeRight,
      toggleLeft,
      toggleRight,
      toggleFocus,
      setFocus
    }),
    [state, focusMode, resizeLeft, resizeRight, toggleLeft, toggleRight, toggleFocus, setFocus]
  )

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext)
  if (!ctx) {
    throw new Error('useUi must be used inside <UiProvider>')
  }
  return ctx
}
