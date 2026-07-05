/**
 * Конвертеры ProseMirror-документа в форматы экспорта: DOCX, FB2, EPUB.
 * Покрывают обычную прозу: абзацы, заголовки, списки, цитаты, разрыв сцены,
 * жирный/курсив/подчёркнутый/зачёркнутый/код/ссылки.
 */

import { randomUUID } from 'node:crypto'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  HeadingLevel,
  AlignmentType
} from 'docx'
import JSZip from 'jszip'
import type { DocumentContent, ProseMirrorNode } from '@shared/project-types'

export interface ExportSection {
  title: string
  content: DocumentContent
}
export interface ExportUnit {
  title: string
  sections: ExportSection[]
}

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

/** Извлечь inline-фрагменты из содержимого блока. */
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
          else if (m.type === 'deletion') dropped = true // предложенные удаления не экспортируем
        }
        if (!dropped && run.text) runs.push(run)
      }
      if (n.content) walk(n.content)
    }
  }
  walk(nodes ?? [])
  return runs
}

const headingLevel = (n: ProseMirrorNode): number =>
  Math.min(3, Math.max(1, Number(n.attrs?.level ?? 1)))

const codeText = (n: ProseMirrorNode): string =>
  (n.content ?? []).map((c) => c.text ?? '').join('')

// ---------- XHTML (для EPUB) ----------

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
      const s = xhtmlInline(inlineRuns(node.content))
      return `<p>${s || ' '}</p>`
    }
    case 'heading':
      return `<h${headingLevel(node)}>${xhtmlInline(inlineRuns(node.content))}</h${headingLevel(node)}>`
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
      const s = xhtmlInline(inlineRuns(node.content))
      return s ? `<p>${s}</p>` : ''
    }
  }
}

const sectionXhtml = (sec: ExportSection): string =>
  `<h1>${esc(sec.title)}</h1>\n${(sec.content.content ?? []).map(xhtmlBlock).join('\n')}`

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
      const s = fb2Inline(inlineRuns(node.content))
      return s.trim() ? `<p>${s}</p>` : '<empty-line/>'
    }
    case 'heading':
      return `<subtitle>${fb2Inline(inlineRuns(node.content))}</subtitle>`
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
      const s = fb2Inline(inlineRuns(node.content))
      return s ? `<p>${s}</p>` : ''
    }
  }
}

export function buildFb2(unit: ExportUnit): string {
  const sections = unit.sections
    .map(
      (sec) =>
        `<section><title><p>${esc(sec.title)}</p></title>\n${(sec.content.content ?? [])
          .map((b) => fb2Block(b))
          .join('\n')}</section>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info>
<genre>prose</genre>
<book-title>${esc(unit.title)}</book-title>
<lang>ru</lang>
</title-info>
<document-info>
<id>${randomUUID()}</id>
<version>1.0</version>
</document-info>
</description>
<body>
<title><p>${esc(unit.title)}</p></title>
${sections}
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

function blockToDocx(node: ProseMirrorNode): Paragraph[] {
  switch (node.type) {
    case 'heading': {
      const lvl = headingLevel(node)
      const heading =
        lvl === 1 ? HeadingLevel.HEADING_1 : lvl === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3
      return [new Paragraph({ heading, children: runsToDocx(inlineRuns(node.content)) })]
    }
    case 'paragraph':
      return [new Paragraph({ children: runsToDocx(inlineRuns(node.content)) })]
    case 'blockquote':
      return (node.content ?? []).flatMap(blockToDocx).map(
        (p) => p // оставляем как есть (без спец-стиля цитаты для простоты)
      )
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
      return [new Paragraph({ text: '* * *', alignment: AlignmentType.CENTER })]
    case 'codeBlock':
      return [
        new Paragraph({ children: [new TextRun({ text: codeText(node), font: 'Courier New' })] })
      ]
    default:
      return [new Paragraph({ children: runsToDocx(inlineRuns(node.content)) })]
  }
}

export async function buildDocx(unit: ExportUnit): Promise<Buffer> {
  const children: Paragraph[] = []
  unit.sections.forEach((sec, i) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: i > 0,
        children: [new TextRun({ text: sec.title, bold: true })]
      })
    )
    for (const block of sec.content.content ?? []) children.push(...blockToDocx(block))
  })
  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}

// ---------- EPUB ----------

const chapterDoc = (sec: ExportSection): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta charset="utf-8"/><title>${esc(sec.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head><body>
${sectionXhtml(sec)}
</body></html>`

export async function buildEpub(unit: ExportUnit): Promise<Buffer> {
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
    `body{font-family:Georgia,serif;line-height:1.5;margin:1em}h1{font-size:1.5em}p{text-indent:1.2em;margin:.2em 0}hr{border:none;text-align:center}hr:after{content:"* * *"}`
  )

  const chapters = unit.sections.map((sec, i) => ({
    id: `ch${i + 1}`,
    file: `ch${i + 1}.xhtml`,
    title: sec.title
  }))
  unit.sections.forEach((sec, i) => zip.file(`OEBPS/${chapters[i].file}`, chapterDoc(sec)))

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
<dc:language>ru</dc:language>
<dc:identifier id="bookid">${uid}</dc:identifier>
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
