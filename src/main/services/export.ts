/**
 * Оркестрация экспорта: собирает «единицы» (файлы) по выбранной гранулярности
 * и пишет их в выбранную папку в нужном формате.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { type TreeNode, createEmptyDocument } from '@shared/project-types'
import type { ExportOptions, ExportResult } from '@shared/export-types'
import { readDocument, readManifest } from './storage'
import {
  buildDocx,
  buildEpub,
  buildFb2,
  type ExportSection,
  type ExportUnit
} from './export-convert'

/** Документы поддерева в порядке обхода (id + заголовок). */
function collectDocs(nodes: TreeNode[]): Array<{ id: string; title: string }> {
  const out: Array<{ id: string; title: string }> = []
  for (const n of nodes) {
    if (n.type === 'document') out.push({ id: n.id, title: n.title })
    if (n.children.length > 0) out.push(...collectDocs(n.children))
  }
  return out
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

  const loadSection = async (id: string, title: string): Promise<ExportSection> => ({
    title,
    content: (await readDocument(projectPath, id)) ?? createEmptyDocument()
  })

  // Сформировать единицы экспорта.
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
  } else if (options.granularity === 'perChapter') {
    for (const d of collectDocs(manifest.tree)) {
      units.push({ title: d.title, sections: [await loadSection(d.id, d.title)] })
    }
  } else {
    // perFolder: каждый узел верхнего уровня — отдельный файл.
    for (const node of manifest.tree) {
      const docs = node.type === 'folder' ? collectDocs(node.children) : [{ id: node.id, title: node.title }]
      if (docs.length === 0) continue
      const sections = await Promise.all(docs.map((d) => loadSection(d.id, d.title)))
      units.push({ title: node.title, sections })
    }
  }

  // Записать единицы в выбранную папку.
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
      await fs.writeFile(filePath, await buildDocx(unit))
    } else if (options.format === 'epub') {
      await fs.writeFile(filePath, await buildEpub(unit))
    } else {
      await fs.writeFile(filePath, buildFb2(unit), 'utf8')
    }
    written.push(filePath)
    onProgress?.(written.length, units.length)
  }

  return { files: written }
}
