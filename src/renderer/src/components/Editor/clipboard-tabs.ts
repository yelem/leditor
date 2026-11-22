/**
 * Clipboard html shaping for Word, in both directions.
 *
 * Copy (`wordSafeTabHtml`). Word's HTML paste importer ignores CSS
 * `white-space`, so whitespace that matters in a manuscript gets collapsed:
 *   • A run of tabs opening a block becomes `text-indent` on that block — the
 *     professional equivalent of a leading tab, which Word maps straight to
 *     Paragraph > Indentation > First line.
 *   • Any other tab is kept via `mso-tab-count`, the marker Word itself writes.
 *   • A run of spaces is kept via `mso-spacerun`, likewise Word's own marker.
 *
 * Paste (`restoreTabHtml`). The inverse, applied to every paste — both to our
 * own copies coming back and to html from Word itself. Restored whitespace is
 * wrapped in a `white-space: pre-wrap` span: ProseMirror keeps tabs and space
 * runs only inside such an element, and scoping it to the span (rather than the
 * whole block) leaves the rest of Word's markup — which breaks its source lines
 * wherever it likes — under normal whitespace rules. Word-only markup is
 * cleaned up on the way: its bullet/number lists become real lists, and its
 * "empty" paragraphs (a lone non-breaking space) become empty ones.
 */

const INDENT_CM_PER_TAB = 1.25

/**
 * A detached element to parse clipboard html in. It belongs to a separate,
 * script-less document: html parsed into the live page would start loading
 * images right away and fire their inline handlers (`<img onerror>`) before
 * ProseMirror ever sees the markup — pasted web content must not get that far.
 */
function inertContainer(): HTMLDivElement {
  return document.implementation.createHTMLDocument('').createElement('div')
}

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI'])

function textNodes(root: Node): Text[] {
  const out: Text[] = []
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = walker.nextNode())) out.push(n as Text)
  return out
}

// ---------------------------------------------------------------- copy ----

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

/** Replace runs of 2+ spaces with Word's own space-run marker. */
function markSpaceRuns(root: Element): void {
  const doc = root.ownerDocument
  for (const node of textNodes(root)) {
    const text = node.data
    if (!/ {2,}/.test(text)) continue
    // Code is rendered monospaced with its spacing as is; leave it alone.
    if (node.parentElement?.closest('pre, code')) continue
    const frag = doc.createDocumentFragment()
    let last = 0
    for (const m of text.matchAll(/ {2,}/g)) {
      frag.append(text.slice(last, m.index))
      const span = doc.createElement('span')
      span.setAttribute('style', 'mso-spacerun:yes')
      span.textContent = '\u00a0'.repeat(m[0].length - 1) + ' '
      frag.append(span)
      last = m.index + m[0].length
    }
    frag.append(text.slice(last))
    node.replaceWith(frag)
  }
}

export function wordSafeTabHtml(html: string): string {
  const container = inertContainer()
  container.innerHTML = html

  const walk = (el: Element): void => {
    if (BLOCK_TAGS.has(el.tagName)) convertLeadingTab(el)
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(container)
  markSpaceRuns(container)

  return container.innerHTML.replace(/\t+/g, (run) => {
    const count = run.length
    return `<span style="mso-tab-count:${count}">${'&nbsp;'.repeat(count * 4)}</span>`
  })
}

// --------------------------------------------------------------- paste ----

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

/** Literal whitespace that ProseMirror's parser will keep as is. */
function preservedText(doc: Document, text: string): HTMLSpanElement {
  const span = doc.createElement('span')
  span.setAttribute('style', 'white-space: pre-wrap')
  span.textContent = text
  return span
}

function restoreLeadingTab(el: Element): void {
  const styled = el as HTMLElement
  const tabs = indentToTabs(styled.style.textIndent)
  if (tabs === 0) return
  styled.style.removeProperty('text-indent')
  if (!styled.getAttribute('style')) styled.removeAttribute('style')
  styled.insertBefore(preservedText(styled.ownerDocument, '\t'.repeat(tabs)), styled.firstChild)
}

/** Is this markup Word's (its namespaces, classes or mso- styles)? */
function isWordHtml(html: string): boolean {
  return /urn:schemas-microsoft-com:office|class=["']?Mso|mso-list/i.test(html)
}

/** Word's list marker kinds: "1." / "a)" / "iv." are numbered, the rest bullets. */
const ORDERED_MARKER = /^\(?(\d+|[a-zа-я]|[ivxlc]+)[.)]$/i

/**
 * Word writes list items as plain paragraphs with an `mso-list` style and the
 * bullet or number as text in an `mso-list:Ignore` span (shown only to apps
 * that lack list support — i.e. us). Rebuild them as real, nested lists.
 */
function convertWordLists(root: HTMLElement): void {
  const doc = root.ownerDocument
  const items = Array.from(root.querySelectorAll<HTMLElement>('p[style*="mso-list"]')).filter(
    (p) => !/mso-list\s*:\s*Ignore/i.test(p.getAttribute('style') ?? '')
  )
  let i = 0
  while (i < items.length) {
    const run = [items[i]]
    while (
      i + run.length < items.length &&
      run[run.length - 1].nextElementSibling === items[i + run.length]
    ) {
      run.push(items[i + run.length])
    }
    i += run.length

    const anchor = doc.createComment('')
    run[0].before(anchor)
    const stack: Array<{ list: HTMLElement; level: number; lastLi: HTMLElement | null }> = []
    let currentListId: string | null = null
    for (const p of run) {
      const style = p.getAttribute('style') ?? ''
      const level = Number(/level(\d+)/i.exec(style)?.[1] ?? 1)
      // Each Word list has its own id (l0, l1…): a new id starts a new list.
      const listId = /mso-list\s*:\s*(l\d+)/i.exec(style)?.[1] ?? ''
      if (listId !== currentListId) {
        stack.length = 0
        currentListId = listId
      }
      const marker = p.querySelector('[style*="mso-list:Ignore" i], [style*="mso-list: Ignore" i]')
      let markerText = ''
      if (marker) {
        markerText = (marker.textContent ?? '').replace(/\u00a0/g, ' ').trim()
        // The marker usually sits in a wrapper span that holds nothing else.
        let removable: Element = marker
        while (
          removable.parentElement &&
          removable.parentElement !== p &&
          removable.parentElement.textContent === removable.textContent
        ) {
          removable = removable.parentElement
        }
        removable.remove()
      }
      const ordered = ORDERED_MARKER.test(markerText)

      while (stack.length > 0 && stack[stack.length - 1].level > level) stack.pop()
      let top = stack[stack.length - 1]
      if (!top || level > top.level) {
        const list = doc.createElement(ordered ? 'ol' : 'ul')
        if (top?.lastLi) top.lastLi.append(list)
        else if (top) top.list.append(list)
        else anchor.before(list)
        top = { list, level, lastLi: null }
        stack.push(top)
      }
      const li = doc.createElement('li')
      const para = doc.createElement('p')
      while (p.firstChild) para.append(p.firstChild)
      li.append(para)
      top.list.append(li)
      top.lastLi = li
      p.remove()
    }
    anchor.remove()
  }
}

/** Word marks an empty paragraph with a lone &nbsp; — make it really empty. */
function emptyWordParagraphs(root: HTMLElement): void {
  for (const block of Array.from(root.querySelectorAll('p, h1, h2, h3'))) {
    if (block.querySelector('img, br')) continue
    if ((block.textContent ?? '').replace(/[\s\u00a0]/g, '') === '') block.replaceChildren()
  }
}

/**
 * Inverse of `wordSafeTabHtml`, applied to every paste. Without it a copy made
 * inside the editor loses its tabs and space runs on the way back in, and html
 * from Word itself brings its first-line indents, tabs and double spaces in as
 * nothing, a plain space and non-breaking spaces.
 */
export function restoreTabHtml(html: string): string {
  const container = inertContainer()
  container.innerHTML = html
  const doc = container.ownerDocument
  const fromWord = isWordHtml(html)

  if (fromWord) convertWordLists(container)

  for (const el of Array.from(container.querySelectorAll('[style*="mso-tab-count"]'))) {
    const match = /mso-tab-count\s*:\s*(\d+)/i.exec(el.getAttribute('style') ?? '')
    el.replaceWith(preservedText(doc, '\t'.repeat(match ? Number(match[1]) : 1)))
  }
  for (const el of Array.from(container.querySelectorAll('[style*="mso-spacerun"]'))) {
    // Word wraps its html source inside these runs too: a line break there
    // stands for one of the spaces.
    const spaces = (el.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\r?\n|\r/g, ' ')
    el.replaceWith(preservedText(doc, spaces))
  }

  const walk = (el: Element): void => {
    if (BLOCK_TAGS.has(el.tagName)) restoreLeadingTab(el)
    for (const child of Array.from(el.children)) walk(child)
  }
  walk(container)

  if (fromWord) emptyWordParagraphs(container)

  return container.innerHTML
}
