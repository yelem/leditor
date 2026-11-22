# Editor end-to-end suite

Drives the built app (`out/`) through Playwright's Electron support against a
throwaway project, and records what each scenario produces: the saved chapter
JSON, the clipboard html/text, the editor DOM, exported docx/fb2/epub, and —
on Windows with Word installed — what Word makes of a paste and what the
editor makes of a paste from Word.

It is a **golden-master** suite: a run does not assert, it writes
`results-<label>.json`. Two runs are then diffed scenario by scenario. Use it
around any change that can move editor behaviour (a tiptap/ProseMirror or
Electron upgrade, clipboard code, extensions): record the old build, record
the new one, read every difference.

```sh
npm run test:e2e                     # build, then run as label "current"
node tests/editor-e2e/suite.mjs before "clipboard|paste"   # a subset
npm run test:e2e:compare -- before current
```

To record a baseline from an older version without switching branches, check
it out into a worktree, build it there, and point the suite at it — the
current checkout's Electron is used:

```sh
git worktree add ../leditor-baseline <ref>
(cd ../leditor-baseline && npm ci && npm run build)
APP_DIR=../leditor-baseline node tests/editor-e2e/suite.mjs before
```

Notes:

- Every run uses its own user-data folder and project under
  `<os tmpdir>/leditor-e2e/`; the app's real settings and recent projects are
  never touched.
- The suite uses the **system clipboard**. Don't copy anything while it runs.
- Word scenarios need Windows and Word (COM automation through
  `word.ps1`). Elsewhere they are skipped; `E2E_WORD=0` skips them anywhere.
- Scenarios marked `PERF` record timings only; compare them by eye.
- Values that are random per run (suggestion ids, docx relationship ids) show
  up as differences and can be ignored.
