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
import type { NodeType, ProjectManifest, ProjectSettings } from '@shared/project-types'
import { findNode } from '@renderer/lib/tree'
import { flushAll } from '@renderer/lib/flush-registry'
import { tGlobal } from '@renderer/lib/i18n'

/** Область сведённого просмотра «всё одной страницей». */
export type CombinedScope = { type: 'all' } | { type: 'folder'; id: string }

interface ProjectState {
  projectPath: string | null
  manifest: ProjectManifest | null
  activeDocId: string | null
  busy: boolean
  error: string | null
  /** Счётчик сохранений документов — для пересчёта контекста чатом. */
  docVersion: number
  /** Активный сведённый просмотр (или null — обычный редактор). */
  combinedScope: CombinedScope | null
}

interface ProjectContextValue extends ProjectState {
  createProject: () => Promise<void>
  openProject: () => Promise<void>
  /** Открыть проект по известному пути (drag-and-drop / ассоциация). */
  openProjectByPath: (path: string) => Promise<void>
  closeProject: () => void
  selectDocument: (nodeId: string) => void
  /** Сохранить манифест на диск и обновить состояние. */
  saveManifest: (manifest: ProjectManifest) => Promise<void>
  /** Изменить настройки поля проекта (сохраняется в project.json). */
  updateSettings: (partial: Partial<ProjectSettings>) => Promise<void>
  clearError: () => void

  // Мутации дерева (применяются в main, возвращают обновлённый манифест).
  createTreeNode: (parentId: string | null, type: NodeType) => Promise<string | null>
  renameTreeNode: (nodeId: string, title: string) => Promise<void>
  /** Переместить узлы в корзину (с поддеревьями). */
  trashNodes: (nodeIds: string[]) => Promise<void>
  /** Восстановить узел из корзины. */
  restoreFromTrash: (nodeId: string) => Promise<void>
  /** Окончательно удалить элемент корзины. */
  deleteFromTrash: (nodeId: string) => Promise<void>
  /** Очистить корзину целиком. */
  emptyTrash: () => Promise<void>
  moveTreeNode: (nodeId: string, newParentId: string | null, index: number) => Promise<void>
  duplicateTreeNode: (nodeId: string) => Promise<string | null>
  /** Восстановить проект из снапшота (с защитной копией текущего состояния). */
  restoreBackup: (id: string) => Promise<void>
  /** Сообщить о сохранении документа (триггер пересчёта контекста чата). */
  bumpDocVersion: () => void
  /** Открыть сведённый просмотр (всё/папка одной страницей). */
  showCombined: (scope: CombinedScope) => void
  /** Закрыть сведённый просмотр. */
  closeCombined: () => void
}

const LAST_PROJECT_KEY = 'book-editor.lastProjectPath'
const lastDocKey = (projectPath: string): string => `book-editor.lastDoc:${projectPath}`

const INITIAL_STATE: ProjectState = {
  projectPath: null,
  manifest: null,
  activeDocId: null,
  busy: false,
  error: null,
  docVersion: 0,
  combinedScope: null
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function ProjectProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<ProjectState>(INITIAL_STATE)
  const stateRef = useRef(state)
  stateRef.current = state

  const applyOpened = useCallback(
    (result: { projectPath: string; manifest: ProjectManifest }) => {
      localStorage.setItem(LAST_PROJECT_KEY, result.projectPath)
      // Восстановить последнюю открытую главу, если она ещё существует.
      const lastDoc = localStorage.getItem(lastDocKey(result.projectPath))
      const activeDocId = lastDoc && findNode(result.manifest.tree, lastDoc) ? lastDoc : null
      setState((s) => ({
        projectPath: result.projectPath,
        manifest: result.manifest,
        activeDocId,
        busy: false,
        error: null,
        docVersion: s.docVersion + 1,
        combinedScope: null
      }))
      // Снапшот при открытии (main решает по настройкам).
      void window.api.backup.projectOpened(result.projectPath).catch(() => undefined)
    },
    []
  )

  // Восстановление последнего проекта при запуске.
  useEffect(() => {
    const lastPath = localStorage.getItem(LAST_PROJECT_KEY)
    if (!lastPath) return
    let cancelled = false
    setState((s) => ({ ...s, busy: true }))
    window.api.project
      .openPath(lastPath)
      .then((result) => {
        if (!cancelled) applyOpened(result)
      })
      .catch(() => {
        // Проект мог быть перемещён/удалён — забываем его.
        localStorage.removeItem(LAST_PROJECT_KEY)
        if (!cancelled) setState((s) => ({ ...s, busy: false }))
      })
    return () => {
      cancelled = true
    }
  }, [applyOpened])

  const createProject = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }))
    try {
      const result = await window.api.project.create()
      if (result) applyOpened(result)
      else setState((s) => ({ ...s, busy: false }))
    } catch (err) {
      setState((s) => ({ ...s, busy: false, error: errorMessage(err) }))
    }
  }, [applyOpened])

  const openProject = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }))
    try {
      const result = await window.api.project.open()
      if (result) applyOpened(result)
      else setState((s) => ({ ...s, busy: false }))
    } catch (err) {
      setState((s) => ({ ...s, busy: false, error: errorMessage(err) }))
    }
  }, [applyOpened])

  const openProjectByPath = useCallback(
    async (path: string) => {
      setState((s) => ({ ...s, busy: true, error: null }))
      try {
        applyOpened(await window.api.project.openPath(path))
      } catch (err) {
        setState((s) => ({ ...s, busy: false, error: errorMessage(err) }))
      }
    },
    [applyOpened]
  )

  // Открытие проекта по запросу ОС (ассоциация .bookproj / аргумент запуска).
  useEffect(
    () => window.api.app.onOpenProject((path) => void openProjectByPath(path)),
    [openProjectByPath]
  )

  const closeProject = useCallback(() => {
    const path = stateRef.current.projectPath
    if (path) void window.api.backup.projectClosing(path).catch(() => undefined)
    localStorage.removeItem(LAST_PROJECT_KEY)
    setState(INITIAL_STATE)
  }, [])

  const restoreBackup = useCallback(async (id: string): Promise<void> => {
    const path = stateRef.current.projectPath
    if (!path) return
    try {
      // Сбрасываем активный документ и дописываем отложенные автосохранения
      // ДО восстановления — иначе debounce-таймер редактора может сработать
      // после замены файлов и перезаписать восстановленное старым содержимым.
      setState((s) => ({ ...s, activeDocId: null }))
      await flushAll()
      const manifest = await window.api.backup.restore(path, id)
      setState((s) => ({ ...s, manifest, activeDocId: null }))
    } catch (err) {
      setState((s) => ({ ...s, error: errorMessage(err) }))
    }
  }, [])

  const selectDocument = useCallback((nodeId: string) => {
    const path = stateRef.current.projectPath
    if (path) localStorage.setItem(lastDocKey(path), nodeId)
    // Выбор документа выходит из сведённого просмотра.
    setState((s) => ({ ...s, activeDocId: nodeId, combinedScope: null }))
  }, [])

  const showCombined = useCallback((scope: CombinedScope) => {
    setState((s) => ({ ...s, combinedScope: scope }))
  }, [])

  const closeCombined = useCallback(() => {
    setState((s) => ({ ...s, combinedScope: null }))
  }, [])

  const saveManifest = useCallback(async (manifest: ProjectManifest) => {
    const path = stateRef.current.projectPath
    if (!path) return
    setState((s) => ({ ...s, manifest }))
    try {
      const saved = await window.api.project.save(path, manifest)
      setState((s) => ({ ...s, manifest: saved }))
    } catch (err) {
      setState((s) => ({ ...s, error: errorMessage(err) }))
    }
  }, [])

  const updateSettings = useCallback(
    async (partial: Partial<ProjectSettings>): Promise<void> => {
      const current = stateRef.current.manifest
      if (!current) return
      await saveManifest({ ...current, settings: { ...current.settings, ...partial } })
    },
    [saveManifest]
  )

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), [])

  const bumpDocVersion = useCallback(
    () => setState((s) => ({ ...s, docVersion: s.docVersion + 1 })),
    []
  )

  const createTreeNode = useCallback(
    async (parentId: string | null, type: NodeType): Promise<string | null> => {
      const path = stateRef.current.projectPath
      if (!path) return null
      try {
        const title = type === 'folder' ? tGlobal('tree.newFolder') : tGlobal('tree.newDocument')
        const { manifest, nodeId } = await window.api.tree.create(path, parentId, type, title)
        setState((s) => ({
          ...s,
          manifest,
          activeDocId: type === 'document' ? nodeId : s.activeDocId
        }))
        return nodeId
      } catch (err) {
        setState((s) => ({ ...s, error: errorMessage(err) }))
        return null
      }
    },
    []
  )

  const renameTreeNode = useCallback(async (nodeId: string, title: string): Promise<void> => {
    const path = stateRef.current.projectPath
    if (!path) return
    try {
      const manifest = await window.api.tree.rename(path, nodeId, title)
      setState((s) => ({ ...s, manifest }))
    } catch (err) {
      setState((s) => ({ ...s, error: errorMessage(err) }))
    }
  }, [])

  // Активный документ мог попасть в корзину — сбрасываем, если его больше нет в дереве.
  const applyTreeManifest = useCallback((manifest: ProjectManifest): void => {
    setState((s) => {
      const activeStillExists = s.activeDocId
        ? findNode(manifest.tree, s.activeDocId) !== null
        : false
      return { ...s, manifest, activeDocId: activeStillExists ? s.activeDocId : null }
    })
  }, [])

  const trashNodes = useCallback(
    async (nodeIds: string[]): Promise<void> => {
      const path = stateRef.current.projectPath
      if (!path || nodeIds.length === 0) return
      try {
        applyTreeManifest(await window.api.trash.move(path, nodeIds))
      } catch (err) {
        setState((s) => ({ ...s, error: errorMessage(err) }))
      }
    },
    [applyTreeManifest]
  )

  const restoreFromTrash = useCallback(async (nodeId: string): Promise<void> => {
    const path = stateRef.current.projectPath
    if (!path) return
    try {
      const manifest = await window.api.trash.restore(path, nodeId)
      setState((s) => ({ ...s, manifest }))
    } catch (err) {
      setState((s) => ({ ...s, error: errorMessage(err) }))
    }
  }, [])

  const deleteFromTrash = useCallback(async (nodeId: string): Promise<void> => {
    const path = stateRef.current.projectPath
    if (!path) return
    try {
      const manifest = await window.api.trash.delete(path, nodeId)
      setState((s) => ({ ...s, manifest }))
    } catch (err) {
      setState((s) => ({ ...s, error: errorMessage(err) }))
    }
  }, [])

  const emptyTrash = useCallback(async (): Promise<void> => {
    const path = stateRef.current.projectPath
    if (!path) return
    try {
      const manifest = await window.api.trash.empty(path)
      setState((s) => ({ ...s, manifest }))
    } catch (err) {
      setState((s) => ({ ...s, error: errorMessage(err) }))
    }
  }, [])

  const moveTreeNode = useCallback(
    async (nodeId: string, newParentId: string | null, index: number): Promise<void> => {
      const path = stateRef.current.projectPath
      if (!path) return
      try {
        const manifest = await window.api.tree.move(path, nodeId, newParentId, index)
        setState((s) => ({ ...s, manifest }))
      } catch (err) {
        setState((s) => ({ ...s, error: errorMessage(err) }))
      }
    },
    []
  )

  const duplicateTreeNode = useCallback(async (nodeId: string): Promise<string | null> => {
    const path = stateRef.current.projectPath
    if (!path) return null
    try {
      const { manifest, nodeId: newId } = await window.api.tree.duplicate(path, nodeId)
      setState((s) => ({ ...s, manifest }))
      return newId
    } catch (err) {
      setState((s) => ({ ...s, error: errorMessage(err) }))
      return null
    }
  }, [])

  const value = useMemo<ProjectContextValue>(
    () => ({
      ...state,
      createProject,
      openProject,
      openProjectByPath,
      closeProject,
      selectDocument,
      saveManifest,
      updateSettings,
      clearError,
      createTreeNode,
      renameTreeNode,
      trashNodes,
      restoreFromTrash,
      deleteFromTrash,
      emptyTrash,
      moveTreeNode,
      duplicateTreeNode,
      restoreBackup,
      bumpDocVersion,
      showCombined,
      closeCombined
    }),
    [
      state,
      createProject,
      openProject,
      openProjectByPath,
      closeProject,
      selectDocument,
      saveManifest,
      updateSettings,
      clearError,
      createTreeNode,
      renameTreeNode,
      trashNodes,
      restoreFromTrash,
      deleteFromTrash,
      emptyTrash,
      moveTreeNode,
      duplicateTreeNode,
      restoreBackup,
      bumpDocVersion,
      showCombined,
      closeCombined
    ]
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProject должен использоваться внутри <ProjectProvider>')
  }
  return ctx
}
