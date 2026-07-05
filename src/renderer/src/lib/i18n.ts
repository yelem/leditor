/**
 * Renderer localization. The language comes from global settings
 * (SettingsProvider).
 *
 * useT() — hook for components; tGlobal() — for places outside React (e.g.
 * the editor placeholder), reads the language from a module cache updated by
 * SettingsProvider via setRendererLanguage().
 */

import { useMemo } from 'react'
import type { UiLanguage } from '@shared/settings-types'
import { makeTranslator, translate, type TranslationKey, type Translator } from '@shared/i18n'
import { useSettings } from '@renderer/store'

let currentLanguage: UiLanguage = 'en'

/** Update the language for non-React consumers (called by SettingsProvider). */
export function setRendererLanguage(lang: UiLanguage): void {
  currentLanguage = lang
}

/** Translation outside React components (uses the current settings language). */
export function tGlobal(key: TranslationKey, vars?: Record<string, string | number>): string {
  return translate(currentLanguage, key, vars)
}

/** Translation hook: returns t(key, vars) for the current interface language. */
export function useT(): Translator {
  const { settings } = useSettings()
  return useMemo(() => makeTranslator(settings.language), [settings.language])
}

export type { TranslationKey, Translator }
