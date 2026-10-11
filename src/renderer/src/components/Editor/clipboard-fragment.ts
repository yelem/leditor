/**
 * On Windows, Chromium hands a paste the whole CF_HTML document rather than
 * just the copied markup: `<html>\r\n<body>\r\n<!--StartFragment-->…
 * <!--EndFragment-->\r\n</body>\r\n</html>`. When the copy came from a
 * ProseMirror editor (its markup carries `data-pm-slice`), ProseMirror parses
 * it with whitespace preserved and turns each of those wrapper line breaks
 * into a hard break, so even a single pasted word arrives padded with empty
 * lines. Keeping only what lies between the fragment markers drops the
 * wrapper. Html from anywhere else passes through untouched: Word, for one,
 * keeps the stylesheet its formatting depends on outside the fragment.
 */
export function clipboardFragment(html: string): string {
  const start = html.indexOf('<!--StartFragment-->')
  const end = html.lastIndexOf('<!--EndFragment-->')
  if (start === -1 || end < start) return html
  const fragment = html.slice(start + '<!--StartFragment-->'.length, end)
  return fragment.includes('data-pm-slice') ? fragment : html
}
