/** Project export types (Word / FB2 / EPUB). */

export type ExportFormat = 'docx' | 'fb2' | 'epub'

/**
 * Export granularity:
 *  - project    — the whole project as a single file;
 *  - perFolder  — each top-level folder (work) as a separate file;
 *  - perChapter — each chapter as a separate file;
 *  - current    — the current chapter only;
 *  - selection  — the nodes picked in the tree: every selected folder becomes
 *                 one file with its chapters, every selected chapter its own.
 */
export type ExportGranularity = 'project' | 'perFolder' | 'perChapter' | 'current' | 'selection'

/**
 * How a chapter title appears in the exported file:
 *  - heading  — a real Word/EPUB heading (shows up in the navigation pane);
 *  - centered — bold centered line of ordinary text;
 *  - none     — no title line at all (chapters are still split by page breaks).
 */
export type ChapterTitleMode = 'heading' | 'centered' | 'none'

/** Paper size of the exported Word file. */
export type PageSize = 'a4' | 'a5' | 'letter'

/** Page dimensions in millimeters. */
export const PAGE_SIZES_MM: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  letter: { width: 215.9, height: 279.4 }
}

/** Page margins in centimeters (Word only — EPUB margins belong to the reader). */
export interface PageMarginsCm {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Typography of the exported file (DOCX and EPUB; FB2 has no styling —
 * readers style it themselves). Defaults to the project's writing-area
 * settings, so an export looks like the editor unless changed in the dialog.
 */
export interface ExportStyle {
  /** CSS font stack, as stored in the project settings. */
  fontFamily: string
  /** Base text size in points (the editor stores pixels). */
  fontSizePt: number
  /** Line spacing multiplier. */
  lineHeight: number
  /** Space above each paragraph, in points (Word "Интервал → До"). */
  spaceBeforePt: number
  /** Space below each paragraph, in points (Word "Интервал → После"). */
  spaceAfterPt: number
  /**
   * Justify body text. Applies to paragraphs with no explicit alignment set
   * in the editor — those keep their own (left/center/right).
   */
  justify: boolean
  /**
   * Hyphenate the text. Without it justified prose in a narrow column (and
   * especially in a monospace font) stretches the spaces between words.
   */
  hyphenation: boolean
  /** Chapter title rendering. */
  chapterTitle: ChapterTitleMode
  /** Paper size (Word). */
  pageSize: PageSize
  /** Page margins in cm (Word). */
  margins: PageMarginsCm
}

/**
 * Author and book metadata written into every exported file (a "preset"):
 * FB2 <author>/<home-page>/<lang>, EPUB dc:creator/dc:language/dc:source,
 * Word document properties. Lives in the global settings.
 */
export interface ExportMeta {
  /** Author first name or pen name. */
  authorFirstName: string
  authorLastName: string
  /** Author link — FB2 <home-page>, EPUB <dc:source>. */
  homePage: string
  /** Book language code: FB2 <lang>, EPUB <dc:language>. */
  language: string
}

export const DEFAULT_EXPORT_META: ExportMeta = {
  authorFirstName: '',
  authorLastName: '',
  homePage: '',
  language: 'ru'
}

/**
 * Editor pixels → points (CSS: 1px = 0.75pt), rounded down to a whole point:
 * exported documents are set in integer sizes (18px → 13pt, not 13.5).
 */
export const pxToPt = (px: number): number => Math.max(6, Math.floor(px * 0.75))

/** Fallback typography when nothing else is known (settings normalization). */
export const DEFAULT_EXPORT_STYLE: ExportStyle = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSizePt: 13,
  lineHeight: 1.15,
  spaceBeforePt: 0,
  spaceAfterPt: 0,
  justify: true,
  hyphenation: true,
  chapterTitle: 'heading',
  pageSize: 'a4',
  margins: { top: 2, bottom: 2, left: 3, right: 1.5 }
}

/** A named, reusable set of export typography settings. */
export interface ExportPreset {
  id: string
  name: string
  style: ExportStyle
}

export interface ExportOptions {
  format: ExportFormat
  granularity: ExportGranularity
  outputDir: string
  /** For granularity='current'. */
  currentDocId?: string
  /** For granularity='selection': the tree nodes to export. */
  nodeIds?: string[]
  /** Typography of the output. Omitted — taken from the project settings. */
  style?: ExportStyle
}

export interface ExportResult {
  files: string[]
}

/** Export progress (main → renderer). */
export interface ExportProgress {
  done: number
  total: number
}
