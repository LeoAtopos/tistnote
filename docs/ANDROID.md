# Android edition

[中文说明](../README.zh-CN.md#下载安卓版本) · [Download APK](https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-android.apk)

The Android edition supports Android 8.0 (API 26) or later with a current Android System WebView. It is a signed universal APK: its interface is bundled locally, it contains no CPU-specific native libraries, and it requests no Internet or broad storage permissions.

## Libraries and backups

Create or select a library using the app's local library dialog. Libraries are stored in the application's private `files/libraries/` directory. Each library contains the same `notes/` and `.tistnote/` files as the Windows/web editions. The small `.tistnote/android-library.json` file records its display name. Individual notes retain their IDs when backed up or restored; Markdown import assigns fresh IDs.

Private files cannot be browsed directly by other apps. Use Full backup to choose a ZIP destination through Android's document picker. **Uninstalling the app removes private libraries: export a full backup first.** The app disables automatic cloud backups and device transfer; migration is an explicit user operation.

Extract an Android backup and open its folder on Windows/web. To move a Windows/web library to Android, ZIP the full library folder, including `.tistnote/`. Both a ZIP with `notes/` and `.tistnote/` at its root and a ZIP with one enclosing library folder are supported. Restore backup creates a new private library, validates its manifest, notes and history, and only then switches the active library. It never merges into an existing library.

ZIP restoration is limited to 10,000 entries, 256 MB compressed/uncompressed, and 64 MB per file. Path traversal, duplicate paths, unsupported roots and symlinks are rejected. File operations use strict UTF-8, atomic replacement and the shared store's recovery journals; malformed text does not silently replace original data. ZIP backup preserves binary attachments as well as empty groups and omits the desktop session lock.

## Images and Android navigation

Save image opens the system folder picker and writes PNG files into a fresh Tistnote subfolder. Choose a writable folder such as Documents; Android may refuse the storage or Downloads root. Copy to clipboard uses a private FileProvider image URI and Android's clipboard.

The Android Back action dismisses open dialogs, returns from a note to the list, or saves the current draft before leaving the app. Backgrounding also requests a save when an operation is not already running. No account, web server, remote assets or telemetry is part of the application.

## Build

Requirements: Node.js 22.12+, PowerShell 7 on Windows, JDK 17 or 21, Gradle 8.11.1, Android SDK platform 35 and build-tools 35.0.0. No Rust/NDK is required for this edition. `android/` is a small Java/WebView host; `src/android-vault.ts` adapts private files to the existing `WebStore`.

On Windows, set `JAVA_HOME`, `GRADLE_HOME` and `ANDROID_HOME`, then run:

```powershell
npm ci
npm run package:android
```

The script builds `dist-android/`, includes LICENSE, runs the four native file/archive tests and release lint, and signs `android/app/build/outputs/apk/release/app-release.apk`. The first build creates a signing key in `%LOCALAPPDATA%/TistnoteBuild/signing/` with permissions restricted to the current user and SYSTEM. Later builds reuse it. Keep a secure backup of this directory: losing the key prevents installing compatible updates over an existing signed app. Do not publish the key or its credentials.

For other build hosts, run `npm run build:android`, copy LICENSE into `dist-android/`, set `TISTNOTE_ANDROID_KEYSTORE`, `TISTNOTE_ANDROID_STORE_PASSWORD` and `TISTNOTE_ANDROID_KEY_PASSWORD` (alias `tistnote`), then run Gradle's `testDebugUnitTest lintRelease assembleRelease` tasks from `android/`. Release WebView inspection is disabled; debug inspection is enabled only for local testing.
