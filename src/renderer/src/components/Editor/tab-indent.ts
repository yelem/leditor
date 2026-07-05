import { Extension } from '@tiptap/core'

/**
 * Tab вставляет символ табуляции, Shift+Tab удаляет один таб перед курсором.
 * Внутри списков/задач отдаёт управление штатному поведению (отступ пунктов),
 * возвращая false.
 */
export const TabIndent = Extension.create({
  name: 'tabIndent',
  // Выше ListItem/TaskItem, чтобы наш обработчик пробовался первым.
  priority: 1000,

  addKeyboardShortcuts() {
    const inList = (): boolean =>
      this.editor.isActive('listItem') || this.editor.isActive('taskItem')

    return {
      Tab: () => {
        if (inList()) return false
        return this.editor.commands.insertContent('\t')
      },
      'Shift-Tab': () => {
        if (inList()) return false
        const { state } = this.editor
        const { from, empty } = state.selection
        if (empty && from > 0 && state.doc.textBetween(from - 1, from) === '\t') {
          return this.editor.commands.deleteRange({ from: from - 1, to: from })
        }
        // Предотвращаем потерю фокуса (переход по Tab), даже если удалять нечего.
        return true
      }
    }
  }
})
