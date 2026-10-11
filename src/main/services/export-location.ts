/**
 * The folder each project last exported to, so the export dialog can offer it
 * again after a restart instead of asking every time.
 *
 * Kept apart from settings.json on purpose: settings are written by the
 * renderer, while a folder read back from here is admitted to allowed-paths
 * without a dialog. So only main ever writes this file, and only with a
 * folder an export has just succeeded in — one assertDirectory already
 * accepted, i.e. one the user picked in a native dialog.
 */

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { atomicWriteJson } from './storage'
import { rememberDirectory } from './allowed-paths'

interface ExportLocations {
  /** Folder of the most recent export from any project (fallback). */
  last: string
  /** Project path → folder of its most recent export. */
  projects: Record<string, string>
}

function locationsFilePath(): string {
  return join(app.getPath('userData'), 'export-locations.json')
}

async function readLocations(): Promise<ExportLocations> {
  try {
    const raw = JSON.parse(await fs.readFile(locationsFilePath(), 'utf8')) as Partial<ExportLocations>
    const projects: Record<string, string> = {}
    if (raw.projects && typeof raw.projects === 'object') {
      for (const [key, value] of Object.entries(raw.projects)) {
        if (typeof value === 'string' && value) projects[key] = value
      }
    }
    return { last: typeof raw.last === 'string' ? raw.last : '', projects }
  } catch {
    return { last: '', projects: {} }
  }
}

/** Record a successful export. `directory` must already have passed assertDirectory. */
export async function rememberExportLocation(projectPath: string, directory: string): Promise<void> {
  const locations = await readLocations()
  locations.last = directory
  locations.projects[resolve(projectPath)] = directory
  await atomicWriteJson(locationsFilePath(), locations)
}

/**
 * The folder to preselect for `projectPath`: its own last export folder, else
 * the last one used by any project. Admitted for export only while it still
 * exists as a folder; otherwise null and the user picks one as before.
 */
export async function recallExportLocation(projectPath: string): Promise<string | null> {
  const locations = await readLocations()
  for (const candidate of [locations.projects[resolve(projectPath)], locations.last]) {
    if (!candidate) continue
    const stat = await fs.stat(candidate).catch(() => null)
    if (!stat?.isDirectory()) continue
    rememberDirectory(candidate)
    return candidate
  }
  return null
}
