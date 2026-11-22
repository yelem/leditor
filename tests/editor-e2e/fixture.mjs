// Builds a fresh throwaway project for the suite. Every test gets its own
// document so the cases cannot affect each other.
import * as fs from 'node:fs'
import * as path from 'node:path'

const t = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text })
const p = (...content) => ({ type: 'paragraph', content: content.length ? content : undefined })
const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const li = (...content) => ({ type: 'listItem', content })
const ti = (checked, text) => ({ type: 'taskItem', attrs: { checked }, content: [p(t(text))] })
const doc = (...content) => ({ type: 'doc', content })
const clean = (o) => JSON.parse(JSON.stringify(o)) // drops undefined

export const RICH = clean(
  doc(
    h(1, 'Глава первая'),
    p(t('\tПервая строка с табом. Слова  с двойным пробелом и «кавычками».')),
    p(
      t('Обычный '),
      t('жирный', [{ type: 'bold' }]),
      t(' '),
      t('курсив', [{ type: 'italic' }]),
      t(' '),
      t('подчёркнутый', [{ type: 'underline' }]),
      t(' '),
      t('зачёркнутый', [{ type: 'strike' }]),
      t(' '),
      t('код', [{ type: 'code' }]),
      t(' '),
      t('выделенный', [{ type: 'highlight' }]),
      t(' '),
      t('ссылка', [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }]),
      t(' E=mc'),
      t('2', [{ type: 'superscript' }]),
      t(' H'),
      t('2', [{ type: 'subscript' }]),
      t('O, '),
      t('жирный курсив', [{ type: 'bold' }, { type: 'italic' }]),
      t('.')
    ),
    { type: 'paragraph', attrs: { textAlign: 'center' }, content: [t('По центру')] },
    { type: 'paragraph', attrs: { textAlign: 'justify' }, content: [t('По ширине')] },
    h(2, 'Подзаголовок'),
    h(3, 'Третий уровень'),
    {
      type: 'bulletList',
      content: [
        li(p(t('Пункт один'))),
        li(p(t('Пункт два')), { type: 'bulletList', content: [li(p(t('Вложенный')))] })
      ]
    },
    { type: 'orderedList', attrs: { start: 1 }, content: [li(p(t('Первый'))), li(p(t('Второй')))] },
    { type: 'taskList', content: [ti(true, 'Сделано'), ti(false, 'Не сделано')] },
    { type: 'blockquote', content: [p(t('Цитата в блоке'))] },
    { type: 'codeBlock', attrs: { language: null }, content: [t('const x = 1\n  отступ')] },
    { type: 'horizontalRule' },
    p(t('До разрыва'), { type: 'hardBreak' }, t('после разрыва')),
    p(),
    p(t('Таб\tв середине и в конце\t')),
    p(
      t('Правка: '),
      t('старое', [{ type: 'deletion', attrs: { sid: 'sg-fixture-1' } }]),
      t('новое', [{ type: 'insertion', attrs: { sid: 'sg-fixture-1' } }]),
      t(' конец.')
    ),
    // Control characters as pasted from elsewhere (Word's manual line break
    // is a vertical tab): not allowed in XML, must not break the export.
    p(t('Управляющие\u000Bсимволы\u0001 внутри.')),
    p(t('Последний абзац.'))
  )
)

const SIMPLE = (text) => clean(doc(p(t(text))))
const EMPTY = clean(doc(p()))

const para = (i) =>
  p(
    t(
      `Абзац ${i}. Съешь же ещё этих мягких французских булок, да выпей чаю. The quick brown fox jumps over the lazy dog.`
    )
  )

/** id → { title, content } */
export const DOCS = {
  rich: { title: 'Rich', content: RICH },
  rich2: { title: 'Rich copy src', content: RICH },
  long: { title: 'Long', content: clean(doc(...Array.from({ length: 400 }, (_, i) => para(i)))) },
  multi: {
    title: 'Multi',
    content: clean(doc(p(t('Первый абзац.')), p(t('Второй абзац.')), p(t('Третий абзац.'))))
  },
  target: { title: 'Target', content: SIMPLE('Начало середина конец.') },
  aiDoc: { title: 'AiDoc', content: SIMPLE('Мама мыла раму. Папа читал газету. Кот спал.') },
  findDoc: { title: 'FindDoc', content: clean(doc(p(t('кот и Кот и КОТ.')), p(t('ещё кот')))) }
}
for (let i = 1; i <= 31; i++) DOCS[`e${i}`] = { title: `E${i}`, content: EMPTY }

const idOf = (key) => `t-${key}`

export function buildProject(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, 'content'), { recursive: true })
  const tree = Object.entries(DOCS).map(([key, d]) => ({
    id: idOf(key),
    type: 'document',
    title: d.title,
    children: []
  }))
  const now = new Date().toISOString()
  fs.writeFileSync(
    path.join(dir, 'project.json'),
    JSON.stringify({
      schemaVersion: 1,
      title: 'Suite',
      createdAt: now,
      updatedAt: now,
      tree,
      trash: [],
      settings: {
        fontFamily: 'Georgia',
        fontSize: 18,
        lineHeight: 1.6,
        editorWidth: 700,
        typewriterMode: false,
        notesFontSize: 13
      }
    })
  )
  for (const [key, d] of Object.entries(DOCS)) {
    fs.writeFileSync(path.join(dir, 'content', `${idOf(key)}.json`), JSON.stringify(d.content))
  }
  return { idOf }
}
export { idOf }
