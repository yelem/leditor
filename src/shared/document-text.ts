import type { DocumentContent, ProseMirrorNode, ProjectStats } from './project-types'

/**
 * Text extraction and word/character counting for a ProseMirror document.
 * Used in main for whole-project stats; usable from the renderer as well.
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

/** Extract flat document text (blocks separated by newlines). */
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

/** Words and characters of one document (characters exclude block separators). */
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
