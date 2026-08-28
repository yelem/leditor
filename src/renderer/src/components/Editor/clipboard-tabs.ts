/**
 * Word's HTML paste importer ignores CSS `white-space`, so a literal tab
 * character in copied HTML gets dropped when pasted into Word — and even
 * when it survives (via `mso-tab-count`, see below), a raw tab is not what a
 * manuscript wants at the start of a paragraph: the professional equivalent
 * is a first-line indent set on the paragraph itself ("красная строка"), not
 * a character. So a run of tabs opening a block is converted to
 * `text-indent` on that block instead — Word's HTML importer maps this
 * straight to Paragraph > Indentation > First line.
 *
 * Any other (non-leading) tab is kept as a real tab via `mso-tab-count`, the
 * marker Word itself writes for tabs, so it isn't collapsed away either.
 */

const INDENT_CM_PER_TAB = 1.25

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI'])

function convertLeadingTab(el: Element): void {
  const first = el.firstChild
  if (!first || first.nodeType !== Node.TEXT_NODE) return
  const text = first.textContent ?? ''
  const match = /^\t+/.exec(text)
  if (!match) return
  first.textContent = text.slice(match[0].length)
  const indent = (INDENT_CM_PER_TAB * match[0].length).toFixed(2)
  const existing = (el.getAttribute('style') ?? '').trim()
  const sep = existing && !existing.endsWith(';') ? '; ' : ''
  el.setAttribute('style', `${existing}${sep}text-indent: ${indent}cm`)
}

export function wordSafeTabHtml(html: string): string {
  const container = document.createElement('div')
  container.innerHTML = html

  const walk = (el: Element): void => {
    if (BLOCK_TAGS.has(el.tagName)) convertLeadingTab(el)
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(container)

  return container.innerHTML.replace(/\t+/g, (run) => {
    const count = run.length
    return `<span style="mso-tab-count:${count}">${'&nbsp;'.repeat(count * 4)}</span>`
  })
}
