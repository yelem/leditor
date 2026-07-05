/** Project export types (Word / FB2 / EPUB). */

export type ExportFormat = 'docx' | 'fb2' | 'epub'

/**
 * Export granularity:
 *  - project    — the whole project as a single file;
 *  - perFolder  — each top-level folder (work) as a separate file;
 *  - perChapter — each chapter as a separate file;
 *  - current    — the current chapter only.
 */
export type ExportGranularity = 'project' | 'perFolder' | 'perChapter' | 'current'

export interface ExportOptions {
  format: ExportFormat
  granularity: ExportGranularity
  outputDir: string
  /** For granularity='current'. */
  currentDocId?: string
}

export interface ExportResult {
  files: string[]
}

/** Export progress (main → renderer). */
export interface ExportProgress {
  done: number
  total: number
}
