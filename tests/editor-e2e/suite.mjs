// Golden-master suite for the Leditor editor — see README.md.
// Usage: node tests/editor-e2e/suite.mjs <label> [scenario-regex]
// Drives the built app (out/) against a throwaway project and records what
// each scenario produces into <tmp>/leditor-e2e/results-<label>.json.
import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { buildProject, idOf } from './fixture.mjs'

const H = import.meta.dirname
const REPO = path.resolve(H, '../..')
const require = createRequire(path.join(REPO, 'package.json'))
const JSZip = require('jszip')
// The electron package resolves to the path of its binary.
const ELECTRON = require('electron')

const LABEL = process.argv[2] ?? 'run'
// APP_DIR: another checkout to run against (e.g. a git worktree of an older
// version) — its out/ is used, with this checkout's Electron.
const APP = path.resolve(process.env.APP_DIR ?? REPO)
const ONLY = process.argv[3] ? new RegExp(process.argv[3]) : null
// Word automation needs Windows with Word installed; E2E_WORD=0 skips it.
const HAS_WORD = process.platform === 'win32' && process.env.E2E_WORD !== '0'
const WORK = path.join(os.tmpdir(), 'leditor-e2e')
const RUN = path.join(WORK, `run-${LABEL}`)
const PROJECT = path.join(RUN, 'Suite.bookproj')
const UDATA = path.join(RUN, 'udata')
const OUTDIR = path.join(RUN, 'export')
fs.rmSync(RUN, { recursive: true, force: true })
fs.mkdirSync(OUTDIR, { recursive: true })
buildProject(PROJECT)
fs.writeFileSync(
  path.join(RUN, 'launcher.js'),
  `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(UDATA)}); require(${JSON.stringify(path.join(APP, 'out/main/index.js'))});\n`
)

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = {}
const log = (...a) => console.log(`[${LABEL}]`, ...a)

const app = await electron.launch({
  executablePath: ELECTRON,
  args: [path.join(RUN, 'launcher.js'), PROJECT],
  timeout: 60_000
})
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`)
})
await page.waitForSelector('.tree__label', { timeout: 30_000 })

// ---------- helpers ----------
const EDITOR = '.editor__page .ProseMirror'

async function open(title) {
  await page.locator('.tree__label', { hasText: new RegExp(`^${title}$`) }).click()
  await page.waitForFunction(
    (t) => document.querySelector('.editor__doc-title')?.textContent === t,
    title
  )
  await wait(500)
}

/** Select text inside `root` by DOM range; mode: select | before | after. */
async function select(needle, { root = EDITOR, mode = 'select', to = null, nth = 0 } = {}) {
  const ok = await page.evaluate(
    ({ root, needle, mode, to, nth }) => {
      const el = document.querySelector(root)
      if (!el) return 'no root'
      el.focus()
      const nodes = []
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n
      let joined = ''
      while ((n = walker.nextNode())) {
        nodes.push({ node: n, start: joined.length })
        joined += n.data
      }
      const find = (s, from) => joined.indexOf(s, from)
      let idx = -1
      let from = 0
      for (let i = 0; i <= nth; i++) {
        idx = find(needle, from)
        from = idx + 1
      }
      if (idx < 0) return 'not found: ' + needle
      let endIdx = idx + needle.length
      if (to) {
        const j = find(to, idx)
        if (j < 0) return 'not found: ' + to
        endIdx = j + to.length
      }
      const at = (offset, preferNext) => {
        for (let i = 0; i < nodes.length; i++) {
          const s = nodes[i].start
          const e = s + nodes[i].node.data.length
          if (offset >= s && (offset < e || (offset === e && !preferNext))) {
            return [nodes[i].node, offset - s]
          }
        }
        const last = nodes[nodes.length - 1]
        return [last.node, last.node.data.length]
      }
      const range = document.createRange()
      if (mode === 'before') {
        range.setStart(...at(idx, true))
        range.collapse(true)
      } else if (mode === 'after') {
        range.setStart(...at(endIdx, false))
        range.collapse(true)
      } else {
        range.setStart(...at(idx, true))
        range.setEnd(...at(endIdx, false))
      }
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      return 'ok'
    },
    { root, needle, mode, to, nth }
  )
  if (ok !== 'ok') throw new Error(ok)
  await wait(120)
}

async function saved(key, ms = 1300) {
  await wait(ms)
  return JSON.parse(fs.readFileSync(path.join(PROJECT, 'content', `${idOf(key)}.json`), 'utf8'))
}
const dom = (root = EDITOR) => page.$eval(root, (el) => el.innerHTML)
// Electron 44: async clipboard with ClipboardItem.
const readClip = () =>
  app.evaluate(async ({ clipboard }) => {
    const out = { html: '', text: '', types: [] }
    for (const item of await clipboard.read()) {
      for (const type of item.types) {
        out.types.push(type)
        const v = await item.getType(type)
        const s = typeof v === 'string' ? v : typeof v?.text === 'function' ? await v.text() : ''
        if (type === 'text/html') out.html = s
        if (type === 'text/plain') out.text = s
      }
    }
    return out
  })
async function writeClip(d) {
  await app.evaluate(async ({ clipboard, ClipboardItem }, d) => {
    clipboard.clear()
    const entry = {}
    if (d.text != null) entry['text/plain'] = d.text
    if (d.html != null) entry['text/html'] = d.html
    await clipboard.write([new ClipboardItem(entry)])
  }, d)
  const back = await readClip()
  if (d.text != null && back.text !== d.text.replace(/\r\n/g, '\n') && back.text !== d.text) {
    throw new Error('clipboard write did not stick: ' + JSON.stringify(back).slice(0, 200))
  }
}
async function copy() {
  await app.evaluate(({ clipboard }) => clipboard.clear())
  await page.keyboard.press('Control+c')
  await wait(200)
  let c = await readClip()
  if (!c.text && !c.html) {
    await page.evaluate(() => document.execCommand('copy'))
    await wait(200)
    c = await readClip()
    c.via = 'execCommand'
  }
  return c
}
async function paste() {
  await page.keyboard.press('Control+v')
  await wait(250)
}
function word(mode, extra = [], attempt = 1) {
  const out = path.join(RUN, `word-${Date.now()}.json`)
  try { execFileSync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(H, 'word.ps1'), '-Mode', mode, '-Out', out, ...extra],
    { stdio: 'pipe', timeout: 120_000 }
  ) } catch (e) {
    if (attempt >= 3) throw new Error(String(e.stderr || e.message).slice(0, 800))
    execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep 3'])
    return word(mode, extra, attempt + 1)
  }
  return JSON.parse(fs.readFileSync(out, 'utf8').replace(/^\uFEFF/, ''))
}
/** Html part of a CF_HTML payload (what a paste hands to the page). */
// .NET can hand back bytes past the CF_HTML end offset; cut at </html>.
const htmlPart = (s) => {
  const start = s.indexOf('<html')
  const end = s.lastIndexOf('</html>')
  if (start < 0) return s
  return end > start ? s.slice(start, end + '</html>'.length) : s.slice(start)
}

async function test(name, fn, { word: needsWord = false } = {}) {
  if (ONLY && !ONLY.test(name)) return
  if (needsWord && !HAS_WORD) {
    log('skip', name, '(no Word)')
    return
  }
  const t0 = Date.now()
  try {
    results[name] = await fn()
    log('ok  ', name, `${Date.now() - t0}ms`)
  } catch (e) {
    results[name] = { ERROR: String(e?.message ?? e) }
    log('FAIL', name, e?.message)
    await page.keyboard.press('Escape').catch(() => {})
  }
}

// ---------- scenarios ----------

await test('render/rich-dom', async () => {
  await open('Rich')
  return { html: await dom(), review: await page.locator('.sg-review__item').count() }
})

await test('roundtrip/rich-save', async () => {
  await open('Rich')
  await select('Последний абзац.', { mode: 'after' })
  await page.keyboard.type('x')
  await page.keyboard.press('Backspace')
  return await saved('rich')
})

await test('export/current-docx-fb2-epub', async () => {
  await open('Rich')
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
  }, OUTDIR)
  const files = await page.evaluate(
    async ({ projectPath, docId }) => {
      const dir = await window.api.dialog.pickDirectory()
      const out = []
      for (const format of ['docx', 'fb2', 'epub']) {
        const r = await window.api.export.run(projectPath, {
          format,
          granularity: 'current',
          currentDocId: docId,
          outputDir: dir
        })
        out.push(...r.files)
      }
      return out
    },
    { projectPath: PROJECT, docId: idOf('rich') }
  )
  const res = { files: files.map((f) => path.basename(f)) }
  // Every XML part of every format, for the well-formedness check below.
  const xmlParts = []
  for (const f of files) {
    const buf = fs.readFileSync(f)
    if (f.endsWith('.fb2')) {
      const fb2 = buf.toString('utf8')
      xmlParts.push([path.basename(f), fb2])
      res.fb2 = fb2.replace(/<date[^>]*>[^<]*<\/date>/g, '').replace(/<id>[^<]*<\/id>/g, '')
    } else {
      const zip = await JSZip.loadAsync(buf)
      for (const name of Object.keys(zip.files).sort()) {
        if (/\.(xml|x?html|opf|ncx|rels)$/.test(name)) {
          xmlParts.push([`${path.basename(f)}:${name}`, await zip.file(name).async('string')])
        }
      }
      if (f.endsWith('.docx')) res.docx = await zip.file('word/document.xml').async('string')
      else {
        const parts = []
        for (const name of Object.keys(zip.files).sort()) {
          if (/\.x?html$/.test(name)) parts.push(`--${name}\n` + (await zip.file(name).async('string')))
        }
        res.epub = parts.join('\n').replace(/urn:uuid:[0-9a-f-]+/g, 'UUID')
      }
    }
    if (HAS_WORD && f.endsWith('.docx')) res.docxInWord = word('open', ['-Path', f]).paragraphs
  }
  // A reader rejects the whole book over one malformed part.
  res.malformedXml = await page.evaluate((parts) => {
    const bad = []
    for (const [name, xml] of parts) {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      if (doc.getElementsByTagName('parsererror').length > 0) bad.push(name)
    }
    return bad
  }, xmlParts)
  return res
})

await test('clipboard/copy-all-rich', async () => {
  await open('Rich copy src')
  await page.click(EDITOR)
  await page.keyboard.press('Control+a')
  return await copy()
})

await test('clipboard/rich-to-word', async () => {
  await open('Rich copy src')
  await page.click(EDITOR)
  await page.keyboard.press('Control+a')
  await copy()
  return word('paste').paragraphs
}, { word: true })

await test('clipboard/rich-copy-paste-into-empty', async () => {
  await open('Rich copy src')
  await page.click(EDITOR)
  await page.keyboard.press('Control+a')
  await copy()
  await open('E1')
  await page.click(EDITOR)
  await paste()
  return await saved('e1')
})

await test('clipboard/word-copy-paste-into-other-doc', async () => {
  await open('Rich copy src')
  await select('Слова')
  const c = await copy()
  await open('E2')
  await page.click(EDITOR)
  await paste()
  return { clip: c, doc: await saved('e2') }
})

await test('clipboard/word-paste-mid-paragraph', async () => {
  await open('Rich copy src')
  await select('Обычный')
  await copy()
  await open('Target')
  await select('середина', { mode: 'before' })
  await paste()
  return await saved('target')
})

await test('clipboard/tab-paragraph-roundtrip', async () => {
  await open('Rich copy src')
  await select('\tПервая', { to: '«кавычками».' })
  const c = await copy()
  await open('E3')
  await page.click(EDITOR)
  await paste()
  return { clip: c, doc: await saved('e3') }
})

await test('clipboard/tab-paragraph-to-word', async () => {
  await open('Rich copy src')
  await select('\tПервая', { to: 'Таб\tв середине и в конце\t' })
  await copy()
  return word('paste').paragraphs
}, { word: true })

await test('clipboard/multi-block-paste-mid-paragraph', async () => {
  await open('Rich copy src')
  await select('Подзаголовок', { to: 'Пункт два' })
  const c = await copy()
  await open('Multi')
  await select('Второй', { mode: 'after' })
  await paste()
  return { clip: c, doc: await saved('multi') }
})

await test('clipboard/cut-and-paste', async () => {
  await open('E4')
  await page.click(EDITOR)
  await page.keyboard.type('Один два три')
  await select('два ')
  await page.keyboard.press('Control+x')
  await wait(200)
  await select('Один', { mode: 'before' })
  await paste()
  return await saved('e4')
})

await test('clipboard/copy-list-items', async () => {
  await open('Rich copy src')
  await select('Первый', { to: 'Второй' })
  const c = await copy()
  await open('E5')
  await page.click(EDITOR)
  await paste()
  return { clip: c, doc: await saved('e5') }
})

await test('clipboard/copy-hardbreak-and-empty', async () => {
  await open('Rich copy src')
  await select('До разрыва', { to: 'Таб\tв' })
  const c = await copy()
  await open('E6')
  await page.click(EDITOR)
  await paste()
  return { clip: c, doc: await saved('e6') }
})

await test('clipboard/plain-text-roundtrip', async () => {
  // Copy, keep only the text/plain flavor (as Notepad would), paste back.
  await open('Rich copy src')
  await page.click(EDITOR)
  await page.keyboard.press('Control+a')
  const c = await copy()
  await open('E30')
  await page.click(EDITOR)
  await writeClip({ text: c.text })
  await paste()
  return { text: c.text, doc: await saved('e30') }
})

await test('paste/plain-text', async () => {
  await open('E7')
  await page.click(EDITOR)
  await writeClip({ text: 'line1\nline2\n\nline4\ttab  two spaces\r\nwindows line' })
  await paste()
  return await saved('e7')
})

await test('paste/browser-html', async () => {
  await open('E8')
  await page.click(EDITOR)
  await writeClip({
    text: 'Hello bold x',
    html:
      '<meta charset="utf-8"><div><p style="color:red;font-size:30px">Hello <b>bold</b>&nbsp;&nbsp;x <span style="font-weight:700">heavy</span> <em>em</em></p>' +
      '<p>Second   spaces</p><ul><li>a</li><li>b</li></ul><h2>Head</h2>' +
      '<a href="javascript:alert(1)">bad link</a> <a href="https://ok.example">ok link</a>' +
      '<img src="x" onerror="alert(1)"><table><tr><td>cell</td></tr></table><pre>pre  text</pre></div>'
  })
  await paste()
  return { doc: await saved('e8'), html: await dom() }
})

await test('paste/google-docs-like', async () => {
  await open('E9')
  await page.click(EDITOR)
  await writeClip({
    text: 'Bold para',
    html: '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700">Bold</span><span> para</span></p><br><p dir="ltr"><span style="font-style:italic">It</span></p></b>'
  })
  await paste()
  return await saved('e9')
})

await test('paste/word-to-editor', async () => {
  const w = word('make-copy')
  await open('E10')
  await page.click(EDITOR)
  await writeClip({ html: htmlPart(w.html), text: w.text })
  await paste()
  return { doc: await saved('e10'), html: await dom() }
}, { word: true })

await test('paste/word-real-clipboard', async () => {
  // Word owns the clipboard while the editor pastes: the real OS path.
  const { spawn } = await import('node:child_process')
  const out = path.join(RUN, `word-hold-${Date.now()}.json`)
  const ps = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(H, 'word.ps1'), '-Mode', 'hold', '-Out', out], { stdio: 'ignore' })
  const exited = new Promise((r) => ps.on('exit', r))
  for (let i = 0; i < 300 && !fs.existsSync(out + '.ready'); i++) await wait(200)
  if (!fs.existsSync(out + '.ready')) throw new Error('Word did not get ready')
  await open('E28')
  await page.click(EDITOR)
  await paste()
  fs.writeFileSync(out + '.release', '')
  await exited
  return { doc: await saved('e28'), html: await dom() }
}, { word: true })

await test('paste/word-nested-lists-synthetic', async () => {
  // Word's own markup for a two-level bullet list and a Cyrillic-lettered list.
  const ignore = (m) =>
    `<![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>${m}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>`
  const li = (cls, list, level, marker, text) =>
    `<p class=${cls} style='margin-left:${18 * level}pt;text-indent:-18.0pt;mso-list:${list} level${level} lfo1'>${ignore(marker)}${text}<o:p></o:p></p>\r\n`
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><body lang=RU>\r\n<!--StartFragment-->` +
    li('MsoListParagraphCxSpFirst', 'l0', 1, '·', 'Верхний') +
    li('MsoListParagraphCxSpMiddle', 'l0', 2, 'o', 'Вложенный\r\nпункт') +
    li('MsoListParagraphCxSpMiddle', 'l0', 2, 'o', 'Ещё вложенный') +
    li('MsoListParagraphCxSpLast', 'l0', 1, '·', 'Снова верхний') +
    `<p class=MsoNormal><o:p>&nbsp;</o:p></p>\r\n` +
    li('MsoListParagraphCxSpFirst', 'l1', 1, 'а)', 'Буква а') +
    li('MsoListParagraphCxSpLast', 'l1', 1, 'б)', 'Буква б') +
    `<!--EndFragment-->\r\n</body></html>`
  await open('E29')
  await page.click(EDITOR)
  await writeClip({ html, text: 'Верхний' })
  await paste()
  return await saved('e29')
})

await test('paste/cfhtml-wrapper-from-pm', async () => {
  // A ProseMirror copy pasted back: the CF_HTML wrapper must not add lines.
  await open('E11')
  await page.click(EDITOR)
  await writeClip({
    text: 'слово',
    html: '<html>\r\n<body>\r\n<!--StartFragment--><p data-pm-slice="1 1 []">слово</p><!--EndFragment-->\r\n</body>\r\n</html>'
  })
  await paste()
  return await saved('e11')
})

await test('paste/over-selection', async () => {
  await open('E12')
  await page.click(EDITOR)
  await page.keyboard.type('Заменить это слово.')
  await select('это')
  await writeClip({ text: 'то' })
  await paste()
  return await saved('e12')
})

// --- typing / typography ---
await test('type/typography', async () => {
  await open('E13')
  await page.click(EDITOR)
  await page.keyboard.type('"Привет" -- сказал он... (тихо "да") и "нет".')
  return await saved('e13')
})

await test('type/quote-over-selection', async () => {
  await open('E14')
  await page.click(EDITOR)
  await page.keyboard.type('Слово здесь.')
  await select('здесь')
  await page.keyboard.type('"X')
  return await saved('e14')
})

await test('type/quote-over-cross-block-selection', async () => {
  await open('E15')
  await page.click(EDITOR)
  await page.keyboard.type('Первый абзац')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Второй абзац')
  await select('абзац', { to: 'Второй' })
  await page.keyboard.type(' "Y')
  return await saved('e15')
})

await test('type/backspace-undoes-typography', async () => {
  await open('E16')
  await page.click(EDITOR)
  await page.keyboard.type('a--')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(' b...')
  await page.keyboard.press('Control+z')
  return await saved('e16')
})

await test('type/quote-keeps-formatting', async () => {
  await open('E31')
  await page.click(EDITOR)
  await page.keyboard.type('Он ')
  await page.keyboard.press('Control+b')
  await page.keyboard.type('жирный')
  await page.keyboard.press('Control+b')
  await page.keyboard.type(' и ')
  await page.keyboard.press('Control+i')
  await page.keyboard.type('курсив')
  await page.keyboard.press('Control+i')
  await page.keyboard.type(' "цитата" и "ещё')
  return await saved('e31')
})

await test('type/markdown-input-rules', async () => {
  await open('E17')
  await page.click(EDITOR)
  for (const line of ['# Заголовок', '## Второй', '- пункт', '1. номер', '> цитата', '**жирно** и *курсив* и ~~зачёрк~~ и `код`', '***', '---']) {
    await page.keyboard.type(line)
    await page.keyboard.press('Enter')
    // leave a list/quote so the next rule starts from a plain paragraph
    await page.keyboard.press('Enter')
  }
  return await saved('e17')
})

await test('keys/tab-shift-tab', async () => {
  await open('E18')
  await page.click(EDITOR)
  await page.keyboard.press('Tab')
  await page.keyboard.type('Текст')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('конец')
  const focused = await page.evaluate(() => document.activeElement?.className ?? '')
  return { doc: await saved('e18'), focused }
})

await test('keys/tab-in-list', async () => {
  await open('E19')
  await page.click(EDITOR)
  await page.keyboard.type('- один')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('вложенный')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('снова')
  return await saved('e19')
})

await test('keys/select-all-empty', async () => {
  await open('E20')
  await page.click(EDITOR)
  await page.keyboard.press('Control+a')
  const selText = await page.evaluate(() => {
    const s = window.getSelection()
    return { text: s.toString(), collapsed: s.isCollapsed }
  })
  await page.keyboard.type('z')
  return { selText, doc: await saved('e20') }
})

await test('keys/select-all-replace', async () => {
  await open('E21')
  await page.click(EDITOR)
  await page.keyboard.type('Много')
  await page.keyboard.press('Enter')
  await page.keyboard.type('текста')
  await page.keyboard.press('Control+a')
  await page.keyboard.type('q')
  return await saved('e21')
})

await test('keys/enter-shift-enter', async () => {
  await open('E22')
  await page.click(EDITOR)
  await page.keyboard.type('АБВГД')
  await select('В', { mode: 'after' })
  await page.keyboard.press('Enter')
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('после')
  return await saved('e22')
})

await test('keys/undo-grouping', async () => {
  await open('E23')
  await page.click(EDITOR)
  await page.keyboard.type('один')
  await wait(500)
  await page.keyboard.type(' два')
  await wait(500)
  await page.keyboard.type(' три')
  await page.keyboard.press('Control+z')
  const afterOne = await page.$eval(EDITOR, (el) => el.textContent)
  await page.keyboard.press('Control+z')
  const afterTwo = await page.$eval(EDITOR, (el) => el.textContent)
  await page.keyboard.press('Control+y')
  const redo = await page.$eval(EDITOR, (el) => el.textContent)
  await page.keyboard.press('Control+Shift+z')
  const redo2 = await page.$eval(EDITOR, (el) => el.textContent)
  return { afterOne, afterTwo, redo, redo2 }
})

// --- toolbar ---
await test('toolbar/format-buttons', async () => {
  await open('E24')
  await page.click(EDITOR)
  await page.keyboard.type('альфа бета гамма дельта')
  const click = async (title) => {
    await page.locator(`.fmt [title="${title}"]`).first().click()
    await wait(120)
  }
  await select('альфа')
  await click('Bold (Ctrl+B)')
  const boldActive = await page.locator('.fmt [title="Bold (Ctrl+B)"]').getAttribute('class')
  await select('бета')
  await click('Italic (Ctrl+I)')
  await select('гамма')
  await click('Highlight')
  await click('Align center')
  await select('дельта', { mode: 'after' })
  await page.keyboard.press('Enter')
  await page.keyboard.type('список')
  await click('Bullet list')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('заголовок')
  await page.locator('.fmt [title="Paragraph style"]').click()
  await page.locator('.fmt__menu-item', { hasText: 'Heading 2' }).click()
  await wait(100)
  const styleLabel = await page.locator('.fmt [title="Paragraph style"]').textContent()
  await select('альфа')
  await page.locator('.fmt [title="Link"]').click()
  await page.locator('.fmt__link-input').fill('https://example.org')
  await page.keyboard.press('Enter')
  await click('Undo (Ctrl+Z)')
  await click('Redo (Ctrl+Y)')
  return { boldActive, styleLabel, doc: await saved('e24') }
})

// --- find / replace ---
await test('find/count-and-replace-all', async () => {
  await open('FindDoc')
  await page.click(EDITOR)
  await page.keyboard.press('Control+f')
  await page.locator('.find__input').first().fill('кот')
  await wait(200)
  const count1 = await page.locator('.find__count').textContent()
  await page.locator('.find__cs input').check()
  await wait(200)
  const countCs = await page.locator('.find__count').textContent()
  await page.locator('.find__cs input').uncheck()
  await page.locator('.find__input').nth(1).fill('пёс')
  await page.locator('.find__btn').nth(1).click()
  await wait(200)
  const count2 = await page.locator('.find__count').textContent()
  await page.locator('.find__close').click()
  return { count1, countCs, count2, doc: await saved('findDoc') }
})

// --- AI suggestions (provider mocked in main) ---
await test('ai/grammar-accept-reject', async () => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai:grammar')
    ipcMain.handle('ai:grammar', async () => [
      { original: 'мыла раму', suggestion: 'вымыла раму', reason: 'r1' },
      { original: 'читал', suggestion: 'читает', reason: 'r2' },
      { original: 'нет такого', suggestion: 'x', reason: 'r3' }
    ])
    ipcMain.removeHandler('ai:improve')
    ipcMain.handle('ai:improve', async () => 'Кот крепко спал.')
  })
  const send = (kind) =>
    app.evaluate(({ BrowserWindow }, kind) => BrowserWindow.getAllWindows()[0].webContents.send('editor:aiAction', kind), kind)
  await open('AiDoc')
  await select('Мама', { to: 'газету.' })
  await send('grammar')
  await wait(600)
  const items = await page.locator('.sg-review__item').allTextContents()
  const marked = await dom()
  await page.locator('.sg-review__accept').first().click()
  await wait(150)
  await page.locator('.sg-review__reject').first().click()
  await wait(150)
  await select('Кот спал.')
  await send('rewrite')
  await wait(600)
  const items2 = await page.locator('.sg-review__item').allTextContents()
  await page.locator('.sg-review__accept-all').click()
  return { items, marked, items2, doc: await saved('aiDoc') }
})

await test('ai/fixture-suggestion-reject-all', async () => {
  await open('Rich')
  const items = await page.locator('.sg-review__item').allTextContents()
  await page.locator('.sg-review__reject-all').click()
  return { items, doc: await saved('rich') }
})

// --- notes ---
await test('notes/format-and-font-size', async () => {
  await open('E25')
  await page.locator('.rpanel__tab').nth(1).click()
  await page.waitForSelector('.notes__prose')
  await page.click('.notes__prose')
  await page.keyboard.type('Заметка жирным и крупным')
  await select('жирным', { root: '.notes__prose' })
  await page.keyboard.press('Control+b')
  await select('крупным', { root: '.notes__prose' })
  await page.locator('.notes__fontsize-btn').nth(1).click()
  const input = page.locator('.notes__fontsize-pop input').first()
  await input.fill('20')
  await input.press('Enter')
  await wait(1200)
  const note = fs.readFileSync(path.join(PROJECT, 'notes', `${idOf('e25')}.json`), 'utf8')
  // paste into notes too (fragment handling)
  await page.keyboard.press('Escape')
  await wait(100)
  await page.click('.notes__prose')
  await page.keyboard.press('Control+End')
  await writeClip({
    text: 'вставка',
    html: '<html>\r\n<body>\r\n<!--StartFragment--><p data-pm-slice="1 1 []">вставка</p><!--EndFragment-->\r\n</body>\r\n</html>'
  })
  await paste()
  await wait(1200)
  const note2 = fs.readFileSync(path.join(PROJECT, 'notes', `${idOf('e25')}.json`), 'utf8')
  await page.locator('.rpanel__tab').nth(0).click()
  return { note: JSON.parse(note), note2: JSON.parse(note2) }
})

// --- combined view ---
await test('combined/render', async () => {
  await page.locator('.toolbar__dropdown .toolbar__btn').click()
  await page.locator('.toolbar__menu-item', { hasText: 'View as one page' }).click()
  await page.waitForSelector('.combined__chapter')
  const html = await page.$eval('.combined__page', (el) => {
    // only the first two chapters (Rich and Rich copy src) — the rest are noise
    return [...el.querySelectorAll('.combined__chapter')].slice(0, 2).map((c) => c.innerHTML)
  })
  await page.locator('.combined__close').click()
  await wait(300)
  return html
})

// --- placeholder / spellcheck / editor attributes ---
await test('editor/attributes', async () => {
  await open('E26')
  return await page.$eval(EDITOR, (el) => ({
    spellcheck: el.getAttribute('spellcheck'),
    cls: el.className,
    contenteditable: el.getAttribute('contenteditable'),
    placeholder: el.querySelector('[data-placeholder]')?.getAttribute('data-placeholder') ?? null
  }))
})

await test('stats/word-counts', async () => {
  const read = async () => ({
    doc: await page.locator('.editor__status span').nth(0).textContent(),
    chars: await page.locator('.editor__status span').nth(1).textContent(),
    project: await page.locator('.editor__status-project').textContent()
  })
  await open('Rich copy src')
  const rich = await read()
  await open('Long')
  const long = await read()
  return { rich, long }
})

await test('typewriter/keeps-caret-centered', async () => {
  await open('Long')
  await page.locator('.fmt [title]', { hasText: 'View' }).click()
  await page.locator('.appearance__row--checkbox input').check()
  await page.keyboard.press('Escape')
  await select('Абзац 150.', { mode: 'after' })
  await page.keyboard.type(' x')
  await wait(300)
  const offset = await page.evaluate(() => {
    const sc = document.querySelector('.editor__scroll')
    const r = window.getSelection().getRangeAt(0).getBoundingClientRect()
    const s = sc.getBoundingClientRect()
    return Math.round(r.top - (s.top + s.height / 2))
  })
  await page.locator('.fmt [title]', { hasText: 'View' }).click()
  await page.locator('.appearance__row--checkbox input').uncheck()
  await page.keyboard.press('Escape')
  return { caretFromCenterPx: Math.abs(offset) < 40 ? 'centered' : offset }
})

// --- guards in main (IPC called as a compromised page could) ---
await test('guard/settings-cannot-move-backup-folder', async () => {
  return await page.evaluate(async () => {
    const current = await window.api.settings.get()
    const saved = await window.api.settings.set({
      ...current,
      backup: { ...current.backup, customLocation: 'C:\\somewhere-else' }
    })
    return { customLocation: saved.backup.customLocation }
  })
})

await test('guard/endpoint-change-forgets-key', async () => {
  return await page.evaluate(async () => {
    if (!(await window.api.ai.storageAvailable())) return { skipped: 'no secure storage' }
    const id = crypto.randomUUID()
    const s0 = await window.api.settings.get()
    const profile = { id, name: 'T', kind: 'openai', baseUrl: 'http://127.0.0.1:9/v1', model: 'm' }
    await window.api.settings.set({ ...s0, ai: { activeProfileId: id, profiles: [profile] } })
    await window.api.ai.setKey(id, 'secret-test-key')
    const s1 = await window.api.settings.get()
    await window.api.settings.set({ ...s1, ai: { ...s1.ai, profiles: [{ ...profile, name: 'Renamed' }] } })
    const afterRename = await window.api.ai.keyStatus(id)
    const s2 = await window.api.settings.get()
    await window.api.settings.set({
      ...s2,
      ai: { ...s2.ai, profiles: [{ ...profile, baseUrl: 'https://attacker.example/v1' }] }
    })
    const afterMove = await window.api.ai.keyStatus(id)
    // Clean up: back to no profiles.
    const s3 = await window.api.settings.get()
    await window.api.settings.set({ ...s3, ai: { activeProfileId: null, profiles: [] } })
    return { afterRename, afterMove, afterRemove: await window.api.ai.keyStatus(id) }
  })
})

await test('guard/export-includes-just-typed-text', async () => {
  // A long autosave delay: only the flush before export can save the text.
  const setDelay = (ms) =>
    page.evaluate(async (ms) => {
      const s = await window.api.settings.get()
      await window.api.settings.set({ ...s, autosaveDelayMs: ms })
    }, ms)
  await setDelay(10_000)
  await page.reload()
  await page.waitForSelector('.tree__label')
  await open('E27')
  await page.click(EDITOR)
  await page.keyboard.type('Только что набранный текст')
  // Straight to the export dialog — the autosave debounce has not fired yet.
  await page.locator('.toolbar__dropdown .toolbar__btn').click()
  await page.locator('.toolbar__menu-item', { hasText: 'Export…' }).click()
  await page.locator('.export__format', { hasText: 'FB2' }).click()
  await page.locator('.export__radio input').nth(3).check() // current chapter
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
  }, OUTDIR)
  await page.locator('.export .settings__minor-btn').first().click() // choose folder
  await page.waitForFunction(() => !document.querySelector('.export__run')?.disabled)
  await page.locator('.export__run').click()
  await page.waitForFunction(() => document.querySelector('.export')?.textContent?.match(/\d/))
  await wait(500)
  await page.keyboard.press('Escape')
  const file = path.join(OUTDIR, 'E27.fb2')
  const fb2 = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  await setDelay(600)
  await page.reload()
  await page.waitForSelector('.tree__label')
  return { fileWritten: fb2.length > 0, hasJustTypedText: fb2.includes('Только что набранный текст') }
})

await test('guard/move-into-missing-parent-keeps-node', async () => {
  return await page.evaluate(
    async ({ projectPath, nodeId }) => {
      let error = null
      try {
        await window.api.tree.move(projectPath, nodeId, 'no-such-folder', 0)
      } catch (e) {
        error = 'refused'
      }
      const manifest = await window.api.project.openPath(projectPath)
      const stillThere = JSON.stringify(manifest.manifest.tree).includes(nodeId)
      return { error, stillThere }
    },
    { projectPath: PROJECT, nodeId: idOf('e26') }
  )
})

await test('app/drop-project-folder-opens-it', async () => {
  // A second project, dropped onto the window as the OS would drop a folder.
  const second = path.join(RUN, 'Dropped.bookproj')
  fs.cpSync(PROJECT, second, { recursive: true })
  const manifestFile = path.join(second, 'project.json')
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  manifest.tree = manifest.tree.slice(0, 1).map((n) => ({ ...n, title: 'Dropped chapter' }))
  fs.writeFileSync(manifestFile, JSON.stringify(manifest))

  const cdp = await page.context().newCDPSession(page)
  const box = await page.locator('.editor__scroll').boundingBox()
  const at = { x: Math.round(box.x + 50), y: Math.round(box.y + 50) }
  const data = { items: [], files: [second], dragOperationsMask: 1 }
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await cdp.send('Input.dispatchDragEvent', { type, ...at, data })
  }
  await page.waitForFunction(
    () => [...document.querySelectorAll('.tree__label')].some((l) => l.textContent === 'Dropped chapter'),
    null,
    { timeout: 10_000 }
  ).catch(() => undefined)
  const labels = await page.locator('.tree__label').allTextContents()
  // Back to the suite project for whatever runs next.
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await cdp.send('Input.dispatchDragEvent', { type, ...at, data: { ...data, files: [PROJECT] } })
  }
  await page.waitForFunction(
    () => [...document.querySelectorAll('.tree__label')].some((l) => l.textContent === 'Rich'),
    null,
    { timeout: 10_000 }
  )
  return { opened: labels.includes('Dropped chapter') }
})

// --- performance (timings only, not compared literally) ---
await test('perf/typing-long-doc', async () => {
  await open('Long')
  await select('Абзац 200.', { mode: 'after' })
  const t0 = Date.now()
  await page.keyboard.type('Проверка скорости набора текста в длинной главе. '.repeat(6))
  const typing = Date.now() - t0
  const t1 = Date.now()
  await open('E27')
  await open('Long')
  const switching = Date.now() - t1
  return { PERF: true, typing, switching }
})

results['_errors'] = errors.filter((e) => !/Electron Security Warning|DevTools/.test(e))
fs.writeFileSync(path.join(WORK, `results-${LABEL}.json`), JSON.stringify(results, null, 2))
log('written', path.join(WORK, `results-${LABEL}.json`))
await app.close().catch(() => {})
