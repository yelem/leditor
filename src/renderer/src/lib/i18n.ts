/**
 * Локализация в renderer. Язык берётся из глобальных настроек (SettingsProvider).
 *
 * useT() — хук для компонентов; tGlobal() — для мест вне React (например,
 * placeholder редактора), читает язык из модульного кэша, который обновляет
 * SettingsProvider через setRendererLanguage().
 */

import { useMemo } from 'react'
import type { UiLanguage } from '@shared/settings-types'
import { makeTranslator, translate, type TranslationKey, type Translator } from '@shared/i18n'
import { useSettings } from '@renderer/store'

let currentLanguage: UiLanguage = 'en'

/** Обновить язык для не-React потребителей (вызывает SettingsProvider). */
export function setRendererLanguage(lang: UiLanguage): void {
  currentLanguage = lang
}

/** Перевод вне React-компонентов (по текущему языку настроек). */
export function tGlobal(key: TranslationKey, vars?: Record<string, string | number>): string {
  return translate(currentLanguage, key, vars)
}

/** Хук перевода: возвращает t(key, vars) для текущего языка интерфейса. */
export function useT(): Translator {
  const { settings } = useSettings()
  return useMemo(() => makeTranslator(settings.language), [settings.language])
}

export type { TranslationKey, Translator }
