import { Extension, InputRule } from '@tiptap/core'
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
 * Important: the typed quote is NOT in the document yet — the input rule fires
 * before insertion. `range.to` is the caret position; the replacement goes
 * exactly there (an empty range), so the preceding text (including the space
 * from the opening rule) is untouched. The straight quote itself never prints.
 */
function replaceQuote(
  state: import('@tiptap/pm/state').EditorState,
  range: { from: number; to: number },
  pick: (style: 'guillemets' | 'german') => string
): void {
  if (config.quotes === 'off') return
  state.tr.insertText(pick(config.quotes), range.to, range.to)
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
        handler: ({ state, range }) => replaceQuote(state, range, (s) => QUOTE_OPEN[s])
      }),
      // Closing double quote: in all other cases.
      new InputRule({
        find: /"$/,
        handler: ({ state, range }) => replaceQuote(state, range, (s) => QUOTE_CLOSE[s])
      })
    ]
  }
})
