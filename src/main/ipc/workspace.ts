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
import { assertProject } from '../services/allowed-paths'

export function registerWorkspaceIpc(): void {
  ipcMain.handle(IpcChannels.chatLoad, (_e, projectPath: string) =>
    readChat(assertProject(projectPath))
  )
  ipcMain.handle(IpcChannels.chatSave, (_e, projectPath: string, messages: AiChatMessage[]) =>
    writeChat(assertProject(projectPath), messages)
  )
  ipcMain.handle(IpcChannels.summariesLoad, (_e, projectPath: string) =>
    readSummaries(assertProject(projectPath))
  )
  ipcMain.handle(
    IpcChannels.summariesSave,
    (_e, projectPath: string, summaries: Record<string, string>) =>
      writeSummaries(assertProject(projectPath), summaries)
  )
  ipcMain.handle(IpcChannels.noteLoad, (_e, projectPath: string, nodeId: string) =>
    readNote(assertProject(projectPath), nodeId)
  )
  ipcMain.handle(IpcChannels.noteSave, (_e, projectPath: string, nodeId: string, text: string) =>
    writeNote(assertProject(projectPath), nodeId, text)
  )
}
