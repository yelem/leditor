/**
 * The locations main is allowed to act on.
 *
 * Every path in the IPC contract arrives from the renderer. The renderer is
 * sandboxed and has no filesystem of its own, but if foreign code ever runs
 * there (a Chromium bug, a crafted paste) it would otherwise be able to make
 * main read, write or delete anywhere the user can — the project path is a
 * plain string and nothing checked where it pointed.
 *
 * So main remembers the places it handed out itself: projects it opened after
 * a successful manifest read, and folders the user picked in a native dialog.
 * Anything else is refused. The renderer never learns a path main has not
 * already given it, so no legitimate call is affected.
 */

import { resolve } from 'node:path'
import { tMain } from '../i18n'

/** Windows and macOS resolve paths case-insensitively; Linux does not. */
function normalize(target: string): string {
  const full = resolve(target)
  return process.platform === 'linux' ? full : full.toLowerCase()
}

// Both sets live for the lifetime of the process: a closed project may be
// reopened, and the export folder stays valid while the app runs.
const projects = new Set<string>()
const directories = new Set<string>()

/** Admit a project folder — call only after its manifest has been read. */
export function rememberProject(projectPath: string): void {
  projects.add(normalize(projectPath))
}

/** Admit a folder the user picked in a native dialog. */
export function rememberDirectory(directory: string): void {
  directories.add(normalize(directory))
}

/**
 * Guard for a project path from the renderer. Returns the path unchanged, so
 * it can wrap the argument at the call site: `withLock(assertProject(p), …)`.
 */
export function assertProject(projectPath: unknown): string {
  if (typeof projectPath !== 'string' || !projects.has(normalize(projectPath))) {
    throw new Error(tMain('main.errUnknownProject'))
  }
  return projectPath
}

/** Guard for a folder path from the renderer (export target, "open folder"). */
export function assertDirectory(directory: unknown): string {
  if (typeof directory !== 'string' || !directories.has(normalize(directory))) {
    throw new Error(tMain('main.errUnknownFolder'))
  }
  return directory
}
