// node tests/editor-e2e/compare.mjs <a> <b> [scenario-regex]
// Per-scenario line diff of two suite runs (see README.md).
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const [a, b, filter] = process.argv.slice(2)
const H = path.join(os.tmpdir(), 'leditor-e2e')
const A = JSON.parse(fs.readFileSync(path.join(H, `results-${a}.json`), 'utf8'))
const B = JSON.parse(fs.readFileSync(path.join(H, `results-${b}.json`), 'utf8'))
const re = filter ? new RegExp(filter) : null

// Long strings (html, xml) become arrays of lines so they diff line by line.
const explode = (v) =>
  typeof v === 'string' && v.length > 80
    ? v.replace(/></g, '>\n<').split('\n')
    : Array.isArray(v)
      ? v.map(explode)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, explode(x)]))
        : v
const lines = (v) => (JSON.stringify(explode(v), null, 1) ?? 'undefined').split('\n')

function diff(x, y) {
  const n = x.length
  const m = y.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      i++
      j++
    } else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) out.push(`  + ${y[j++]}`)
    else out.push(`  - ${x[i++]}`)
  }
  return out
}

let same = 0
for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
  if (re && !re.test(key)) continue
  const va = A[key]
  const vb = B[key]
  if (va?.PERF || vb?.PERF) {
    console.log(`PERF ${key}: ${a}=${JSON.stringify(va)} ${b}=${JSON.stringify(vb)}`)
    continue
  }
  if (JSON.stringify(va) === JSON.stringify(vb)) {
    same++
    continue
  }
  console.log(`\n### DIFF ${key}`)
  const d = diff(lines(va), lines(vb))
  console.log(d.slice(0, 80).join('\n') + (d.length > 80 ? `\n  … ${d.length - 80} more` : ''))
}
console.log(`\nidentical: ${same}`)
