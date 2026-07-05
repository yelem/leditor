import type { DocumentContent, ProseMirrorNode, ProjectStats } from './project-types'

/**
 * Извлечение текста и подсчёт слов/символов из ProseMirror-документа.
 * Используется в main для статистики всего проекта и может применяться в renderer.
 */

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule'
])

/** Извлечь плоский текст документа (блоки разделены переводами строк). */
export function documentToText(content: DocumentContent): string {
  const parts: string[] = []
  const walk = (nodes: ProseMirrorNode[]): void => {
    for (const node of nodes) {
      if (typeof node.text === 'string') parts.push(node.text)
      if (node.content) walk(node.content)
      if (BLOCK_TYPES.has(node.type)) parts.push('\n')
    }
  }
  walk(content.content ?? [])
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** Слова и символы одного документа (символы — без учёта разделителей блоков). */
export function countDocument(content: DocumentContent): ProjectStats {
  let chars = 0
  const parts: string[] = []

  const walk = (nodes: ProseMirrorNode[]): void => {
    for (const node of nodes) {
      if (typeof node.text === 'string') {
        chars += node.text.length
        parts.push(node.text)
      }
      if (node.content) walk(node.content)
      if (BLOCK_TYPES.has(node.type)) parts.push('\n')
    }
  }
  walk(content.content ?? [])

  const trimmed = parts.join('').trim()
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length
  return { words, chars }
}
