import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { tGlobal } from '@renderer/lib/i18n'
import CharacterCount from '@tiptap/extension-character-count'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import type { Extensions } from '@tiptap/react'
import { TabIndent } from './tab-indent'
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
    heading: { levels: [1, 2, 3] },
    horizontalRule: false,
    // Smaller edit-grouping delay: every typing pause starts a separate undo
    // step, so Ctrl+Z does not roll back a whole paragraph at once.
    history: { newGroupDelay: 200 }
  }),
  SceneBreak,
  Underline,
  Highlight,
  Superscript,
  Subscript,
  Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  InsertionMark,
  DeletionMark,
  SearchHighlight,
  SmartTypography,
  TabIndent,
  Placeholder.configure({ placeholder: () => tGlobal('editor.placeholder') }),
  CharacterCount
]
