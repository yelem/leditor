/**
 * Глобальные настройки приложения (хранятся в app.getPath('userData')/settings.json).
 *
 * Отделены от настроек конкретного проекта (ProjectSettings в project.json):
 * глобальные `defaults` лишь задают стартовые значения поля для НОВЫХ проектов,
 * после чего каждый проект хранит и меняет свои настройки независимо.
 */

import { type ProjectSettings, DEFAULT_PROJECT_SETTINGS } from './project-types'
import { type AiSettings, DEFAULT_AI_SETTINGS } from './ai-types'

export const SETTINGS_SCHEMA_VERSION = 1

export type Theme = 'light' | 'dark'

/** Язык интерфейса. */
export type UiLanguage = 'en' | 'uk' | 'ru'

export const UI_LANGUAGES: UiLanguage[] = ['en', 'uk', 'ru']

/** Стиль умных кавычек: выключено / «ёлочки» / „лапки“. */
export type QuoteStyle = 'off' | 'guillemets' | 'german'

/** Умная типографика при наборе. */
export interface TypographySettings {
  /** Автозамена прямых кавычек на типографские выбранного стиля. */
  quotes: QuoteStyle
  /** «--» → «—» (длинное тире). */
  dashes: boolean
  /** «...» → «…» (многоточие). */
  ellipsis: boolean
}

/** Параметры резервного копирования. */
export interface BackupSettings {
  /** Интервал автоснапшота в минутах (0 — выключено). */
  intervalMinutes: number
  /** Максимум хранимых копий (ротация). */
  maxBackups: number
  /** Делать снапшот при открытии проекта. */
  onOpen: boolean
  /** Делать снапшот при закрытии проекта. */
  onClose: boolean
  /**
   * Папка для снапшотов. Пустая строка — внутри проекта (backups/).
   * Иначе снапшоты проекта кладутся в <customLocation>/<имя>-<хеш пути>.
   */
  customLocation: string
}

export interface GlobalSettings {
  schemaVersion: number
  theme: Theme
  /** Язык интерфейса (по умолчанию английский). */
  language: UiLanguage
  /** Значения поля письма по умолчанию для новых проектов. */
  defaults: ProjectSettings
  /** Задержка debounce-автосохранения текста, мс. */
  autosaveDelayMs: number
  /** Умная типографика при наборе. */
  typography: TypographySettings
  backup: BackupSettings
  /** Профили ИИ-провайдеров (без ключей; ключи — в safeStorage). */
  ai: AiSettings
}

export const DEFAULT_TYPOGRAPHY_SETTINGS: TypographySettings = {
  quotes: 'guillemets',
  dashes: true,
  ellipsis: true
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  intervalMinutes: 10,
  maxBackups: 20,
  onOpen: true,
  onClose: true,
  customLocation: ''
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  theme: 'light',
  language: 'en',
  defaults: { ...DEFAULT_PROJECT_SETTINGS },
  autosaveDelayMs: 600,
  typography: { ...DEFAULT_TYPOGRAPHY_SETTINGS },
  backup: { ...DEFAULT_BACKUP_SETTINGS },
  ai: { ...DEFAULT_AI_SETTINGS }
}
