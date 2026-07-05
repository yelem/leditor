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

// Разрыв сцены без авто-замены при вводе «***»/«---» (только по кнопке тулбара).
const SceneBreak = HorizontalRule.extend({
  addInputRules() {
    return []
  }
})

/**
 * Набор расширений редактора — функционально повторяет «Simple editor» TipTap:
 * форматирование, выравнивание, выделение, ссылки, индексы, задачи, табуляция.
 */
export const editorExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    horizontalRule: false,
    // Меньшая задержка группировки правок: каждая пауза при наборе образует
    // отдельный шаг отмены, чтобы Ctrl+Z не откатывал сразу целый абзац.
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
