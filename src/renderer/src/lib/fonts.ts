import type { TranslationKey } from '@shared/i18n'

/** Writing-area font options (labels are localization keys). */
export const FONT_OPTIONS: ReadonlyArray<{ labelKey: TranslationKey; value: string }> = [
  { labelKey: 'fonts.georgiaSerif', value: 'Georgia, "Times New Roman", serif' },
  { labelKey: 'fonts.ptSerif', value: '"PT Serif", Georgia, serif' },
  { labelKey: 'fonts.systemSans', value: 'system-ui, -apple-system, sans-serif' },
  { labelKey: 'fonts.monospace', value: '"Courier New", monospace' }
]
