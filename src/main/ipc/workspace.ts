/**
 * Project workspace data IPC: chat history and the chapter-summaries cache.
 */

import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import type { AiChatMessage } from '@shared/ai-types'
import {
  readChat,
  readNote,
  readSummaries,
  writeChat,
  writeNote,
  writeSummaries
} from '../services/storage'

export function registerWorkspaceIpc(): void {
  ipcMain.handle(IpcChannels.chatLoad, (_e, projectPath: string) => readChat(projectPath))
  ipcMain.handle(IpcChannels.chatSave, (_e, projectPath: string, messages: AiChatMessage[]) =>
    writeChat(projectPath, messages)
  )
  ipcMain.handle(IpcChannels.summariesLoad, (_e, projectPath: string) => readSummaries(projectPath))
  ipcMain.handle(
    IpcChannels.summariesSave,
    (_e, projectPath: string, summaries: Record<string, string>) =>
      writeSummaries(projectPath, summaries)
  )
  ipcMain.handle(IpcChannels.noteLoad, (_e, projectPath: string, nodeId: string) =>
    readNote(projectPath, nodeId)
  )
  ipcMain.handle(IpcChannels.noteSave, (_e, projectPath: string, nodeId: string, text: string) =>
    writeNote(projectPath, nodeId, text)
  )
}
