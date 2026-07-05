/**
 * Типы доменной модели проекта.
 *
 * Эти типы — единый источник правды для main и renderer. Дерево хранит только
 * структуру и заголовки; тексты лежат отдельными файлами content/<id>.json.
 */

export const SCHEMA_VERSION = 1

/** Расширение папки проекта. */
export const PROJECT_EXTENSION = '.bookproj'

/** Имена файлов и подпапок внутри папки проекта. */
export const MANIFEST_FILENAME = 'project.json'
export const CONTENT_DIRNAME = 'content'
export const NOTES_DIRNAME = 'notes'
export const BACKUPS_DIRNAME = 'backups'

export type NodeType = 'folder' | 'document'

/** Узел дерева проекта (папка или документ). */
export interface TreeNode {
  id: string
  type: NodeType
  title: string
  children: TreeNode[]
}

/** Настройки поля письма, специфичные для проекта. */
export interface ProjectSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  editorWidth: number
  typewriterMode: boolean
}

/**
 * Элемент корзины: удалённое поддерево с памятью об исходном месте,
 * чтобы можно было восстановить узел туда, откуда он был удалён.
 */
export interface TrashItem {
  /** Удалённое поддерево целиком (с тем же id, что и до удаления). */
  node: TreeNode
  /** Исходный родитель (null — корень) на момент удаления. */
  parentId: string | null
  /** Исходный индекс среди соседей на момент удаления. */
  index: number
  /** Когда удалён (ISO). */
  deletedAt: string
}

/** Манифест проекта — содержимое project.json. */
export interface ProjectManifest {
  schemaVersion: number
  title: string
  createdAt: string
  updatedAt: string
  tree: TreeNode[]
  /** Корзина: удалённые узлы, доступные для восстановления. */
  trash: TrashItem[]
  settings: ProjectSettings
}

/**
 * Узел документа TipTap/ProseMirror (минимальная типизация).
 * Полное дерево узлов появляется при интеграции TipTap на этапе 4,
 * но формат хранения фиксируется уже сейчас.
 */
export interface ProseMirrorNode {
  type: string
  attrs?: Record<string, unknown>
  content?: ProseMirrorNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

/** Содержимое одного документа — сериализованный ProseMirror-документ. */
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

/** Пустой документ — один абзац. */
export function createEmptyDocument(): DocumentContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/** Результат открытия/создания проекта, возвращаемый из main в renderer. */
export interface OpenProjectResult {
  projectPath: string
  manifest: ProjectManifest
}

/** Счётчик слов и символов. */
export interface ProjectStats {
  words: number
  chars: number
}
