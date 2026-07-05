/**
 * IPC-обработчики нативных диалогов общего назначения.
 */

import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import { tMain } from '../i18n'

export function registerDialogIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IpcChannels.shellOpenPath, async (_e, path: string): Promise<void> => {
    await shell.openPath(path)
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
    return result.filePaths[0]
  })
}
