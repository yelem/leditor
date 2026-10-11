/**
 * Project export IPC (Word/FB2/EPUB).
 */

import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import type { ExportOptions, ExportResult } from '@shared/export-types'
import { exportProject } from '../services/export'
import { assertDirectory, assertProject } from '../services/allowed-paths'
import { recallExportLocation, rememberExportLocation } from '../services/export-location'

export function registerExportIpc(): void {
  ipcMain.handle(
    IpcChannels.exportRun,
    async (event, projectPath: string, options: ExportOptions): Promise<ExportResult> => {
      // The output folder only ever comes from dialog:pickDirectory (or
      // export:lastDir, which re-admits a folder an earlier export used), so
      // it has to be one main itself handed out.
      const project = assertProject(projectPath)
      const outputDir = assertDirectory(options.outputDir)
      const result = await exportProject(project, { ...options, outputDir }, (done, total) =>
        event.sender.send(IpcChannels.exportProgress, { done, total })
      )
      // Failing to remember the folder must not turn a finished export into an error.
      await rememberExportLocation(project, outputDir).catch(() => undefined)
      return result
    }
  )

  ipcMain.handle(IpcChannels.exportLastDir, (_event, projectPath: string): Promise<string | null> =>
    recallExportLocation(assertProject(projectPath))
  )
}
