import { Extension, InputRule } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { TypographySettings } from '@shared/settings-types'
import { DEFAULT_TYPOGRAPHY_SETTINGS } from '@shared/settings-types'

/**
 * Smart typography while typing:
 *   — straight quotes → «guillemets» or „German“ (per setting);
 *   — "--" → "—" (em dash);
 *   — "..." → "…" (ellipsis).
 *
 * The configuration lives in a module-level object: input-rule handlers read
 * it on every trigger, so setting changes apply instantly without recreating
 * the editor.
 */
const config: TypographySettings = { ...DEFAULT_TYPOGRAPHY_SETTINGS }

/** Update the active typography configuration (from global settings). */
export function setTypographyConfig(next: TypographySettings): void {
  config.quotes = next.quotes
  config.dashes = next.dashes
  config.ellipsis = next.ellipsis
}

const QUOTE_OPEN: Record<'guillemets' | 'german', string> = {
  guillemets: '«',
  german: '„'
}
const QUOTE_CLOSE: Record<'guillemets' | 'german', string> = {
  guillemets: '»',
  german: '“'
}

/**
 * Insert a typographic quote in place of the typed straight one.
 *
 * The typed input is NOT in the document yet — the input rule fires before
 * insertion, and the rule is responsible for writing it. Details that matter:
 *
 *   • `match.input` is NOT the typed text: tiptap matches against the text of
 *     the paragraph before the caret (up to 500 characters) plus the input,
 *     so `match.input` is that whole run. Writing it back would retype the
 *     paragraph as plain text and strip its bold/italic — the rule may only
 *     touch the typed characters. They are the tail of `match[0]`.
 *   • `range` spans the whole match, and the opening rule matches one leading
 *     context character (a space or a bracket) that is usually already in the
 *     document and must stay. tiptap sets `range.from` to the insertion point
 *     minus the part of the match that is already in the document, so the
 *     typed length is the match length minus that part. The insertion point is
 *     the start of the selection being typed over, or the caret.
 *   • `range.to` is the end of the text being replaced: the caret when nothing
 *     is selected, the end of the selection when the user types over one. The
 *     whole range has to be replaced, otherwise the selected text survives and
 *     the quote is merely appended to it.
 */
function replaceQuote(
  state: import('@tiptap/pm/state').EditorState,
  range: { from: number; to: number },
  match: RegExpMatchArray,
  pick: (style: 'guillemets' | 'german') => string
): void {
  if (config.quotes === 'off') return
  const matched = match[0]
  const sel = state.selection
  const insertAt = sel.to === range.to && sel.from >= range.from ? sel.from : range.to
  let typedLength = matched.length - (insertAt - range.from)
  if (typedLength < 1 || typedLength > matched.length) typedLength = 1
  const from = range.from + matched.length - typedLength
  if (from > range.to) return
  // Everything typed, with the trailing straight quote swapped for the
  // typographic one — the straight quote itself never reaches the document.
  const inserted = matched.slice(matched.length - typedLength, -1) + pick(config.quotes)
  const tr = state.tr
  tr.insertText(inserted, from, range.to)
  // Replacing a non-empty range maps the old selection onto the inserted text,
  // leaving it selected — the next keystroke would wipe it out. Typing must
  // continue after the quote, so place the caret there explicitly.
  //
  // The position is taken from the transaction's own mapping rather than
  // computed as `from + inserted.length`: `insertText` goes through
  // `replaceRange`, which is free to widen or narrow the replaced range (it
  // does when the selection spans block boundaries), and only the mapping
  // knows where the end of the replacement actually landed.
  const after = tr.mapping.map(range.to)
  tr.setSelection(TextSelection.near(tr.doc.resolve(after), -1))
}

export const SmartTypography = Extension.create({
  name: 'smartTypography',

  addInputRules() {
    return [
      // Em dash: "--" → "—".
      new InputRule({
        find: /--$/,
        handler: ({ state, range }) => {
          if (!config.dashes) return
          state.tr.insertText('—', range.from, range.to)
        }
      }),
      // Ellipsis: "..." → "…".
      new InputRule({
        find: /\.\.\.$/,
        handler: ({ state, range }) => {
          if (!config.ellipsis) return
          state.tr.insertText('…', range.from, range.to)
        }
      }),
      // Opening double quote: at the start or after a space/opening character.
      new InputRule({
        find: /(?:^|[\s([{<«„“])"$/,
        handler: ({ state, range, match }) =>
          replaceQuote(state, range, match, (s) => QUOTE_OPEN[s])
      }),
      // Closing double quote: in all other cases.
      new InputRule({
        find: /"$/,
        handler: ({ state, range, match }) =>
          replaceQuote(state, range, match, (s) => QUOTE_CLOSE[s])
      })
    ]
  }
})
