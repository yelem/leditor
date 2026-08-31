import { Extension } from '@tiptap/core'

/**
 * Ctrl/Cmd+A in an empty document builds an AllSelection over the single empty
 * paragraph. There is no text in it, but the browser still paints a stray
 * caret-sized selection block over the placeholder, which reads as selected
 * whitespace. Nothing is there to select, so the shortcut is a no-op instead;
 * in any non-empty document it falls through to the default Select All.
 */
export const EmptySelectAll = Extension.create({
  name: 'emptySelectAll',
  // Above StarterKit's base keymap so this handler is tried first.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      'Mod-a': () => this.editor.isEmpty
    }
  }
})
