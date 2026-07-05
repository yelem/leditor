/** Типы резервного копирования. */

export type BackupReason = 'open' | 'close' | 'interval' | 'manual' | 'pre-restore'

/** Описание одного снапшота проекта (папка backups/<id>/). */
export interface BackupInfo {
  /** Имя папки снапшота (сортируемая метка времени). */
  id: string
  /** ISO-время создания. */
  createdAt: string
  /** Причина создания. */
  reason: BackupReason
  /** Число документов в снапшоте (для краткого просмотра). */
  documentCount: number
}
