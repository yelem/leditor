/**
 * Global settings IPC handlers (settings:get/set).
 */

import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import type { GlobalSettings } from '@shared/settings-types'
import { getSettings, saveSettings, withSettingsLock } from '../services/settings'
import { forgetKeysOfChangedProfiles } from '../services/ai-keys'

export function registerSettingsIpc(): void {
  ipcMain.handle(IpcChannels.settingsGet, () => getSettings())

  ipcMain.handle(IpcChannels.settingsSet, (_event, incoming: GlobalSettings) =>
    withSettingsLock(async () => {
      const current = await getSettings()
      const requested = incoming && typeof incoming === 'object' ? incoming : current
      const saved = await saveSettings({
        ...requested,
        // The snapshots folder is main's to set (backup:pickLocation): main
        // writes and deletes there, so it must come from the user's own pick.
        backup: { ...requested.backup, customLocation: current.backup.customLocation }
      })
      await forgetKeysOfChangedProfiles(current.ai, saved.ai)
      return saved
    })
  )
}
