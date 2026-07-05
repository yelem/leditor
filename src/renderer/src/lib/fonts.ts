import type { TranslationKey } from '@shared/i18n'

/** Варианты шрифта поля письма (подписи — ключи локализации). */
export const FONT_OPTIONS: ReadonlyArray<{ labelKey: TranslationKey; value: string }> = [
  { labelKey: 'fonts.georgiaSerif', value: 'Georgia, "Times New Roman", serif' },
  { labelKey: 'fonts.ptSerif', value: '"PT Serif", Georgia, serif' },
  { labelKey: 'fonts.systemSans', value: 'system-ui, -apple-system, sans-serif' },
  { labelKey: 'fonts.monospace', value: '"Courier New", monospace' }
]
