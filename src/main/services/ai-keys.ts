/**
 * Secure storage for AI API keys.
 *
 * Keys are encrypted with Electron safeStorage (the OS keychain) and stored
 * in userData/ai-keys.bin as an encrypted JSON object { profileId: key }.
 * Keys exist only in main and are never passed to the renderer.
 */

import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AiProfile, AiProviderKind, AiSettings } from '@shared/ai-types'
import { tMain } from '../i18n'

function keysFilePath(): string {
  return join(app.getPath('userData'), 'ai-keys.bin')
}

/** Profile ids are UUIDs; anything else (`__proto__` included) is refused. */
function safeProfileId(profileId: unknown): string {
  if (typeof profileId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(profileId)) {
    throw new Error(tMain('main.errBadProfileId', { id: JSON.stringify(profileId).slice(0, 80) }))
  }
  return profileId
}

async function readAll(): Promise<Record<string, string>> {
  if (!safeStorage.isEncryptionAvailable()) return {}
  try {
    const encrypted = await fs.readFile(keysFilePath())
    const json = safeStorage.decryptString(encrypted)
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

async function writeAll(map: Record<string, string>): Promise<void> {
  const encrypted = safeStorage.encryptString(JSON.stringify(map))
  // Atomic: a crash mid-write of a direct write would corrupt all keys at once.
  // Callers hold the settings lock, so the fixed temp name is never shared.
  const target = keysFilePath()
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, encrypted)
  await fs.rename(tmp, target)
}

export function isKeyStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export async function setKey(profileId: string, key: string): Promise<void> {
  const id = safeProfileId(profileId)
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(tMain('main.errStorageUnavailable'))
  }
  const map = await readAll()
  if (key) map[id] = key
  else delete map[id]
  await writeAll(map)
}

export async function getKey(profileId: string): Promise<string | null> {
  const id = safeProfileId(profileId)
  const map = await readAll()
  return Object.hasOwn(map, id) ? map[id] : null
}

export async function hasKey(profileId: string): Promise<boolean> {
  const key = await getKey(profileId)
  return typeof key === 'string' && key.length > 0
}

export async function deleteKey(profileId: string): Promise<void> {
  const id = safeProfileId(profileId)
  const map = await readAll()
  if (Object.hasOwn(map, id)) {
    delete map[id]
    await writeAll(map)
  }
}

/**
 * Would a stored key still go to the endpoint it was saved for? An anthropic
 * profile always talks to the official API (baseUrl unused); otherwise the
 * address must match, ignoring a trailing slash as the provider does.
 */
export function sameKeyEndpoint(
  saved: Pick<AiProfile, 'kind' | 'baseUrl'>,
  next: { kind: AiProviderKind; baseUrl?: string }
): boolean {
  if (saved.kind !== next.kind) return false
  if (next.kind === 'anthropic') return true
  const trim = (url: string): string => url.trim().replace(/\/+$/, '')
  return trim(saved.baseUrl) === trim(next.baseUrl ?? '')
}

/**
 * Drop the stored keys that a settings change would send somewhere else: a
 * profile whose endpoint changed, or one that is gone. The settings arrive
 * from the renderer, so without this a changed address on a saved profile
 * would quietly receive that profile's key on the next request.
 */
export async function forgetKeysOfChangedProfiles(
  before: AiSettings,
  after: AiSettings
): Promise<void> {
  for (const old of before.profiles) {
    const next = after.profiles.find((p) => p.id === old.id)
    if (!next || !sameKeyEndpoint(old, next)) {
      await deleteKey(old.id).catch(() => undefined)
    }
  }
}
