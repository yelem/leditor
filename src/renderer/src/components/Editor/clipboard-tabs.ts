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

const CM_PER_UNIT: Record<string, number> = {
  cm: 1,
  mm: 0.1,
  in: 2.54,
  pt: 2.54 / 72,
  pc: 2.54 / 6,
  px: 2.54 / 96
}

/** How many opening tabs a first-line indent of `value` stands for (0 = none). */
function indentToTabs(value: string): number {
  const match = /^(-?[\d.]+)(cm|mm|in|pt|pc|px)$/.exec(value.trim())
  if (!match) return 0
  const cm = Number(match[1]) * CM_PER_UNIT[match[2]]
  if (!(cm > 0)) return 0
  return Math.max(1, Math.round(cm / INDENT_CM_PER_TAB))
}

function restoreLeadingTab(el: Element): void {
  const styled = el as HTMLElement
  const tabs = indentToTabs(styled.style.textIndent)
  if (tabs === 0) return
  styled.style.removeProperty('text-indent')
  if (!styled.getAttribute('style')) styled.removeAttribute('style')
  styled.insertBefore(document.createTextNode('\t'.repeat(tabs)), styled.firstChild)
}

/**
 * Inverse of `wordSafeTabHtml`, applied to every paste. Without it a copy made
 * inside the editor loses its tabs on the way back in: the clipboard carries
 * the Word-shaped html, where a leading tab has become `text-indent` on the
 * block and the rest `mso-tab-count` spans of non-breaking spaces, neither of
 * which the editor schema knows. As a side effect, a first-line indent pasted
 * from Word itself arrives as a real tab.
 */
export function restoreTabHtml(html: string): string {
  const container = document.createElement('div')
  container.innerHTML = html

  for (const el of Array.from(container.querySelectorAll('[style*="mso-tab-count"]'))) {
    const match = /mso-tab-count\s*:\s*(\d+)/i.exec(el.getAttribute('style') ?? '')
    el.replaceWith(document.createTextNode('\t'.repeat(match ? Number(match[1]) : 1)))
  }

  const walk = (el: Element): void => {
    if (BLOCK_TAGS.has(el.tagName)) restoreLeadingTab(el)
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(container)

  return container.innerHTML
}
