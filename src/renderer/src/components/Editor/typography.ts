import { Extension, InputRule } from '@tiptap/core'
import type { TypographySettings } from '@shared/settings-types'
import { DEFAULT_TYPOGRAPHY_SETTINGS } from '@shared/settings-types'

/**
 * Умная типографика при наборе:
 *   — прямые кавычки → «ёлочки» или „лапки“ (по настройке);
 *   — «--» → «—» (длинное тире);
 *   — «...» → «…» (многоточие).
 *
 * Конфигурация живёт в module-level объекте: обработчики input-rule читают
 * его при каждом срабатывании, поэтому смена настроек применяется мгновенно,
 * без пересоздания редактора.
 */
const config: TypographySettings = { ...DEFAULT_TYPOGRAPHY_SETTINGS }

/** Обновить активную конфигурацию типографики (из глобальных настроек). */
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
 * Вставить типографскую кавычку вместо набранной прямой.
 *
 * Важно: набранная кавычка ещё НЕ в документе — input-rule срабатывает до
 * вставки. `range.to` — позиция курсора; вставляем замену ровно туда (пустой
 * диапазон), поэтому предшествующий текст (включая пробел из открывающего
 * правила) не затрагивается. Сама прямая кавычка при этом не печатается.
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
      // Длинное тире: «--» → «—».
      new InputRule({
        find: /--$/,
        handler: ({ state, range }) => {
          if (!config.dashes) return
          state.tr.insertText('—', range.from, range.to)
        }
      }),
      // Многоточие: «...» → «…».
      new InputRule({
        find: /\.\.\.$/,
        handler: ({ state, range }) => {
          if (!config.ellipsis) return
          state.tr.insertText('…', range.from, range.to)
        }
      }),
      // Открывающая двойная кавычка: в начале или после пробела/открывающего знака.
      new InputRule({
        find: /(?:^|[\s([{<«„“])"$/,
        handler: ({ state, range }) => replaceQuote(state, range, (s) => QUOTE_OPEN[s])
      }),
      // Закрывающая двойная кавычка: во всех прочих случаях.
      new InputRule({
        find: /"$/,
        handler: ({ state, range }) => replaceQuote(state, range, (s) => QUOTE_CLOSE[s])
      })
    ]
  }
})
