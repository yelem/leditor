/**
 * Project export IPC (Word/FB2/EPUB).
 */

import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import type { ExportOptions, ExportResult } from '@shared/export-types'
import { exportProject } from '../services/export'

export function registerExportIpc(): void {
  ipcMain.handle(
    IpcChannels.exportRun,
    (event, projectPath: string, options: ExportOptions): Promise<ExportResult> =>
      exportProject(projectPath, options, (done, total) =>
        event.sender.send(IpcChannels.exportProgress, { done, total })
      )
  )
}
