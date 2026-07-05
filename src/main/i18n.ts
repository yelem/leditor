/**
 * Main-process localization (menus, dialogs, errors).
 * The language is cached from settings: the settings service calls
 * setMainLanguage() on every read/write of settings.json.
 */

import type { UiLanguage } from '@shared/settings-types'
import { translate, type TranslationKey } from '@shared/i18n'

let currentLanguage: UiLanguage = 'en'

export function setMainLanguage(lang: UiLanguage): void {
  currentLanguage = lang
}

export function tMain(key: TranslationKey, vars?: Record<string, string | number>): string {
  return translate(currentLanguage, key, vars)
}
