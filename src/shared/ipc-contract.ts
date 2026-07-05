/**
 * The IPC contract between renderer and main.
 *
 * Declares channel names and the types of the public API exposed to the
 * renderer via preload (`window.api`). Both main and renderer reference
 * this file — the single source of truth for inter-process communication.
 */

import type {
  DocumentContent,
  NodeType,
  OpenProjectResult,
  ProjectManifest,
  ProjectStats
} from './project-types'
import type { GlobalSettings } from './settings-types'
import type { BackupInfo, BackupReason } from './backup-types'
import type {
  AiChatMessage,
  AiModelInfo,
  AiProfileDraft,
  AiStreamEvent,
  AiTestResult,
  GrammarEdit
} from './ai-types'
import type { ExportOptions, ExportProgress, ExportResult } from './export-types'

export const IpcChannels = {
  /** Renderer → main health check. Returns the string "pong". */
  ping: 'app:ping',

  /** Create a new project (location picker dialog). */
  projectCreate: 'project:create',
  /** Open an existing project (folder picker dialog). */
  projectOpen: 'project:open',
  /** Open a project by a known path (no dialog). */
  projectOpenPath: 'project:openPath',
  /** Save the project manifest. */
  projectSave: 'project:save',
  /** Word/character stats for the whole project. */
  projectStats: 'project:stats',

  /** Load document contents. */
  documentLoad: 'document:load',
  /** Save document contents. */
  documentSave: 'document:save',

  /** Create a tree node (folder/document). */
  treeCreate: 'tree:create',
  /** Rename a node. */
  treeRename: 'tree:rename',
  /** Remove a node (with its subtree). */
  treeRemove: 'tree:remove',
  /** Move/reorder a node. */
  treeMove: 'tree:move',
  /** Duplicate a node (with subtree and contents). */
  treeDuplicate: 'tree:duplicate',

  /** Move nodes to trash (with subtrees). */
  trashMove: 'trash:move',
  /** Restore a node from trash. */
  trashRestore: 'trash:restore',
  /** Permanently delete a trash item (with its files). */
  trashDelete: 'trash:delete',
  /** Empty the whole trash. */
  trashEmpty: 'trash:empty',

  /** Read global settings. */
  settingsGet: 'settings:get',
  /** Save global settings. */
  settingsSet: 'settings:set',

  /** Project opened (snapshot-on-open + current project tracking). */
  backupProjectOpened: 'backup:projectOpened',
  /** Project is closing (snapshot-on-close). */
  backupProjectClosing: 'backup:projectClosing',
  /** Take a snapshot (manual/interval). */
  backupSnapshot: 'backup:snapshot',
  /** List snapshots. */
  backupList: 'backup:list',
  /** Restore from a snapshot. */
  backupRestore: 'backup:restore',
  /** Delete a snapshot. */
  backupDelete: 'backup:delete',

  /** Pick a folder (native dialog). */
  dialogPickDirectory: 'dialog:pickDirectory',
  /** Open a path in the OS (folder/file). */
  shellOpenPath: 'shell:openPath',
  /** Export the project to the chosen format. */
  exportRun: 'export:run',
  /** Export progress (main → renderer). */
  exportProgress: 'export:progress',
  /** Request to open a project by path (double click/association/argument). */
  appOpenProject: 'app:openProject',
  /** Window is closing: renderer must flush unsaved changes (main → renderer). */
  appWillClose: 'app:willClose',
  /** Renderer confirmation: unsaved changes written, safe to close. */
  appCloseReady: 'app:closeReady',

  /** AI action on the selection, chosen in the context menu (main → renderer). */
  editorAiAction: 'editor:aiAction',
  /** Words of the custom dictionary. */
  spellListWords: 'spell:listWords',
  /** Add a word to the dictionary. */
  spellAddWord: 'spell:addWord',
  /** Remove a word from the dictionary. */
  spellRemoveWord: 'spell:removeWord',
  /** Export the custom dictionary to a file. */
  spellExportWords: 'spell:exportWords',
  /** Import words from a file into the dictionary. */
  spellImportWords: 'spell:importWords',

  /** Whether secure key storage is available. */
  aiStorageAvailable: 'ai:storageAvailable',
  /** Whether a key is set for the profile. */
  aiKeyStatus: 'ai:keyStatus',
  /** Save the profile key (into safeStorage). */
  aiSetKey: 'ai:setKey',
  /** Delete the profile key. */
  aiDeleteKey: 'ai:deleteKey',
  /** Test the connection using a profile draft. */
  aiTest: 'ai:test',
  /** List provider models using a draft. */
  aiListModels: 'ai:listModels',
  /** Chat with the active provider (streamed via events). */
  aiChat: 'ai:chat',
  /** Abort a chat request. */
  aiAbort: 'ai:abort',
  /** Improve text according to an instruction. */
  aiImprove: 'ai:improve',
  /** Check grammar/style (list of edits). */
  aiGrammar: 'ai:grammar',
  /** Chat streaming event channel (main → renderer). */
  aiStream: 'ai:stream',

  /** Load the project chat history. */
  chatLoad: 'workspace:chatLoad',
  /** Save the project chat history. */
  chatSave: 'workspace:chatSave',
  /** Load the chapter-summaries cache. */
  summariesLoad: 'workspace:summariesLoad',
  /** Save the chapter-summaries cache. */
  summariesSave: 'workspace:summariesSave',
  /** Load a chapter note. */
  noteLoad: 'workspace:noteLoad',
  /** Save a chapter note. */
  noteSave: 'workspace:noteSave'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

/** Project API (create/open/save). */
export interface ProjectApi {
  /** Opens a dialog and creates a project. null — the user cancelled. */
  create: () => Promise<OpenProjectResult | null>
  /** Opens a project-folder picker. null — the user cancelled. */
  open: () => Promise<OpenProjectResult | null>
  /** Opens a project by path (last-project restore, file association). */
  openPath: (projectPath: string) => Promise<OpenProjectResult>
  /** Saves the manifest; returns the updated manifest (with updatedAt). */
  save: (projectPath: string, manifest: ProjectManifest) => Promise<ProjectManifest>
  /** Words/characters across the project (sum over all documents). */
  stats: (projectPath: string) => Promise<ProjectStats>
}

/** Document API (chapter/scene texts). */
export interface DocumentApi {
  /** Document contents, or null if the file does not exist yet. */
  load: (projectPath: string, nodeId: string) => Promise<DocumentContent | null>
  /** Save document contents. */
  save: (projectPath: string, nodeId: string, content: DocumentContent) => Promise<void>
}

/** Result of a mutation that creates a new node. */
export interface CreateNodeResult {
  manifest: ProjectManifest
  nodeId: string
}

/** Global application settings API. */
export interface SettingsApi {
  get: () => Promise<GlobalSettings>
  set: (settings: GlobalSettings) => Promise<GlobalSettings>
}

/** Backup API. */
export interface BackupApi {
  /** Notify that a project was opened (snapshot-on-open). */
  projectOpened: (projectPath: string) => Promise<void>
  /** Notify that a project is closing (snapshot-on-close). */
  projectClosing: (projectPath: string) => Promise<void>
  /** Take a snapshot manually / on an interval. */
  snapshot: (projectPath: string, reason: BackupReason) => Promise<BackupInfo>
  /** List snapshots (newest first). */
  list: (projectPath: string) => Promise<BackupInfo[]>
  /** Restore from a snapshot; returns the restored manifest. */
  restore: (projectPath: string, id: string) => Promise<ProjectManifest>
  /** Delete a snapshot. */
  delete: (projectPath: string, id: string) => Promise<void>
}

/** General-purpose native dialogs. */
export interface DialogApi {
  /** Pick a folder. null — cancelled. */
  pickDirectory: () => Promise<string | null>
  /** Open a path (folder/file) in the OS. */
  openPath: (path: string) => Promise<void>
}

/** Project export API. */
export interface ExportApi {
  run: (projectPath: string, options: ExportOptions) => Promise<ExportResult>
  /** Subscribe to export progress. Returns an unsubscribe function. */
  onProgress: (callback: (progress: ExportProgress) => void) => () => void
}

/** System application events. */
export interface AppEventsApi {
  /** OS request to open a project by path (association/argument/second instance). */
  onOpenProject: (callback: (projectPath: string) => void) => () => void
  /** Window is closing: pending autosaves must be written immediately. */
  onWillClose: (callback: () => void) => () => void
  /** Tell main that unsaved changes are written — the window may close. */
  closeReady: () => Promise<void>
}

/** Editor link to the native context menu and dictionary. */
export interface EditorApi {
  /** Subscribe to AI actions from the context menu. Returns an unsubscribe function. */
  onAiAction: (callback: (kind: 'rewrite' | 'grammar') => void) => () => void
  /** Words of the custom dictionary. */
  listDictionary: () => Promise<string[]>
  /** Add a word to the dictionary. */
  addToDictionary: (word: string) => Promise<void>
  /** Remove a word from the dictionary. */
  removeFromDictionary: (word: string) => Promise<void>
  /** Export the dictionary to a chosen file. true — saved, false — cancelled. */
  exportDictionary: () => Promise<boolean>
  /** Import words from a chosen file. Returns the updated list. */
  importDictionary: () => Promise<string[]>
}

/** AI provider API. Keys live in main and are never passed to the renderer. */
export interface AiApi {
  /** Whether the system secure storage (for keys) is available. */
  storageAvailable: () => Promise<boolean>
  /** Whether a stored key exists for the profile. */
  keyStatus: (profileId: string) => Promise<boolean>
  /** Save/update the profile key. */
  setKey: (profileId: string, key: string) => Promise<void>
  /** Delete the profile key. */
  deleteKey: (profileId: string) => Promise<void>
  /** Test the connection with the entered profile parameters. */
  test: (draft: AiProfileDraft) => Promise<AiTestResult>
  /** List provider models with the entered parameters. */
  listModels: (draft: AiProfileDraft) => Promise<AiModelInfo[]>
  /** Chat request to the active provider; the reply streams via onStream. */
  chat: (requestId: string, messages: AiChatMessage[]) => Promise<string>
  /** Abort a chat request by requestId. */
  abort: (requestId: string) => Promise<void>
  /** Improve text per instruction (returns the new version). Cancellable by requestId. */
  improve: (requestId: string, text: string, instruction: string) => Promise<string>
  /** Check grammar/style (returns a list of edits). Cancellable by requestId. */
  grammar: (requestId: string, text: string) => Promise<GrammarEdit[]>
  /** Subscribe to chat streaming events. Returns an unsubscribe function. */
  onStream: (callback: (event: AiStreamEvent) => void) => () => void
}

/** Project workspace data API (chat history, summaries cache). */
export interface WorkspaceApi {
  loadChat: (projectPath: string) => Promise<AiChatMessage[]>
  saveChat: (projectPath: string, messages: AiChatMessage[]) => Promise<void>
  loadSummaries: (projectPath: string) => Promise<Record<string, string>>
  saveSummaries: (projectPath: string, summaries: Record<string, string>) => Promise<void>
  loadNote: (projectPath: string, nodeId: string) => Promise<string>
  saveNote: (projectPath: string, nodeId: string, text: string) => Promise<void>
}

/**
 * Project structure (tree) API. Every mutation is applied in main on top of
 * the domain model, persisted to disk, and returns the updated manifest.
 */
export interface TreeApi {
  /** Create a node inside parentId (null — root). */
  create: (
    projectPath: string,
    parentId: string | null,
    type: NodeType,
    title: string
  ) => Promise<CreateNodeResult>
  /** Rename a node. */
  rename: (projectPath: string, nodeId: string, title: string) => Promise<ProjectManifest>
  /** Remove a node and its subtree (with content files). */
  remove: (projectPath: string, nodeId: string) => Promise<ProjectManifest>
  /** Move a node into newParentId (null — root) at position index. */
  move: (
    projectPath: string,
    nodeId: string,
    newParentId: string | null,
    index: number
  ) => Promise<ProjectManifest>
  /** Duplicate a node (with subtree and a copy of contents). */
  duplicate: (projectPath: string, nodeId: string) => Promise<CreateNodeResult>
}

/**
 * Project trash API. Deletion moves nodes to trash (files remain);
 * files are actually erased only when deleted from the trash.
 */
export interface TrashApi {
  /** Move nodes (with subtrees) to trash. */
  move: (projectPath: string, nodeIds: string[]) => Promise<ProjectManifest>
  /** Restore a node from trash to its original place. */
  restore: (projectPath: string, nodeId: string) => Promise<ProjectManifest>
  /** Permanently delete a trash item (with its content files). */
  delete: (projectPath: string, nodeId: string) => Promise<ProjectManifest>
  /** Empty the whole trash. */
  empty: (projectPath: string) => Promise<ProjectManifest>
}

/**
 * The API surface available in the renderer as `window.api`.
 */
export interface AppApi {
  /** Health check of the link to the main process. */
  ping: () => Promise<string>
  project: ProjectApi
  document: DocumentApi
  tree: TreeApi
  trash: TrashApi
  settings: SettingsApi
  backup: BackupApi
  dialog: DialogApi
  ai: AiApi
  workspace: WorkspaceApi
  editor: EditorApi
  export: ExportApi
  app: AppEventsApi
}
