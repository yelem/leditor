/**
 * ProseMirror-document converters for the export formats: DOCX, FB2, EPUB.
 * Cover ordinary prose: paragraphs, headings, lists, quotes, scene breaks,
 * bold/italic/underline/strikethrough/code/links.
 */

import { randomUUID } from 'node:crypto'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  HeadingLevel,
  AlignmentType,
  LineRuleType,
  convertMillimetersToTwip
} from 'docx'
import JSZip from 'jszip'
import type { DocumentContent, ProseMirrorNode } from '@shared/project-types'
import { type ExportMeta, type ExportStyle, PAGE_SIZES_MM } from '@shared/export-types'

export interface ExportSection {
  title: string
  content: DocumentContent
}
export interface ExportUnit {
  title: string
  sections: ExportSection[]
}

/** Fallback family per CSS generic, when the stack starts with one. */
const GENERIC_FONTS: Record<string, string> = {
  serif: 'Times New Roman',
  'sans-serif': 'Arial',
  'system-ui': 'Arial',
  '-apple-system': 'Arial',
  monospace: 'Courier New',
  cursive: 'Comic Sans MS',
  fantasy: 'Arial'
}

/** First real family of a CSS stack — Word wants one name, not a fallback list. */
function primaryFont(cssStack: string): string {
  for (const part of cssStack.split(',')) {
    const name = part.trim().replace(/^["']|["']$/g, '')
    if (!name) continue
    const generic = GENERIC_FONTS[name.toLowerCase()]
    if (!generic) return name
  }
  const first = cssStack.split(',')[0]?.trim().toLowerCase() ?? ''
  return GENERIC_FONTS[first] ?? 'Times New Roman'
}

/** Strip characters that would break out of a CSS declaration. */
const cssSafe = (value: string): string => value.replace(/[{}<>;]/g, '')

interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  code?: boolean
  href?: string
  br?: boolean
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string): string => esc(s).replace(/"/g, '&quot;')

/** Extract inline fragments from block content. */
function inlineRuns(nodes?: ProseMirrorNode[]): Run[] {
  const runs: Run[] = []
  const walk = (ns: ProseMirrorNode[]): void => {
    for (const n of ns) {
      if (n.type === 'hardBreak') {
        runs.push({ text: '', br: true })
        continue
      }
      if (typeof n.text === 'string') {
        const run: Run = { text: n.text }
        let dropped = false
        for (const m of n.marks ?? []) {
          if (m.type === 'bold') run.bold = true
          else if (m.type === 'italic') run.italic = true
          else if (m.type === 'underline') run.underline = true
          else if (m.type === 'strike') run.strike = true
          else if (m.type === 'code') run.code = true
          else if (m.type === 'link') run.href = m.attrs?.href as string
          else if (m.type === 'deletion') dropped = true // suggested deletions are not exported
        }
        if (!dropped && run.text) runs.push(run)
      }
      if (n.content) walk(n.content)
    }
  }
  walk(nodes ?? [])
  return runs
}

/**
 * A first-line indent ("красная строка") is typed in the editor as leading
 * tab characters. Exported as literal tabs they become a stray tab character
 * instead of a paragraph indent, so they are stripped off the text here and
 * re-applied as a real first-line indent by each format.
 */
const INDENT_CM_PER_TAB = 1.25
const INDENT_MM_PER_TAB = INDENT_CM_PER_TAB * 10

/** Split leading tabs off the runs: they encode the first-line indent. */
function takeIndent(runs: Run[]): { tabs: number; runs: Run[] } {
  let tabs = 0
  const rest = [...runs]
  while (rest.length > 0) {
    const first = rest[0]
    if (first.br) break
    const match = /^	+/.exec(first.text)
    if (!match) break
    tabs += match[0].length
    const text = first.text.slice(match[0].length)
    if (text) {
      rest[0] = { ...first, text }
      break
    }
    rest.shift()
  }
  return { tabs, runs: rest }
}

/** Runs of a block with its leading tabs turned into an indent value. */
const indentedRuns = (nodes?: ProseMirrorNode[]): { tabs: number; runs: Run[] } =>
  takeIndent(inlineRuns(nodes))

/** Explicit alignment set in the editor (TextAlign extension), if any. */
function blockAlign(node: ProseMirrorNode): 'left' | 'center' | 'right' | 'justify' | null {
  const value = node.attrs?.textAlign
  return value === 'left' || value === 'center' || value === 'right' || value === 'justify'
    ? value
    : null
}

/** Inline style for a block: first-line indent + alignment. */
function blockStyle(node: ProseMirrorNode, tabs: number): string {
  const parts: string[] = []
  if (tabs > 0) parts.push(`text-indent:${(INDENT_CM_PER_TAB * tabs).toFixed(2)}cm`)
  const align = blockAlign(node)
  if (align) parts.push(`text-align:${align}`)
  return parts.length > 0 ? ` style="${parts.join(';')}"` : ''
}

const headingLevel = (n: ProseMirrorNode): number =>
  Math.min(3, Math.max(1, Number(n.attrs?.level ?? 1)))

const codeText = (n: ProseMirrorNode): string =>
  (n.content ?? []).map((c) => c.text ?? '').join('')

// ---------- XHTML (for EPUB) ----------

function xhtmlInline(runs: Run[]): string {
  return runs
    .map((r) => {
      if (r.br) return '<br/>'
      let t = esc(r.text)
      if (r.code) t = `<code>${t}</code>`
      if (r.strike) t = `<s>${t}</s>`
      if (r.underline) t = `<u>${t}</u>`
      if (r.italic) t = `<em>${t}</em>`
      if (r.bold) t = `<strong>${t}</strong>`
      if (r.href) t = `<a href="${escAttr(r.href)}">${t}</a>`
      return t
    })
    .join('')
}

function xhtmlBlock(node: ProseMirrorNode): string {
  switch (node.type) {
    case 'paragraph': {
      const { tabs, runs } = indentedRuns(node.content)
      const s = xhtmlInline(runs)
      return `<p${blockStyle(node, tabs)}>${s || ' '}</p>`
    }
    case 'heading':
      return `<h${headingLevel(node)}>${xhtmlInline(
        indentedRuns(node.content).runs
      )}</h${headingLevel(node)}>`
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map(xhtmlBlock).join('')}</blockquote>`
    case 'bulletList':
      return `<ul>${(node.content ?? [])
        .map((li) => `<li>${(li.content ?? []).map(xhtmlBlock).join('')}</li>`)
        .join('')}</ul>`
    case 'orderedList':
      return `<ol>${(node.content ?? [])
        .map((li) => `<li>${(li.content ?? []).map(xhtmlBlock).join('')}</li>`)
        .join('')}</ol>`
    case 'horizontalRule':
      return '<hr/>'
    case 'codeBlock':
      return `<pre>${esc(codeText(node))}</pre>`
    default: {
      const { tabs, runs } = indentedRuns(node.content)
      const s = xhtmlInline(runs)
      return s ? `<p${blockStyle(node, tabs)}>${s}</p>` : ''
    }
  }
}

const sectionXhtml = (sec: ExportSection, style: ExportStyle): string => {
  const body = (sec.content.content ?? []).map(xhtmlBlock).join('\n')
  if (style.chapterTitle === 'none') return body
  const title =
    style.chapterTitle === 'centered'
      ? `<p class="chapter-title">${esc(sec.title)}</p>`
      : `<h1>${esc(sec.title)}</h1>`
  return `${title}\n${body}`
}

// ---------- FB2 ----------

function fb2Inline(runs: Run[]): string {
  return runs
    .map((r) => {
      if (r.br) return '<empty-line/>'
      let t = esc(r.text)
      if (r.code) t = `<code>${t}</code>`
      if (r.italic) t = `<emphasis>${t}</emphasis>`
      if (r.bold) t = `<strong>${t}</strong>`
      if (r.strike) t = `<strikethrough>${t}</strikethrough>`
      if (r.href) t = `<a l:href="${escAttr(r.href)}">${t}</a>`
      return t
    })
    .join('')
}

function fb2Block(node: ProseMirrorNode): string {
  switch (node.type) {
    case 'paragraph': {
      // FB2 has no indent attribute — readers indent every <p> themselves,
      // so the leading tabs are simply dropped.
      const s = fb2Inline(indentedRuns(node.content).runs)
      return s.trim() ? `<p>${s}</p>` : '<empty-line/>'
    }
    case 'heading':
      return `<subtitle>${fb2Inline(indentedRuns(node.content).runs)}</subtitle>`
    case 'blockquote':
      return `<cite>${(node.content ?? []).map((c) => fb2Block(c)).join('')}</cite>`
    case 'bulletList':
      return (node.content ?? [])
        .map(
          (li) =>
            `<p>• ${(li.content ?? [])
              .map((c) => fb2Inline(inlineRuns(c.content)))
              .join(' ')}</p>`
        )
        .join('')
    case 'orderedList':
      return (node.content ?? [])
        .map(
          (li, i) =>
            `<p>${i + 1}. ${(li.content ?? [])
              .map((c) => fb2Inline(inlineRuns(c.content)))
              .join(' ')}</p>`
        )
        .join('')
    case 'horizontalRule':
      return '<empty-line/><p>* * *</p><empty-line/>'
    case 'codeBlock':
      return `<p><code>${esc(codeText(node))}</code></p>`
    default: {
      const s = fb2Inline(indentedRuns(node.content).runs)
      return s ? `<p>${s}</p>` : ''
    }
  }
}

/** <author> block shared by <title-info> and <document-info>. */
function fb2Author(meta: ExportMeta): string {
  const parts = [
    `<first-name>${esc(meta.authorFirstName)}</first-name>`,
    `<last-name>${esc(meta.authorLastName)}</last-name>`
  ]
  if (meta.homePage) parts.push(`<home-page>${esc(meta.homePage)}</home-page>`)
  return `<author>\n${parts.join('\n')}\n</author>`
}

export function buildFb2(unit: ExportUnit, meta: ExportMeta): string {
  const sections = unit.sections
    .map(
      (sec) =>
        `<section><title><p>${esc(sec.title)}</p></title>\n${(sec.content.content ?? [])
          .map((b) => fb2Block(b))
          .join('\n')}</section>`
    )
    .join('\n')

  // A body <title> on top of a single section's own title renders as an extra
  // (empty) opening page in readers — it only earns its place when the file
  // holds several chapters.
  const bodyTitle = unit.sections.length > 1 ? `<title><p>${esc(unit.title)}</p></title>\n` : ''
  const author = fb2Author(meta)
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const stamp = now.toISOString().replace('T', ' ').slice(0, 19)

  return `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info>
<genre>prose</genre>
${author}
<book-title>${esc(unit.title)}</book-title>
<date value="${date}">${date}</date>
<lang>${escAttr(meta.language)}</lang>
</title-info>
<document-info>
${author}
<date value="${date}">${stamp}</date>
<id>${randomUUID()}</id>
<version>1.0</version>
</document-info>
</description>
<body>
${bodyTitle}${sections}
</body>
</FictionBook>`
}

// ---------- DOCX ----------

function runsToDocx(runs: Run[]): Array<TextRun | ExternalHyperlink> {
  return runs.map((r) => {
    if (r.br) return new TextRun({ text: '', break: 1 })
    if (r.href) {
      return new ExternalHyperlink({
        link: r.href,
        children: [new TextRun({ text: r.text, style: 'Hyperlink' })]
      })
    }
    return new TextRun({
      text: r.text,
      bold: r.bold,
      italics: r.italic,
      underline: r.underline ? {} : undefined,
      strike: r.strike,
      font: r.code ? 'Courier New' : undefined
    })
  })
}

const DOCX_ALIGN = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
} as const

/**
 * Alignment of a text paragraph: what the editor says, or the export-wide
 * default (justified for prose) when the paragraph carries none.
 */
function docxAlign(
  node: ProseMirrorNode,
  style: ExportStyle
): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  const align = blockAlign(node)
  if (align) return DOCX_ALIGN[align]
  return style.justify ? AlignmentType.JUSTIFIED : undefined
}

/** Extra paragraph options carried down from the section level. */
interface DocxBlockOptions {
  /** Start this paragraph on a new page (chapter break). */
  pageBreakBefore?: boolean
}

/** Ordinary text paragraph: leading tabs become a real first-line indent. */
function docxParagraph(
  node: ProseMirrorNode,
  style: ExportStyle,
  opts: DocxBlockOptions = {}
): Paragraph {
  const { tabs, runs } = indentedRuns(node.content)
  return new Paragraph({
    children: runsToDocx(runs),
    alignment: docxAlign(node, style),
    pageBreakBefore: opts.pageBreakBefore,
    indent:
      tabs > 0 ? { firstLine: convertMillimetersToTwip(INDENT_MM_PER_TAB * tabs) } : undefined
  })
}

function blockToDocx(
  node: ProseMirrorNode,
  style: ExportStyle,
  opts: DocxBlockOptions = {}
): Paragraph[] {
  switch (node.type) {
    case 'heading': {
      const lvl = headingLevel(node)
      const heading =
        lvl === 1 ? HeadingLevel.HEADING_1 : lvl === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3
      const align = blockAlign(node)
      return [
        new Paragraph({
          heading,
          alignment: align ? DOCX_ALIGN[align] : undefined,
          pageBreakBefore: opts.pageBreakBefore,
          children: runsToDocx(indentedRuns(node.content).runs)
        })
      ]
    }
    case 'paragraph':
      return [docxParagraph(node, style, opts)]
    case 'blockquote':
      return (node.content ?? []).flatMap((child) => blockToDocx(child, style, opts))
    case 'bulletList':
      return (node.content ?? []).flatMap((li) =>
        (li.content ?? []).map(
          (c) => new Paragraph({ bullet: { level: 0 }, children: runsToDocx(inlineRuns(c.content)) })
        )
      )
    case 'orderedList':
      return (node.content ?? []).flatMap((li, i) =>
        (li.content ?? []).map(
          (c) =>
            new Paragraph({
              children: [
                new TextRun({ text: `${i + 1}. ` }),
                ...runsToDocx(inlineRuns(c.content))
              ]
            })
        )
      )
    case 'horizontalRule':
      return [
        new Paragraph({
          text: '* * *',
          alignment: AlignmentType.CENTER,
          pageBreakBefore: opts.pageBreakBefore
        })
      ]
    case 'codeBlock':
      return [
        new Paragraph({
          pageBreakBefore: opts.pageBreakBefore,
          children: [new TextRun({ text: codeText(node), font: 'Courier New' })]
        })
      ]
    default:
      return [docxParagraph(node, style, opts)]
  }
}

/**
 * Document-wide styles from the chosen typography: Word otherwise falls back
 * to its own preset (Calibri 11pt, blue Heading 1), which has nothing to do
 * with how the text looks in the editor.
 */
function docxStyles(style: ExportStyle): NonNullable<ConstructorParameters<typeof Document>[0]['styles']> {
  const font = primaryFont(style.fontFamily)
  const size = Math.round(style.fontSizePt * 2) // docx sizes are half-points
  const line = Math.round(style.lineHeight * 240) // 240 twips = single spacing
  const spacing = {
    line,
    lineRule: LineRuleType.AUTO,
    before: Math.round(style.spaceBeforePt * 20), // 20 twips = 1pt
    after: Math.round(style.spaceAfterPt * 20)
  }
  const heading = (scale: number): { run: object; paragraph: object } => ({
    run: { font, size: Math.round(size * scale), bold: true, color: '000000' },
    paragraph: { spacing: { ...spacing, before: 240, after: 120 }, keepNext: true }
  })

  return {
    default: {
      document: { run: { font, size, color: '000000' }, paragraph: { spacing } },
      heading1: heading(1.4),
      heading2: heading(1.2),
      heading3: heading(1.1)
    }
  }
}

/** "First Last" from the metadata preset, or '' when no author is set. */
export const authorName = (meta: ExportMeta): string =>
  [meta.authorFirstName, meta.authorLastName].filter(Boolean).join(' ')

export async function buildDocx(
  unit: ExportUnit,
  style: ExportStyle,
  meta: ExportMeta
): Promise<Buffer> {
  const children: Paragraph[] = []

  unit.sections.forEach((sec, i) => {
    const newPage = i > 0
    if (style.chapterTitle === 'heading') {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: newPage,
          children: [new TextRun({ text: sec.title })]
        })
      )
    } else if (style.chapterTitle === 'centered') {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          pageBreakBefore: newPage,
          spacing: { after: 240 },
          children: [new TextRun({ text: sec.title, bold: true })]
        })
      )
    }

    // With no title line the page break moves onto the chapter's first block.
    const blocks = sec.content.content ?? []
    const breakOnFirst = style.chapterTitle === 'none' && newPage
    blocks.forEach((block, blockIndex) => {
      children.push(
        ...blockToDocx(block, style, { pageBreakBefore: breakOnFirst && blockIndex === 0 })
      )
    })
  })

  const page = PAGE_SIZES_MM[style.pageSize]
  const cm = (value: number): number => convertMillimetersToTwip(value * 10)
  const author = authorName(meta)
  const doc = new Document({
    // Justified prose without hyphenation stretches the word spacing — Word
    // hyphenates only when asked to.
    hyphenation: style.hyphenation ? { autoHyphenation: true } : undefined,
    title: unit.title,
    creator: author || undefined,
    lastModifiedBy: author || undefined,
    description: meta.homePage || undefined,
    styles: docxStyles(style),
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(page.width),
              height: convertMillimetersToTwip(page.height)
            },
            margin: {
              top: cm(style.margins.top),
              bottom: cm(style.margins.bottom),
              left: cm(style.margins.left),
              right: cm(style.margins.right)
            }
          }
        },
        children
      }
    ]
  })
  return Packer.toBuffer(doc)
}

// ---------- EPUB ----------

const chapterDoc = (sec: ExportSection, style: ExportStyle, lang: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escAttr(lang)}" lang="${escAttr(
    lang
  )}"><head>
<meta charset="utf-8"/><title>${esc(sec.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head><body>
${sectionXhtml(sec, style)}
</body></html>`

export async function buildEpub(
  unit: ExportUnit,
  style: ExportStyle,
  meta: ExportMeta
): Promise<Buffer> {
  const zip = new JSZip()
  const uid = `urn:uuid:${randomUUID()}`
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  )
  zip.file(
    'OEBPS/style.css',
    // Typography follows the export settings (the editor's by default).
    // No blanket p{text-indent}: the indent comes from the document itself
    // (leading tabs → inline text-indent), so paragraphs without one stay flush.
    `body{font-family:${cssSafe(style.fontFamily)};font-size:${style.fontSizePt}pt;` +
      `line-height:${style.lineHeight};margin:1em}` +
      `h1{font-size:1.4em}` +
      `p{margin:${style.spaceBeforePt}pt 0 ${style.spaceAfterPt}pt` +
      `${style.justify ? ';text-align:justify' : ''}}` +
      // Hyphenation needs the language on <html> (set in chapterDoc) to work.
      (style.hyphenation
        ? `body,p{-webkit-hyphens:auto;-epub-hyphens:auto;-moz-hyphens:auto;hyphens:auto;` +
          `-webkit-hyphenate-limit-before:3;-webkit-hyphenate-limit-after:3}`
        : `body,p{-webkit-hyphens:none;-epub-hyphens:none;hyphens:none}`) +
      `p.chapter-title{text-align:center;font-weight:bold;margin:1em 0}` +
      `hr{border:none;text-align:center}hr:after{content:"* * *"}`
  )

  const chapters = unit.sections.map((sec, i) => ({
    id: `ch${i + 1}`,
    file: `ch${i + 1}.xhtml`,
    title: sec.title
  }))
  unit.sections.forEach((sec, i) =>
    zip.file(`OEBPS/${chapters[i].file}`, chapterDoc(sec, style, meta.language))
  )

  const manifestItems = chapters
    .map((c) => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`)
    .join('\n')
  const spineItems = chapters.map((c) => `<itemref idref="${c.id}"/>`).join('\n')

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:title>${esc(unit.title)}</dc:title>
<dc:language>${esc(meta.language)}</dc:language>
<dc:identifier id="bookid">${uid}</dc:identifier>
<dc:date>${new Date().toISOString().slice(0, 10)}</dc:date>
${authorName(meta) ? `<dc:creator opf:role="aut">${esc(authorName(meta))}</dc:creator>` : ''}
${meta.homePage ? `<dc:source>${esc(meta.homePage)}</dc:source>` : ''}
</metadata>
<manifest>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${manifestItems}
</manifest>
<spine toc="ncx">
${spineItems}
</spine>
</package>`
  )

  const navPoints = chapters
    .map(
      (c, i) =>
        `<navPoint id="nav${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(
          c.title
        )}</text></navLabel><content src="${c.file}"/></navPoint>`
    )
    .join('\n')

  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${uid}"/></head>
<docTitle><text>${esc(unit.title)}</text></docTitle>
<navMap>
${navPoints}
</navMap>
</ncx>`
  )

  return zip.generateAsync({ type: 'nodebuffer' })
}
