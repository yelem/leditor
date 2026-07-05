/**
 * Global application settings (stored in app.getPath('userData')/settings.json).
 *
 * Separate from per-project settings (ProjectSettings in project.json):
 * global `defaults` only seed the writing area of NEW projects, after which
 * every project keeps and changes its own settings independently.
 */

import { type ProjectSettings, DEFAULT_PROJECT_SETTINGS } from './project-types'
import { type AiSettings, DEFAULT_AI_SETTINGS } from './ai-types'

export const SETTINGS_SCHEMA_VERSION = 1

export type Theme = 'light' | 'dark'

/** Interface language. */
export type UiLanguage = 'en' | 'uk' | 'ru'

export const UI_LANGUAGES: UiLanguage[] = ['en', 'uk', 'ru']

/** Smart-quote style: off / «guillemets» / „German“. */
export type QuoteStyle = 'off' | 'guillemets' | 'german'

/** Smart typography while typing. */
export interface TypographySettings {
  /** Replace straight quotes with typographic ones of the chosen style. */
  quotes: QuoteStyle
  /** "--" → "—" (em dash). */
  dashes: boolean
  /** "..." → "…" (ellipsis). */
  ellipsis: boolean
}

/** Backup parameters. */
export interface BackupSettings {
  /** Auto-snapshot interval in minutes (0 — off). */
  intervalMinutes: number
  /** Maximum snapshots to keep (rotation). */
  maxBackups: number
  /** Snapshot when a project is opened. */
  onOpen: boolean
  /** Snapshot when a project is closed. */
  onClose: boolean
  /**
   * Snapshot folder. Empty string — inside the project (backups/).
   * Otherwise snapshots go to <customLocation>/<name>-<path hash>.
   */
  customLocation: string
}

export interface GlobalSettings {
  schemaVersion: number
  theme: Theme
  /** Interface language (English by default). */
  language: UiLanguage
  /** Default writing-area values for new projects. */
  defaults: ProjectSettings
  /** Debounced text autosave delay, ms. */
  autosaveDelayMs: number
  /** Smart typography while typing. */
  typography: TypographySettings
  backup: BackupSettings
  /** AI provider profiles (no keys; keys live in safeStorage). */
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
