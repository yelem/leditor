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

/** Scope of the combined single-page view. */
export type CombinedScope = { type: 'all' } | { type: 'folder'; id: string }

interface ProjectState {
  projectPath: string | null
  manifest: ProjectManifest | null
  activeDocId: string | null
  busy: boolean
  error: string | null
  /** Document-save counter — triggers chat context recomputation. */
  docVersion: number
  /** Active combined view (or null — the regular editor). */
  combinedScope: CombinedScope | null
}

interface ProjectContextValue extends ProjectState {
  createProject: () => Promise<void>
  openProject: () => Promise<void>
  /** Open a project by a known path (drag-and-drop / association). */
  openProjectByPath: (path: string) => Promise<void>
  closeProject: () => void
  selectDocument: (nodeId: string) => void
  /** Save the manifest to disk and update the state. */
  saveManifest: (manifest: ProjectManifest) => Promise<void>
  /** Change the project's writing-area settings (saved to project.json). */
  updateSettings: (partial: Partial<ProjectSettings>) => Promise<void>
  clearError: () => void

  // Tree mutations (applied in main, return the updated manifest).
  createTreeNode: (parentId: string | null, type: NodeType) => Promise<string | null>
  renameTreeNode: (nodeId: string, title: string) => Promise<void>
  /** Move nodes to trash (with subtrees). */
  trashNodes: (nodeIds: string[]) => Promise<void>
  /** Restore a node from trash. */
  restoreFromTrash: (nodeId: string) => Promise<void>
  /** Permanently delete a trash item. */
  deleteFromTrash: (nodeId: string) => Promise<void>
  /** Empty the whole trash. */
  emptyTrash: () => Promise<void>
  moveTreeNode: (nodeId: string, newParentId: string | null, index: number) => Promise<void>
  duplicateTreeNode: (nodeId: string) => Promise<string | null>
  /** Restore the project from a snapshot (with a protective copy of the current state). */
  restoreBackup: (id: string) => Promise<void>
  /** Report a document save (triggers chat-context recomputation). */
  bumpDocVersion: () => void
  /** Open the combined view (everything/one folder as a single page). */
  showCombined: (scope: CombinedScope) => void
  /** Close the combined view. */
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
      // Restore the last open chapter if it still exists.
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
      // Snapshot on open (main decides based on settings).
      void window.api.backup.projectOpened(result.projectPath).catch(() => undefined)
    },
    []
  )

  // Restore the last project on startup.
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
        // The project may have been moved/deleted — forget it.
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

  // Open a project on OS request (.bookproj association / launch argument).
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
      // Reset the active document and flush pending autosaves BEFORE the
      // restore — otherwise the editor's debounce timer could fire after the
      // files are replaced and overwrite the restored state with old content.
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
    // Selecting a document exits the combined view.
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

  // The active document may be in the trash now — reset it if it left the tree.
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
    throw new Error('useProject must be used inside <ProjectProvider>')
  }
  return ctx
}
