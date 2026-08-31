/**
 * Export orchestration: assembles the units (files) per the chosen
 * granularity and writes them to the chosen folder in the requested format.
 */

import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import { type TreeNode, createEmptyDocument } from '@shared/project-types'
import {
  type ExportOptions,
  type ExportResult,
  type ExportStyle,
  DEFAULT_EXPORT_STYLE,
  pxToPt
} from '@shared/export-types'
import { getSettings } from './settings'
import { tMain } from '../i18n'
import { readDocument, readManifest } from './storage'
import {
  buildDocx,
  buildEpub,
  buildFb2,
  type ExportSection,
  type ExportUnit
} from './export-convert'

/** Subtree documents in traversal order (id + title). */
function collectDocs(nodes: TreeNode[]): Array<{ id: string; title: string }> {
  const out: Array<{ id: string; title: string }> = []
  for (const n of nodes) {
    if (n.type === 'document') out.push({ id: n.id, title: n.title })
    if (n.children.length > 0) out.push(...collectDocs(n.children))
  }
  return out
}

/**
 * Selected nodes in tree order, dropping those nested inside another selected
 * node (they are exported as part of their ancestor anyway).
 */
function topLevelSelection(nodes: TreeNode[], ids: Set<string>): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (list: TreeNode[]): void => {
    for (const node of list) {
      if (ids.has(node.id)) out.push(node)
      else if (node.children.length > 0) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

/**
 * Turn a filesystem error into a message the user can act on: the usual case
 * is the target file still open in Word/a reader, which locks it (EBUSY on
 * Windows, EPERM/EACCES elsewhere).
 */
function writeFailure(err: unknown, filePath: string): Error {
  const code = (err as NodeJS.ErrnoException)?.code
  const file = basename(filePath)
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
    return new Error(tMain('main.errExportLocked', { file }))
  }
  if (code === 'ENOSPC') return new Error(tMain('main.errExportNoSpace'))
  if (code === 'ENOENT') return new Error(tMain('main.errExportNoDir'))
  const detail = err instanceof Error ? err.message : String(err)
  return new Error(tMain('main.errExportFailed', { file, detail }))
}

/** Write one exported file, reporting failures in plain language. */
async function writeExportFile(filePath: string, data: Buffer | string): Promise<void> {
  try {
    if (typeof data === 'string') await fs.writeFile(filePath, data, 'utf8')
    else await fs.writeFile(filePath, data)
  } catch (err) {
    throw writeFailure(err, filePath)
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'export'
}

export async function exportProject(
  projectPath: string,
  options: ExportOptions,
  onProgress?: (done: number, total: number) => void
): Promise<ExportResult> {
  const manifest = await readManifest(projectPath)
  // Without an explicit choice the output follows the project's writing area.
  const style: ExportStyle = options.style ?? {
    ...DEFAULT_EXPORT_STYLE,
    fontFamily: manifest.settings.fontFamily,
    fontSizePt: pxToPt(manifest.settings.fontSize),
    lineHeight: manifest.settings.lineHeight
  }
  // Author/link/language preset — the same for every exported file.
  const meta = (await getSettings()).exportMeta

  const loadSection = async (id: string, title: string): Promise<ExportSection> => ({
    title,
    content: (await readDocument(projectPath, id)) ?? createEmptyDocument()
  })

  // Build the export units.
  const units: ExportUnit[] = []

  if (options.granularity === 'project') {
    const docs = collectDocs(manifest.tree)
    const sections = await Promise.all(docs.map((d) => loadSection(d.id, d.title)))
    units.push({ title: manifest.title, sections })
  } else if (options.granularity === 'current') {
    if (options.currentDocId) {
      const docs = collectDocs(manifest.tree)
      const doc = docs.find((d) => d.id === options.currentDocId)
      if (doc) units.push({ title: doc.title, sections: [await loadSection(doc.id, doc.title)] })
    }
  } else if (options.granularity === 'selection') {
    for (const node of topLevelSelection(manifest.tree, new Set(options.nodeIds ?? []))) {
      const docs = node.type === 'folder' ? collectDocs(node.children) : [{ id: node.id, title: node.title }]
      if (docs.length === 0) continue
      const sections = await Promise.all(docs.map((d) => loadSection(d.id, d.title)))
      units.push({ title: node.title, sections })
    }
  } else if (options.granularity === 'perChapter') {
    for (const d of collectDocs(manifest.tree)) {
      units.push({ title: d.title, sections: [await loadSection(d.id, d.title)] })
    }
  } else {
    // perFolder: each top-level node becomes a separate file.
    for (const node of manifest.tree) {
      const docs = node.type === 'folder' ? collectDocs(node.children) : [{ id: node.id, title: node.title }]
      if (docs.length === 0) continue
      const sections = await Promise.all(docs.map((d) => loadSection(d.id, d.title)))
      units.push({ title: node.title, sections })
    }
  }

  // Write the units to the chosen folder.
  const written: string[] = []
  const used = new Set<string>()
  onProgress?.(0, units.length)

  for (const unit of units) {
    const base = sanitizeFileName(unit.title)
    let name = `${base}.${options.format}`
    let n = 2
    while (used.has(name.toLowerCase())) {
      name = `${base} (${n}).${options.format}`
      n += 1
    }
    used.add(name.toLowerCase())
    const filePath = join(options.outputDir, name)

    if (options.format === 'docx') {
      await writeExportFile(filePath, await buildDocx(unit, style, meta))
    } else if (options.format === 'epub') {
      await writeExportFile(filePath, await buildEpub(unit, style, meta))
    } else {
      await writeExportFile(filePath, buildFb2(unit, meta))
    }
    written.push(filePath)
    onProgress?.(written.length, units.length)
  }

  return { files: written }
}
