/** Типы экспорта проекта (Word / FB2 / EPUB). */

export type ExportFormat = 'docx' | 'fb2' | 'epub'

/**
 * Гранулярность экспорта:
 *  - project    — весь проект одним файлом;
 *  - perFolder  — каждая папка верхнего уровня («работа») отдельным файлом;
 *  - perChapter — каждая глава отдельным файлом;
 *  - current    — только текущая глава.
 */
export type ExportGranularity = 'project' | 'perFolder' | 'perChapter' | 'current'

export interface ExportOptions {
  format: ExportFormat
  granularity: ExportGranularity
  outputDir: string
  /** Для granularity='current'. */
  currentDocId?: string
}

export interface ExportResult {
  files: string[]
}

/** Прогресс экспорта (main → renderer). */
export interface ExportProgress {
  done: number
  total: number
}
