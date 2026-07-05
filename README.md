# Leditor

A cross-platform desktop editor for writing books, with an integrated AI assistant.
Built with Electron, React, TypeScript and TipTap.

Leditor keeps your whole book in one place — parts, chapters, notes — and adds an
AI assistant that can discuss your story, proofread your prose and rewrite
fragments on request, using any AI provider you choose (including fully local ones).

## Features

### Writing
- **Project tree (binder)** — parts, chapters and scenes as folders and documents:
  drag-and-drop reordering, multi-select, inline rename, duplicate, trash with restore.
- **Rich-text editor** (TipTap): headings, lists, task lists, quotes, code blocks,
  links, highlight, super/subscript, text alignment, scene breaks.
- **Smart typography** as you type: em dashes, ellipses, «guillemets» / „German“ quotes (configurable).
- **Typewriter mode** (keeps the caret line centred) and distraction-free **focus mode**.
- **Find & replace** (Ctrl+F) with match counter and case sensitivity.
- **Combined view** — read the whole book (or one folder) as a single continuous page.
- **Per-chapter notes** in a side panel with its own mini rich-text editor.
- **Word/character counters** for the chapter and the whole project.
- Spell checking (system dictionaries) with a user dictionary you can import/export.

### AI assistant
- **Multiple provider profiles** with quick switching:
  Anthropic (Claude), OpenAI/ChatGPT, DeepSeek, Gemini, or any OpenAI-compatible
  server — including local **LM Studio** and **Ollama** (free, fully offline).
- **Chat about your book** — attach the current chapter and short summaries of the
  other chapters to the model context, with a live context-size indicator.
- **Proofreading** — the model returns a list of concrete edits which appear as
  tracked suggestions in the text; accept or reject them one by one or all at once.
- **Rewrite selection** — rephrase a fragment while keeping its meaning; shown as a
  suggestion too, never applied silently.
- Streaming responses, cancellable requests, generation of chapter summaries.

### Data safety
- Projects are plain folders (`*.bookproj`) with JSON files inside — no lock-in, easy to sync or back up yourself.
- **Automatic backups**: on open, on close, on an interval, and manual snapshots; rotation by count; one-click restore with a protective pre-restore snapshot.
- All file writes are atomic; unsaved changes are flushed before the window closes.
- API keys are stored encrypted in the OS keychain (Electron `safeStorage`) and never leave the main process.
- No telemetry, no auto-updates, no network calls other than the AI requests you make.

### Export & interface
- Export to **Word (.docx)**, **FB2** and **EPUB** — whole project, per folder, per chapter, or the current chapter only.
- Interface languages: **English, Українська, Русский**. Light and dark themes.

## Installation

Grab the installer from [Releases](../../releases), or build from source (below).

> **Note (Windows):** a Leditor project is a *folder* ending in `.bookproj`, so it
> cannot be opened by double-click from Explorer. Open projects from inside the
> app, or drag the project folder onto the Leditor window.

## Building from source

Requirements: [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev        # run in development mode
npm run typecheck  # type checking
```

### Windows installer

```bash
npm run dist:win   # → dist/leditor-<version>-setup.exe (NSIS)
```

### macOS

Build on a Mac (cross-building a .dmg from Windows is not supported):

```bash
npm install
npm run dist:mac   # → dist/leditor-<version>.dmg (universal: Intel + Apple Silicon)
```

The build is unsigned, so on first launch right-click the app → **Open** to get
past Gatekeeper.

### Icons

App icons are generated from code — `npm run icons` rebuilds
`resources/icon.{png,ico,icns}`.

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) + [electron-builder](https://www.electron.build/)
- [React](https://react.dev/) 18, TypeScript
- [TipTap](https://tiptap.dev/) 2 (ProseMirror) for the editor
- [docx](https://github.com/dolanmiu/docx) and [JSZip](https://stuk.github.io/jszip/) for exports
- `@anthropic-ai/sdk` for Claude; plain `fetch` + SSE for OpenAI-compatible providers

The renderer is fully isolated (`contextIsolation`, no Node integration); all disk
and network access goes through typed IPC handled by the main process.

## License

[MIT](LICENSE)
