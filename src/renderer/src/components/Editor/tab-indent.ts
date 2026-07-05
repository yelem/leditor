import { Extension } from '@tiptap/core'

/**
 * Tab inserts a tab character; Shift+Tab removes one tab before the caret.
 * Inside lists/tasks it yields to the default behavior (item indentation)
 * by returning false.
 */
export const TabIndent = Extension.create({
  name: 'tabIndent',
  // Above ListItem/TaskItem so this handler is tried first.
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
        // Prevent focus loss (Tab navigation) even when there is nothing to delete.
        return true
      }
    }
  }
})
