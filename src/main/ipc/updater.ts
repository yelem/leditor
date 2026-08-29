/**
 * Auto-update IPC handlers (update:appVersion/check/install).
 */

import { app, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import { checkForUpdates, quitAndInstall } from '../services/updater'

export function registerUpdateIpc(): void {
  ipcMain.handle(IpcChannels.updateAppVersion, () => app.getVersion())
  ipcMain.handle(IpcChannels.updateCheck, () => {
    checkForUpdates(true)
  })
  ipcMain.handle(IpcChannels.updateInstall, () => {
    quitAndInstall()
  })
}
