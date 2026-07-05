/** Backup types. */

export type BackupReason = 'open' | 'close' | 'interval' | 'manual' | 'pre-restore'

/** One project snapshot (folder backups/<id>/). */
export interface BackupInfo {
  /** Snapshot folder name (sortable timestamp). */
  id: string
  /** ISO creation time. */
  createdAt: string
  /** Why the snapshot was created. */
  reason: BackupReason
  /** Number of documents in the snapshot (for quick overview). */
  documentCount: number
}
