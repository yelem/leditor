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
import { tMain } from '../i18n'

function keysFilePath(): string {
  return join(app.getPath('userData'), 'ai-keys.bin')
}

async function readAll(): Promise<Record<string, string>> {
  if (!safeStorage.isEncryptionAvailable()) return {}
  try {
    const encrypted = await fs.readFile(keysFilePath())
    const json = safeStorage.decryptString(encrypted)
    return JSON.parse(json) as Record<string, string>
  } catch {
    return {}
  }
}

async function writeAll(map: Record<string, string>): Promise<void> {
  const encrypted = safeStorage.encryptString(JSON.stringify(map))
  // Atomic: a crash mid-write of a direct write would corrupt all keys at once.
  const target = keysFilePath()
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, encrypted)
  await fs.rename(tmp, target)
}

export function isKeyStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export async function setKey(profileId: string, key: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(tMain('main.errStorageUnavailable'))
  }
  const map = await readAll()
  if (key) map[profileId] = key
  else delete map[profileId]
  await writeAll(map)
}

export async function getKey(profileId: string): Promise<string | null> {
  const map = await readAll()
  return map[profileId] ?? null
}

export async function hasKey(profileId: string): Promise<boolean> {
  const map = await readAll()
  return typeof map[profileId] === 'string' && map[profileId].length > 0
}

export async function deleteKey(profileId: string): Promise<void> {
  const map = await readAll()
  if (profileId in map) {
    delete map[profileId]
    await writeAll(map)
  }
}
