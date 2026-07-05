import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannels, type AppApi } from '@shared/ipc-contract'
import type { AiStreamEvent } from '@shared/ai-types'
import type { ExportProgress } from '@shared/export-types'

/**
 * The renderer → main bridge. The only channel the UI has to main-process
 * capabilities. No direct Node/filesystem access from the renderer.
 */
const api: AppApi = {
  ping: () => ipcRenderer.invoke(IpcChannels.ping),
  project: {
    create: () => ipcRenderer.invoke(IpcChannels.projectCreate),
    open: () => ipcRenderer.invoke(IpcChannels.projectOpen),
    openPath: (projectPath) => ipcRenderer.invoke(IpcChannels.projectOpenPath, projectPath),
    save: (projectPath, manifest) =>
      ipcRenderer.invoke(IpcChannels.projectSave, projectPath, manifest),
    stats: (projectPath) => ipcRenderer.invoke(IpcChannels.projectStats, projectPath)
  },
  document: {
    load: (projectPath, nodeId) =>
      ipcRenderer.invoke(IpcChannels.documentLoad, projectPath, nodeId),
    save: (projectPath, nodeId, content) =>
      ipcRenderer.invoke(IpcChannels.documentSave, projectPath, nodeId, content)
  },
  tree: {
    create: (projectPath, parentId, type, title) =>
      ipcRenderer.invoke(IpcChannels.treeCreate, projectPath, parentId, type, title),
    rename: (projectPath, nodeId, title) =>
      ipcRenderer.invoke(IpcChannels.treeRename, projectPath, nodeId, title),
    remove: (projectPath, nodeId) =>
      ipcRenderer.invoke(IpcChannels.treeRemove, projectPath, nodeId),
    move: (projectPath, nodeId, newParentId, index) =>
      ipcRenderer.invoke(IpcChannels.treeMove, projectPath, nodeId, newParentId, index),
    duplicate: (projectPath, nodeId) =>
      ipcRenderer.invoke(IpcChannels.treeDuplicate, projectPath, nodeId)
  },
  trash: {
    move: (projectPath, nodeIds) => ipcRenderer.invoke(IpcChannels.trashMove, projectPath, nodeIds),
    restore: (projectPath, nodeId) =>
      ipcRenderer.invoke(IpcChannels.trashRestore, projectPath, nodeId),
    delete: (projectPath, nodeId) =>
      ipcRenderer.invoke(IpcChannels.trashDelete, projectPath, nodeId),
    empty: (projectPath) => ipcRenderer.invoke(IpcChannels.trashEmpty, projectPath)
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    set: (settings) => ipcRenderer.invoke(IpcChannels.settingsSet, settings)
  },
  backup: {
    projectOpened: (projectPath) =>
      ipcRenderer.invoke(IpcChannels.backupProjectOpened, projectPath),
    projectClosing: (projectPath) =>
      ipcRenderer.invoke(IpcChannels.backupProjectClosing, projectPath),
    snapshot: (projectPath, reason) =>
      ipcRenderer.invoke(IpcChannels.backupSnapshot, projectPath, reason),
    list: (projectPath) => ipcRenderer.invoke(IpcChannels.backupList, projectPath),
    restore: (projectPath, id) => ipcRenderer.invoke(IpcChannels.backupRestore, projectPath, id),
    delete: (projectPath, id) => ipcRenderer.invoke(IpcChannels.backupDelete, projectPath, id)
  },
  dialog: {
    pickDirectory: () => ipcRenderer.invoke(IpcChannels.dialogPickDirectory),
    openPath: (path) => ipcRenderer.invoke(IpcChannels.shellOpenPath, path)
  },
  export: {
    run: (projectPath, options) => ipcRenderer.invoke(IpcChannels.exportRun, projectPath, options),
    onProgress: (callback) => {
      const listener = (_e: unknown, progress: ExportProgress): void => callback(progress)
      ipcRenderer.on(IpcChannels.exportProgress, listener)
      return () => ipcRenderer.removeListener(IpcChannels.exportProgress, listener)
    }
  },
  app: {
    onOpenProject: (callback) => {
      const listener = (_e: unknown, projectPath: string): void => callback(projectPath)
      ipcRenderer.on(IpcChannels.appOpenProject, listener)
      return () => ipcRenderer.removeListener(IpcChannels.appOpenProject, listener)
    },
    onWillClose: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on(IpcChannels.appWillClose, listener)
      return () => ipcRenderer.removeListener(IpcChannels.appWillClose, listener)
    },
    closeReady: () => ipcRenderer.invoke(IpcChannels.appCloseReady)
  },
  ai: {
    storageAvailable: () => ipcRenderer.invoke(IpcChannels.aiStorageAvailable),
    keyStatus: (profileId) => ipcRenderer.invoke(IpcChannels.aiKeyStatus, profileId),
    setKey: (profileId, key) => ipcRenderer.invoke(IpcChannels.aiSetKey, profileId, key),
    deleteKey: (profileId) => ipcRenderer.invoke(IpcChannels.aiDeleteKey, profileId),
    test: (draft) => ipcRenderer.invoke(IpcChannels.aiTest, draft),
    listModels: (draft) => ipcRenderer.invoke(IpcChannels.aiListModels, draft),
    chat: (requestId, messages) => ipcRenderer.invoke(IpcChannels.aiChat, requestId, messages),
    abort: (requestId) => ipcRenderer.invoke(IpcChannels.aiAbort, requestId),
    improve: (requestId, text, instruction) =>
      ipcRenderer.invoke(IpcChannels.aiImprove, requestId, text, instruction),
    grammar: (requestId, text) => ipcRenderer.invoke(IpcChannels.aiGrammar, requestId, text),
    onStream: (callback) => {
      const listener = (_event: unknown, payload: AiStreamEvent): void => callback(payload)
      ipcRenderer.on(IpcChannels.aiStream, listener)
      return () => ipcRenderer.removeListener(IpcChannels.aiStream, listener)
    }
  },
  workspace: {
    loadChat: (projectPath) => ipcRenderer.invoke(IpcChannels.chatLoad, projectPath),
    saveChat: (projectPath, messages) =>
      ipcRenderer.invoke(IpcChannels.chatSave, projectPath, messages),
    loadSummaries: (projectPath) => ipcRenderer.invoke(IpcChannels.summariesLoad, projectPath),
    saveSummaries: (projectPath, summaries) =>
      ipcRenderer.invoke(IpcChannels.summariesSave, projectPath, summaries),
    loadNote: (projectPath, nodeId) => ipcRenderer.invoke(IpcChannels.noteLoad, projectPath, nodeId),
    saveNote: (projectPath, nodeId, text) =>
      ipcRenderer.invoke(IpcChannels.noteSave, projectPath, nodeId, text)
  },
  editor: {
    onAiAction: (callback) => {
      const listener = (_e: unknown, kind: 'rewrite' | 'grammar'): void => callback(kind)
      ipcRenderer.on(IpcChannels.editorAiAction, listener)
      return () => ipcRenderer.removeListener(IpcChannels.editorAiAction, listener)
    },
    listDictionary: () => ipcRenderer.invoke(IpcChannels.spellListWords),
    addToDictionary: (word) => ipcRenderer.invoke(IpcChannels.spellAddWord, word),
    removeFromDictionary: (word) => ipcRenderer.invoke(IpcChannels.spellRemoveWord, word),
    exportDictionary: () => ipcRenderer.invoke(IpcChannels.spellExportWords),
    importDictionary: () => ipcRenderer.invoke(IpcChannels.spellImportWords)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose API via contextBridge:', error)
  }
} else {
  // Fallback path (contextIsolation should always be enabled).
  // @ts-ignore — declared in src/preload/index.d.ts
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
