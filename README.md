# Tistnote · 品记

[简体中文](README.zh-CN.md)

**Notice the world. Record your tastes. Understand yourself.**

Tistnote is a local-first list notebook for personal preferences, judgments, and aesthetic. Keep what you love, what you dislike, what you value, and what you are still figuring out. Write down your reasons and revisit how your perspective changes.

## Get Tistnote

| Edition | Link | Requirements |
| --- | --- | --- |
| Web app | [Open Tistnote on GitHub Pages](https://leoatopos.github.io/tistnote/) | Current desktop Chrome or Edge; authorize a local library folder |
| Windows installer | [Download 0.2.0](https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-windows-x64-setup.exe) | Windows 10/11 x64 with Microsoft WebView2 |
| Windows offline installer | [Download with WebView2](https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-windows-x64-offline-setup.exe) | Includes the WebView2 offline runtime |
| Windows portable executable | [Download tistnote.exe](https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote.exe) | Microsoft WebView2 installed |

[All releases, checksums, and build information](https://github.com/LeoAtopos/tistnote/releases). Windows builds are currently unsigned.

## Features

- Ranked or unranked lists, descriptions, tags, and optional reasons for each choice.
- Compact note trees, nested groups backed by real folders, drag-and-drop moves, and context menus.
- Search, filtering, and sorting. Titles are unique across the library; new untitled notes receive unique numbered titles.
- 45 built-in themes covering positive, negative, and mixed feelings; personal templates and template coverage.
- Separate reading and editing modes, autosaved drafts, optional update logs, and cancel editing.
- Version comparison and restoration, milestones, and a yearly activity graph of creation, updates, and reviews.
- Configurable review intervals, green reminders, and review confirmation recorded in history.
- PNG sharing with optional signatures, anonymous attribution, long images or pages. Invitations omit your own answers.
- Chinese and English; light, dark, or system appearance. Preferences stay on your device.
- Full library backup and restoration, Tistnote Markdown import, and Trash recovery.

Tistnote supports thoughtful writing: favorite books, foods you avoid, people you admire, ideas you question, or feelings you have not yet resolved. Take time to compare your choices and understand how they change.

## Local files and privacy

**Notes are not uploaded. No account, telemetry, cloud sync, or application server is used.**

The Windows app runs locally, including history, templates, and image generation. The web edition downloads app assets from GitHub Pages, then reads and writes only the folder you explicitly authorize. GitHub serves the website; it does not store your library.

In the web app, choose an existing Tistnote library or an empty folder. Notes, groups, history, templates, and Trash use the Windows library format. The browser remembers the folder when permitted and may ask you to authorize it again. Unsupported browsers cannot edit local libraries. This edition currently requires desktop Chrome or Edge and is not a mobile client.

**Close Windows Tistnote before editing the same library in the web app, and vice versa.** Browser tabs use an exclusive writer lock, but cannot share the desktop app's operating-system lock. Revision checks and recovery journals guard against observed conflicts and interrupted writes; keep full backups. Web group moves expect UTF-8 files and stop on unsupported contents. Full backups preserve binary files too.

```text
Library/
├─ notes/
│  ├─ <note UUID>.md
│  └─ <group>/<subgroup>/<note UUID>.md
└─ .tistnote/
   ├─ manifest.json
   ├─ history/<note UUID>/<version UUID>.json
   ├─ templates/<template UUID>.json
   ├─ trash/
   ├─ conflicts/
   └─ web-journal/
```

The desktop app also uses a local `vault.lock`. UUID filenames avoid Windows filename restrictions; titles come from note content. External editors must preserve metadata, entry IDs, and the `<!-- tistnote:entries -->` separator. Libraries are not encrypted. Permanently deleting notes and retained versions also removes their activity history.

## Development

Built with **Tauri 2, Rust, React 19, TypeScript, and Vite**. Use Node.js 22.12 or later. Windows desktop builds also require Rust MSVC, Visual Studio C++ Build Tools, Windows SDK, and WebView2.

```powershell
npm ci
npm run desktop
```

For real browser file access, run `npm run dev` and open `http://127.0.0.1:1420/`. The explicit development-only URL `http://127.0.0.1:1420/?preview=1` uses disposable browser storage instead of real library files. It is not the deployed web edition.

```powershell
npm test
npm run build
cargo test --lib --manifest-path src-tauri/Cargo.toml
```

### Windows builds

```powershell
npm run package
npm run package:offline
```

Executables are in `src-tauri/target/release/`; NSIS installers are in `src-tauri/target/release/bundle/nsis/`. Both commands use the same installer output name, so copy each result before building the other variant. Build dependency downloads need a network connection; the Windows app does not.

### GitHub Pages builds

```powershell
npm run build:pages
npx vite preview --outDir dist-pages --base /tistnote/
```

Publish the contents of `dist-pages/` to the root of `gh-pages`, including `.nojekyll`, then select that branch in **Settings → Pages**. The build uses the `/tistnote/` base path. HTTPS is required for local file APIs. Pushing `main` alone does not deploy a new web build.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/` | Interface, model, templates, localization, and PNG generation |
| `src/browser-vault.ts` | Browser folder permissions, file handles, backup, and import |
| `src/web-store.ts`, `src/markdown.ts` | Web storage, history, recovery, and Markdown compatibility |
| `src-tauri/` | Native storage, desktop commands, and Windows packaging |
| `public/` | Bundled icons and illustrations |
| `tests/`, `scripts/qa-*.js` | Domain/storage tests and browser flow checks |
| `docs/` | Product requirements and validation records |

See [product requirements](docs/PRD.md) and [validation](docs/VALIDATION.md) for scope and testing boundaries. Dependencies, build outputs, installers, and personal test libraries are excluded from source releases.
