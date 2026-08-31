/**
 * Global application settings service.
 * Reads/writes app.getPath('userData')/settings.json (atomically).
 */

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  type AutoUpdateSettings,
  type BackupSettings,
  type GlobalSettings,
  type TypographySettings,
  DEFAULT_AUTO_UPDATE_SETTINGS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_TYPOGRAPHY_SETTINGS,
  SETTINGS_SCHEMA_VERSION
} from '@shared/settings-types'
import { type ProjectSettings, DEFAULT_PROJECT_SETTINGS } from '@shared/project-types'
import { type AiProfile, type AiSettings } from '@shared/ai-types'
import {
  type ExportMeta,
  type ExportPreset,
  type ExportStyle,
  DEFAULT_EXPORT_META,
  DEFAULT_EXPORT_STYLE
} from '@shared/export-types'
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

/** Normalize export metadata (all fields optional — empty is a valid value). */
function normalizeExportMeta(raw: Partial<ExportMeta> | undefined): ExportMeta {
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
  return {
    authorFirstName: text(raw?.authorFirstName),
    authorLastName: text(raw?.authorLastName),
    homePage: text(raw?.homePage),
    language: str(raw?.language, DEFAULT_EXPORT_META.language)
  }
}

/** Page margin in cm, clamped to something a printer can actually do. */
function margin(value: unknown, fallback: number): number {
  return Math.min(10, Math.max(0, num(value, fallback)))
}

/** Normalize export typography; null when nothing usable was stored. */
function normalizeExportStyle(raw: Partial<ExportStyle> | undefined | null): ExportStyle | null {
  if (!raw || typeof raw !== 'object') return null
  const d = DEFAULT_EXPORT_STYLE
  const mode = raw.chapterTitle
  return {
    fontFamily: str(raw.fontFamily, d.fontFamily),
    fontSizePt: Math.min(72, Math.max(6, num(raw.fontSizePt, d.fontSizePt))),
    lineHeight: Math.min(4, Math.max(1, num(raw.lineHeight, d.lineHeight))),
    spaceBeforePt: Math.min(72, Math.max(0, num(raw.spaceBeforePt, d.spaceBeforePt))),
    spaceAfterPt: Math.min(72, Math.max(0, num(raw.spaceAfterPt, d.spaceAfterPt))),
    justify: bool(raw.justify, d.justify),
    hyphenation: bool(raw.hyphenation, d.hyphenation),
    pageSize: raw.pageSize === 'a5' || raw.pageSize === 'letter' ? raw.pageSize : d.pageSize,
    margins: {
      top: margin(raw.margins?.top, d.margins.top),
      bottom: margin(raw.margins?.bottom, d.margins.bottom),
      left: margin(raw.margins?.left, d.margins.left),
      right: margin(raw.margins?.right, d.margins.right)
    },
    chapterTitle: mode === 'centered' || mode === 'none' ? mode : 'heading'
  }
}

/** Normalize saved export presets, dropping malformed entries. */
function normalizeExportPresets(raw: unknown): ExportPreset[] {
  if (!Array.isArray(raw)) return []
  const out: ExportPreset[] = []
  for (const item of raw as Array<Partial<ExportPreset>>) {
    const style = normalizeExportStyle(item?.style)
    if (typeof item?.id !== 'string' || !style) continue
    out.push({ id: item.id, name: str(item.name, 'Preset'), style })
  }
  return out
}

/** Normalize auto-update settings. */
function normalizeAutoUpdate(raw: Partial<AutoUpdateSettings> | undefined): AutoUpdateSettings {
  return { enabled: bool(raw?.enabled, DEFAULT_AUTO_UPDATE_SETTINGS.enabled) }
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
      typewriterMode: bool(inDefaults.typewriterMode, DEFAULT_PROJECT_SETTINGS.typewriterMode),
      notesFontSize: num(inDefaults.notesFontSize, DEFAULT_PROJECT_SETTINGS.notesFontSize)
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
    exportMeta: normalizeExportMeta(raw?.exportMeta),
    exportPresets: normalizeExportPresets(raw?.exportPresets),
    exportStyle: normalizeExportStyle(raw?.exportStyle),
    ai: normalizeAi(raw?.ai),
    autoUpdate: normalizeAutoUpdate(raw?.autoUpdate)
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
