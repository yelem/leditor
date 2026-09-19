/**
 * IPC handlers for general-purpose native dialogs.
 */

import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { IpcChannels } from '@shared/ipc-contract'
import { assertDirectory, rememberDirectory } from '../services/allowed-paths'
import { tMain } from '../i18n'

export function registerDialogIpc(getWindow: () => BrowserWindow | null): void {
  /**
   * "Open the export folder". shell.openPath hands the path to the OS shell,
   * which on Windows *executes* an .exe/.bat/.lnk — so it may only ever see a
   * folder the user picked in the dialog below, and only while it really is a
   * folder (a path can be replaced between the pick and the click).
   */
  ipcMain.handle(IpcChannels.shellOpenPath, async (_e, path: string): Promise<void> => {
    const directory = assertDirectory(path)
    const stat = await fs.stat(directory).catch(() => null)
    if (!stat?.isDirectory()) throw new Error(tMain('main.errUnknownFolder'))
    await shell.openPath(directory)
  })

  ipcMain.handle(IpcChannels.dialogPickDirectory, async (): Promise<string | null> => {
    const win = getWindow()
    const options = {
      title: tMain('main.dlgPickFolder'),
      properties: ['openDirectory' as const, 'createDirectory' as const]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    // The user chose it, so main may write an export here and open it later.
    rememberDirectory(result.filePaths[0])
    return result.filePaths[0]
  })
}
