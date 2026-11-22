import { Fragment, type Node as PMNode, type Slice } from '@tiptap/pm/model'

/**
 * The text/plain flavor of a copy — what Notepad, a messenger or any app
 * without rich paste receives.
 *
 * tiptap's default serializer puts a blank-line separator before every block
 * node, containers included, so a list item (list → item → paragraph) came
 * out with a stack of empty lines around it and ordinary paragraphs with one
 * empty line between them. This one follows what Word puts on the clipboard:
 *   • one line per paragraph; an empty paragraph stays an empty line;
 *   • tabs inside the text are kept as they are;
 *   • list items start with their marker and a tab ("•\t", "1.\t", "☐\t"),
 *     nested levels one tab further in;
 *   • a line break inside a paragraph is a newline, a scene break is "***";
 *   • text marked as a suggested deletion is left out, as Word does with the
 *     html flavor of the same copy.
 */

const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList'])

function inlineText(nodes: Iterable<PMNode>): string {
  let text = ''
  for (const child of nodes) {
    if (child.isText) {
      if (!child.marks.some((m) => m.type.name === 'deletion')) text += child.text ?? ''
    } else if (child.type.name === 'hardBreak') {
      text += '\n'
    }
  }
  return text
}

const children = (node: PMNode | Fragment): PMNode[] => {
  const out: PMNode[] = []
  node.forEach((child) => out.push(child))
  return out
}

function marker(list: PMNode, index: number, item: PMNode): string {
  if (list.type.name === 'orderedList') return `${(Number(list.attrs.start) || 1) + index}.`
  if (list.type.name === 'taskList') return item.attrs.checked ? '☑' : '☐'
  return '•'
}

function serialize(fragment: Fragment, depth: number, lines: string[]): void {
  const indent = '\t'.repeat(depth)
  let inline: PMNode[] = []
  const flushInline = (): void => {
    if (inline.length > 0) lines.push(indent + inlineText(inline))
    inline = []
  }

  for (const node of children(fragment)) {
    if (node.isInline) {
      // A slice taken from inside one paragraph can hold bare inline content.
      inline.push(node)
      continue
    }
    flushInline()
    if (node.isTextblock) {
      lines.push(indent + inlineText(children(node)))
    } else if (LIST_TYPES.has(node.type.name)) {
      children(node).forEach((item, index) => {
        children(item).forEach((child, i) => {
          if (i === 0 && child.isTextblock) {
            lines.push(indent + marker(node, index, item) + '\t' + inlineText(children(child)))
          } else {
            // Nested lists and further paragraphs of the item: one level in.
            serialize(Fragment.from(child), depth + 1, lines)
          }
        })
      })
    } else if (node.type.name === 'horizontalRule') {
      lines.push(indent + '***')
    } else {
      // Blockquote and other containers: their blocks, at the same depth.
      serialize(node.content, depth, lines)
    }
  }
  flushInline()
}

export function sliceToPlainText(slice: Slice): string {
  const lines: string[] = []
  serialize(slice.content, 0, lines)
  return lines.join('\n')
}
