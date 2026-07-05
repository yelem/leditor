/**
 * IPC-обработчики резервного копирования.
 *
 * Жизненный цикл (открытие/закрытие) приходит из renderer, который знает
 * настройки. Дополнительно здесь отслеживается текущий открытый проект, чтобы
 * сделать снапшот при выходе из приложения (см. snapshotOnQuitIfNeeded).
 */

import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import type { BackupInfo, BackupReason } from '@shared/backup-types'
import type { ProjectManifest } from '@shared/project-types'
import { getSettings } from '../services/settings'
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from '../services/backup'
import { withLock } from '../services/lock'

let currentProjectPath: string | null = null

/** Снапшот под блокировкой проекта: не копируем файлы посреди мутации. */
function lockedSnapshot(
  projectPath: string,
  reason: BackupReason,
  maxBackups: number,
  customLocation: string
): Promise<BackupInfo> {
  return withLock(projectPath, () =>
    createSnapshot(projectPath, reason, maxBackups, customLocation)
  )
}

export function registerBackupIpc(): void {
  ipcMain.handle(IpcChannels.backupProjectOpened, async (_event, projectPath: string) => {
    currentProjectPath = projectPath
    const { backup } = await getSettings()
    if (backup.onOpen) {
      await lockedSnapshot(projectPath, 'open', backup.maxBackups, backup.customLocation)
    }
  })

  ipcMain.handle(IpcChannels.backupProjectClosing, async (_event, projectPath: string) => {
    const { backup } = await getSettings()
    if (backup.onClose) {
      await lockedSnapshot(projectPath, 'close', backup.maxBackups, backup.customLocation)
    }
    if (currentProjectPath === projectPath) currentProjectPath = null
  })

  ipcMain.handle(
    IpcChannels.backupSnapshot,
    async (_event, projectPath: string, reason: BackupReason): Promise<BackupInfo> => {
      const { backup } = await getSettings()
      return lockedSnapshot(projectPath, reason, backup.maxBackups, backup.customLocation)
    }
  )

  ipcMain.handle(IpcChannels.backupList, async (_event, projectPath: string): Promise<BackupInfo[]> => {
    const { backup } = await getSettings()
    return listSnapshots(projectPath, backup.customLocation)
  })

  ipcMain.handle(
    IpcChannels.backupRestore,
    async (_event, projectPath: string, id: string): Promise<ProjectManifest> => {
      const { backup } = await getSettings()
      return withLock(projectPath, () =>
        restoreSnapshot(projectPath, id, backup.maxBackups, backup.customLocation)
      )
    }
  )

  ipcMain.handle(IpcChannels.backupDelete, async (_event, projectPath: string, id: string) => {
    const { backup } = await getSettings()
    return deleteSnapshot(projectPath, id, backup.customLocation)
  })
}

/**
 * Снапшот текущего проекта при выходе из приложения (если включено в настройках).
 * Ограничен таймаутом: выход не должен подвисать из-за долгого бэкапа большого
 * проекта (медленный диск, антивирус) — это задерживало бы освобождение процесса.
 */
export async function snapshotOnQuitIfNeeded(timeoutMs = 4000): Promise<void> {
  const path = currentProjectPath
  if (!path) return
  currentProjectPath = null
  try {
    const { backup } = await getSettings()
    if (!backup.onClose) return
    const snapshot = lockedSnapshot(path, 'close', backup.maxBackups, backup.customLocation)
    await Promise.race([
      snapshot,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ])
  } catch {
    /* при выходе ошибки бэкапа игнорируем */
  }
}
