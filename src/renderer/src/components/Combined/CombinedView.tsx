import { useEffect, useMemo, useState } from 'react'
import { generateHTML } from '@tiptap/html'
import { createEmptyDocument } from '@shared/project-types'
import { useProject } from '@renderer/store'
import { collectDocuments, findNode } from '@renderer/lib/tree'
import { editorExtensions } from '../Editor/extensions'
import { useT } from '@renderer/lib/i18n'
import './combined.css'

/** Combined view of all chapters (or one folder) as a single page. Read-only. */
export function CombinedView(): JSX.Element {
  const t = useT()
  const { projectPath, manifest, combinedScope, closeCombined } = useProject()
  const [items, setItems] = useState<Array<{ id: string; title: string; html: string }>>([])

  const settings = manifest?.settings

  const scopeTitle = useMemo(() => {
    if (!manifest || !combinedScope) return ''
    if (combinedScope.type === 'folder') return findNode(manifest.tree, combinedScope.id)?.title ?? ''
    return manifest.title
  }, [manifest, combinedScope])

  useEffect(() => {
    if (!projectPath || !manifest || !combinedScope) return
    const docs =
      combinedScope.type === 'all'
        ? collectDocuments(manifest.tree)
        : (() => {
            const node = findNode(manifest.tree, combinedScope.id)
            return node ? collectDocuments(node.children) : []
          })()

    let cancelled = false
    Promise.all(
      docs.map(async (d) => {
        const content = (await window.api.document.load(projectPath, d.id)) ?? createEmptyDocument()
        let html = ''
        try {
          html = generateHTML(content, editorExtensions)
        } catch {
          html = ''
        }
        return { id: d.id, title: d.title, html }
      })
    ).then((res) => {
      if (!cancelled) setItems(res)
    })
    return () => {
      cancelled = true
    }
  }, [projectPath, manifest, combinedScope])

  const pageStyle = settings
    ? {
        maxWidth: settings.editorWidth,
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight
      }
    : {}

  return (
    <div className="combined">
      <div className="combined__bar">
        <span className="combined__title">{t('combined.title', { title: scopeTitle })}</span>
        <button type="button" className="combined__close" onClick={closeCombined}>
          {t('combined.close')}
        </button>
      </div>
      <div className="combined__scroll">
        {items.length === 0 ? (
          <div className="combined__empty">{t('combined.empty')}</div>
        ) : (
          // One continuous page with all chapters in a row.
          <article className="editor__page combined__page" style={pageStyle}>
            {items.map((it, i) => (
              <section key={it.id} className={`combined__chapter${i > 0 ? ' is-next' : ''}`}>
                <h1 className="editor__doc-title">{it.title}</h1>
                <div className="editor__prose" dangerouslySetInnerHTML={{ __html: it.html }} />
              </section>
            ))}
          </article>
        )}
      </div>
    </div>
  )
}
