/**
 * IPC-обработчики глобальных настроек (settings:get/set).
 */

import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import type { GlobalSettings } from '@shared/settings-types'
import { getSettings, saveSettings } from '../services/settings'

export function registerSettingsIpc(): void {
  ipcMain.handle(IpcChannels.settingsGet, () => getSettings())
  ipcMain.handle(IpcChannels.settingsSet, (_event, settings: GlobalSettings) =>
    saveSettings(settings)
  )
}
