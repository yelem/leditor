import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Марки предложенных правок (режим рецензирования):
 *  - insertion — предложенная вставка (подчёркнуто зелёным);
 *  - deletion  — предложенное удаление (зачёркнуто красным).
 * Атрибут sid связывает обе части одной правки.
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
