/**
 * Electron wraps a rejection from an ipcMain handler into its own Error
 * ("Error invoking remote method 'x': Error: …"). Show only the message main
 * actually sent — the handlers speak the user's language, the wrapper does not.
 */
export function ipcErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const marker = raw.lastIndexOf('Error: ')
  return marker >= 0 ? raw.slice(marker + 'Error: '.length) : raw
}
