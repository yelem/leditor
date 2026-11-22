import StarterKit from '@tiptap/starter-kit'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TextAlign } from '@tiptap/extension-text-align'
import { Highlight } from '@tiptap/extension-highlight'
import { Superscript } from '@tiptap/extension-superscript'
import { Subscript } from '@tiptap/extension-subscript'
import { HorizontalRule } from '@tiptap/extension-horizontal-rule'
import type { Extensions } from '@tiptap/react'
import { tGlobal } from '@renderer/lib/i18n'
import { TabIndent } from './tab-indent'
import { EmptySelectAll } from './empty-select-all'
import { InsertionMark, DeletionMark } from './suggestion-marks'
import { SearchHighlight } from './search-extension'
import { SmartTypography } from './typography'

// Scene break without auto-replacement on typing "***"/"---" (toolbar button only).
const SceneBreak = HorizontalRule.extend({
  addInputRules() {
    return []
  }
})

/**
 * Editor extension set: formatting, alignment, highlight, links,
 * super/subscript, task lists, tab handling.
 */
export const editorExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3], HTMLAttributes: { style: 'white-space: pre-wrap' } },
    paragraph: { HTMLAttributes: { style: 'white-space: pre-wrap' } },
    blockquote: { HTMLAttributes: { style: 'white-space: pre-wrap' } },
    horizontalRule: false,
    // Smaller edit-grouping delay: every typing pause starts a separate undo
    // step, so Ctrl+Z does not roll back a whole paragraph at once.
    undoRedo: { newGroupDelay: 200 },
    // Link and Underline are part of StarterKit since v3.
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener', target: '_blank', class: null }
    },
    // Not in the v2 editor: a forced empty paragraph after a closing list or
    // quote would change every saved chapter.
    trailingNode: false,
    // New in v3 StarterKit; changes Backspace/Delete at list item edges.
    // Kept off so list editing behaves exactly as before.
    listKeymap: false
  }),
  SceneBreak,
  Highlight,
  Superscript,
  Subscript,
  TaskList,
  TaskItem.configure({ nested: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  InsertionMark,
  DeletionMark,
  SearchHighlight,
  SmartTypography,
  TabIndent,
  EmptySelectAll,
  Placeholder.configure({ placeholder: () => tGlobal('editor.placeholder') }),
  CharacterCount
]
