/**
 * Project export IPC (Word/FB2/EPUB).
 */

import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import type { ExportOptions, ExportResult } from '@shared/export-types'
import { exportProject } from '../services/export'
import { assertDirectory, assertProject } from '../services/allowed-paths'

export function registerExportIpc(): void {
  ipcMain.handle(
    IpcChannels.exportRun,
    (event, projectPath: string, options: ExportOptions): Promise<ExportResult> =>
      // The output folder only ever comes from dialog:pickDirectory, so it has
      // to be one main itself handed out.
      exportProject(
        assertProject(projectPath),
        { ...options, outputDir: assertDirectory(options.outputDir) },
        (done, total) =>
          event.sender.send(IpcChannels.exportProgress, { done, total })
      )
  )
}
