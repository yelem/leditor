/**
 * Project domain-model types.
 *
 * These types are the single source of truth for main and renderer. The tree
 * stores only structure and titles; texts live in separate content/<id>.json files.
 */

export const SCHEMA_VERSION = 1

/** Project folder extension. */
export const PROJECT_EXTENSION = '.bookproj'

/** File and subfolder names inside the project folder. */
export const MANIFEST_FILENAME = 'project.json'
export const CONTENT_DIRNAME = 'content'
export const NOTES_DIRNAME = 'notes'
export const BACKUPS_DIRNAME = 'backups'

export type NodeType = 'folder' | 'document'

/** Project tree node (folder or document). */
export interface TreeNode {
  id: string
  type: NodeType
  title: string
  children: TreeNode[]
}

/** Writing-area settings specific to the project. */
export interface ProjectSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  editorWidth: number
  typewriterMode: boolean
}

/**
 * Trash item: a deleted subtree remembering its original location,
 * so the node can be restored to where it was deleted from.
 */
export interface TrashItem {
  /** The whole deleted subtree (same ids as before deletion). */
  node: TreeNode
  /** Original parent at deletion time (null — root). */
  parentId: string | null
  /** Original index among siblings at deletion time. */
  index: number
  /** When deleted (ISO). */
  deletedAt: string
}

/** Project manifest — the contents of project.json. */
export interface ProjectManifest {
  schemaVersion: number
  title: string
  createdAt: string
  updatedAt: string
  tree: TreeNode[]
  /** Trash: deleted nodes available for restoration. */
  trash: TrashItem[]
  settings: ProjectSettings
}

/**
 * TipTap/ProseMirror document node (minimal typing).
 * The storage format is fixed here; the full node tree is produced by TipTap.
 */
export interface ProseMirrorNode {
  type: string
  attrs?: Record<string, unknown>
  content?: ProseMirrorNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

/** Contents of one document — a serialized ProseMirror document. */
export interface DocumentContent {
  type: 'doc'
  content: ProseMirrorNode[]
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  fontFamily: 'Georgia',
  fontSize: 18,
  lineHeight: 1.6,
  editorWidth: 700,
  typewriterMode: false
}

/** Empty document — a single paragraph. */
export function createEmptyDocument(): DocumentContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/** Result of opening/creating a project, returned from main to the renderer. */
export interface OpenProjectResult {
  projectPath: string
  manifest: ProjectManifest
}

/** Word and character counter. */
export interface ProjectStats {
  words: number
  chars: number
}
