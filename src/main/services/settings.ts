/**
 * Global application settings service.
 * Reads/writes app.getPath('userData')/settings.json (atomically).
 */

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  type BackupSettings,
  type GlobalSettings,
  type TypographySettings,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_TYPOGRAPHY_SETTINGS,
  SETTINGS_SCHEMA_VERSION
} from '@shared/settings-types'
import { type ProjectSettings, DEFAULT_PROJECT_SETTINGS } from '@shared/project-types'
import { type AiProfile, type AiSettings } from '@shared/ai-types'
import { type UiLanguage, UI_LANGUAGES } from '@shared/settings-types'
import { atomicWriteJson } from './storage'
import { setMainLanguage } from '../i18n'

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/** Normalize the set of AI profiles (no keys). */
function normalizeAi(raw: Partial<AiSettings> | undefined): AiSettings {
  const profilesIn = Array.isArray(raw?.profiles) ? raw.profiles : []
  const profiles: AiProfile[] = profilesIn
    .filter((p): p is AiProfile => typeof p?.id === 'string')
    .map((p) => ({
      id: p.id,
      name: str(p.name, 'Profile'),
      kind: p.kind === 'anthropic' ? 'anthropic' : 'openai',
      baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl : '',
      model: typeof p.model === 'string' ? p.model : ''
    }))
  const activeId = typeof raw?.activeProfileId === 'string' ? raw.activeProfileId : null
  const active = activeId && profiles.some((p) => p.id === activeId) ? activeId : null
  return { activeProfileId: active, profiles }
}

/** Normalize typography settings. */
function normalizeTypography(raw: Partial<TypographySettings> | undefined): TypographySettings {
  const d = DEFAULT_TYPOGRAPHY_SETTINGS
  const quotes =
    raw?.quotes === 'off' || raw?.quotes === 'guillemets' || raw?.quotes === 'german'
      ? raw.quotes
      : d.quotes
  return {
    quotes,
    dashes: bool(raw?.dashes, d.dashes),
    ellipsis: bool(raw?.ellipsis, d.ellipsis)
  }
}

/** Merge an arbitrary object with defaults, dropping invalid/extra fields. */
function normalize(raw: Partial<GlobalSettings> | undefined): GlobalSettings {
  const d = DEFAULT_GLOBAL_SETTINGS
  const inDefaults = (raw?.defaults ?? {}) as Partial<ProjectSettings>
  const inBackup = (raw?.backup ?? {}) as Partial<BackupSettings>
  const language: UiLanguage = UI_LANGUAGES.includes(raw?.language as UiLanguage)
    ? (raw?.language as UiLanguage)
    : 'en'
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    theme: raw?.theme === 'dark' ? 'dark' : 'light',
    language,
    defaults: {
      fontFamily: str(inDefaults.fontFamily, DEFAULT_PROJECT_SETTINGS.fontFamily),
      fontSize: num(inDefaults.fontSize, DEFAULT_PROJECT_SETTINGS.fontSize),
      lineHeight: num(inDefaults.lineHeight, DEFAULT_PROJECT_SETTINGS.lineHeight),
      editorWidth: num(inDefaults.editorWidth, DEFAULT_PROJECT_SETTINGS.editorWidth),
      typewriterMode: bool(inDefaults.typewriterMode, DEFAULT_PROJECT_SETTINGS.typewriterMode)
    },
    autosaveDelayMs: Math.max(100, num(raw?.autosaveDelayMs, d.autosaveDelayMs)),
    typography: normalizeTypography(raw?.typography),
    backup: {
      intervalMinutes: Math.max(0, num(inBackup.intervalMinutes, d.backup.intervalMinutes)),
      maxBackups: Math.max(1, num(inBackup.maxBackups, d.backup.maxBackups)),
      onOpen: bool(inBackup.onOpen, d.backup.onOpen),
      onClose: bool(inBackup.onClose, d.backup.onClose),
      customLocation:
        typeof inBackup.customLocation === 'string' ? inBackup.customLocation : ''
    },
    ai: normalizeAi(raw?.ai)
  }
}

/** Read global settings (or defaults if the file is missing/corrupted). */
export async function getSettings(): Promise<GlobalSettings> {
  try {
    const raw = await fs.readFile(settingsFilePath(), 'utf8')
    const settings = normalize(JSON.parse(raw) as Partial<GlobalSettings>)
    setMainLanguage(settings.language)
    return settings
  } catch {
    setMainLanguage(DEFAULT_GLOBAL_SETTINGS.language)
    return { ...DEFAULT_GLOBAL_SETTINGS }
  }
}

/** Save global settings (normalizing the input). Returns what was applied. */
export async function saveSettings(settings: GlobalSettings): Promise<GlobalSettings> {
  const normalized = normalize(settings)
  await atomicWriteJson(settingsFilePath(), normalized)
  setMainLanguage(normalized.language)
  return normalized
}
