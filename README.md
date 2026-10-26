# Tistnote · 品记

[简体中文](README.zh-CN.md)

**Notice the world. Record your tastes. Understand yourself.**

Tistnote is a local-first list notebook for personal preferences, judgments, and aesthetic. Keep what you love, what you dislike, what you value, and what you are still figuring out. Write down your reasons and revisit how your perspective changes.

## Get Tistnote

| Edition | Link | Requirements |
| --- | --- | --- |
| Web app | [Open Tistnote on GitHub Pages](https://leoatopos.github.io/tistnote/) | Current desktop Chrome or Edge; authorize a local library folder |
| Android app | [Download the signed APK](https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-android.apk) | Android 8.0+ with an up-to-date Android System WebView; universal APK |
| Windows offline installer | [Download 0.2.0](https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-windows-x64-setup.exe) | Windows 10/11 x64; includes the WebView2 offline runtime |
| Windows portable executable | [Download tistnote.exe](https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote.exe) | Microsoft WebView2 installed |

[All releases, checksums, and build information](https://github.com/LeoAtopos/tistnote/releases). Windows builds are currently unsigned.

In the app, open **Settings → Install a local version** for Windows and Android downloads. The installed platform's download is hidden. The existing Windows download URL is unchanged.

## Features

- Ranked or unranked lists, descriptions, tags, and optional reasons for each choice.
- Compact note trees, nested groups backed by real folders, drag-and-drop moves, and context menus.
- Optional note canvas under **My notes → More → Canvas view**, with groups and subgroups branching from Tistnote. Hollow circles mark empty notes, filled green circles mark populated notes, and a small extra dot marks reviews due. Lists remain the default.
- Search, filtering, and sorting. Titles are unique across the library; new untitled notes receive unique numbered titles.
- 45 built-in themes covering positive, negative, and mixed feelings; personal templates and template coverage. The default template canvas branches by tag, supports panning and zooming, and marks recorded themes with filled green circles. Open a circle for template actions, or switch to cards.
- Separate reading and editing modes, autosaved drafts, optional update logs, and cancel editing.
- Version comparison and restoration, milestones, and a yearly activity graph of creation, updates, and reviews.
- Configurable review intervals, green reminders, and review confirmation recorded in history.
- PNG sharing with optional signatures, anonymous attribution, long images or pages. Both image types include a QR code for the web app; invitations omit your own answers.
- Chinese and English; light, dark, or system appearance. Preferences stay on your device.
- Full library backup and restoration, Tistnote Markdown import, and Trash recovery.

Tistnote supports thoughtful writing: favorite books, foods you avoid, people you admire, ideas you question, or feelings you have not yet resolved. Take time to compare your choices and understand how they change.

## Local files and privacy

**Notes are not uploaded. No account, telemetry, cloud sync, or application server is used.**

The Windows app runs locally, including history, templates, and image generation. The web edition downloads app assets from GitHub Pages, then reads and writes only the folder you explicitly authorize. GitHub serves the website; it does not store your library.

The Android app bundles its interface and illustrations, requires no Internet permission, and writes real Markdown libraries in the app's private storage. Create or switch libraries inside the app. Groups, history, reviews, templates, and Trash use the same data format as the other editions. Android's system document picker handles ZIP backups, backup restoration, Markdown import, and PNG export. PNG copying uses the Android clipboard.

**Export a full Android backup before uninstalling: uninstalling removes app-private libraries.** Android ZIP backups contain `notes/` and `.tistnote/`; extract them into a folder to open them on Windows or in the web app. To restore a Windows/web library on Android, ZIP its complete folder including `.tistnote/`, then use Restore backup. Restoring creates a new library and preserves the current one. Android restoration accepts ZIPs up to 256 MB compressed and uncompressed, with a 64 MB per-file limit. More details are in the [Android guide](docs/ANDROID.md).

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
```

Executables are in `src-tauri/target/release/`; NSIS installers are in `src-tauri/target/release/bundle/nsis/`. The default build includes the WebView2 offline runtime; `npm run package:offline` remains an equivalent command. The existing Windows download URL is preserved and serves the complete offline installer. Build dependency downloads need a network connection; the Windows app does not. The web-only installation link is hidden in the Windows app.

### GitHub Pages builds

```powershell
npm run build:pages
npx vite preview --outDir dist-pages --base /tistnote/
```

Publish the contents of `dist-pages/` to the root of `gh-pages`, including `.nojekyll`, then select that branch in **Settings → Pages**. The build uses the `/tistnote/` base path. HTTPS is required for local file APIs. Pushing `main` alone does not deploy a new web build.

### Android builds

Install JDK 17+, Gradle 8.11.1, and Android SDK platform/build-tools 35. Set `JAVA_HOME`, `GRADLE_HOME`, and `ANDROID_HOME`, then run `npm run package:android` on Windows. The script builds bundled assets, runs Android storage tests and release lint, and produces a signed universal APK in `android/app/build/outputs/apk/release/`.

The signing key and credentials stay outside the repository, under `%LOCALAPPDATA%/TistnoteBuild/signing/`. Keep a secure backup of them for future compatible updates. They must never be committed or uploaded. See [Android build and data details](docs/ANDROID.md).

## Source layout

| Path | Purpose |
| --- | --- |
| `src/` | Interface, model, templates, localization, and PNG generation |
| `src/browser-vault.ts` | Browser folder permissions, file handles, backup, and import |
| `src/web-store.ts`, `src/markdown.ts` | Web storage, history, recovery, and Markdown compatibility |
| `src-tauri/` | Native storage, desktop commands, and Windows packaging |
| `android/`, `src/android-*.ts` | Offline Android app, atomic local files, document picker, and shared storage adapter |
| `public/` | Bundled icons and illustrations |
| `tests/`, `scripts/qa-*.js` | Domain/storage tests and browser flow checks |
| `docs/` | Product requirements and validation records |

See [product requirements](docs/PRD.md) and [validation](docs/VALIDATION.md) for scope and testing boundaries. Dependencies, build outputs, installers, and personal test libraries are excluded from source releases.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 LeoAtopos.
