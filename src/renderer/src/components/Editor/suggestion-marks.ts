import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Suggested-edit marks (review mode):
 *  - insertion — a suggested insertion (underlined green);
 *  - deletion  — a suggested deletion (struck through red).
 * The sid attribute links both parts of one edit.
 */

export const InsertionMark = Mark.create({
  name: 'insertion',
  inclusive: false,
  addAttributes() {
    return { sid: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'ins[data-sid]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['ins', mergeAttributes(HTMLAttributes, { class: 'sg-ins' }), 0]
  }
})

export const DeletionMark = Mark.create({
  name: 'deletion',
  inclusive: false,
  addAttributes() {
    return { sid: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'del[data-sid]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['del', mergeAttributes(HTMLAttributes, { class: 'sg-del' }), 0]
  }
})
