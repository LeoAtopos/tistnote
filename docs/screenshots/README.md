# README screenshots / README 截图

These PNGs are captures of the running Tistnote production web interface, not mockups. Each language has its own interface language and localized example notes. The notes, reasons, dates, and activity history are fictional demonstration data; they are not user records or evidence of real usage.

截图来自实际运行的品记生产版网页界面，并非设计稿。中文和英文分别使用对应语言的界面与范例笔记。笔记、理由、日期和历史均为虚构演示内容，不包含用户资料，也不代表真实使用时长或活跃度。

- Reading / 品单浏览：`reading-en.png`, `reading-zh.png`.
- Note canvas / 笔记画布：`notes-canvas-en.png`, `notes-canvas-zh.png`.
- Template canvas and card / 模板库画布与卡片：`templates-en.png`, `templates-zh.png`.
- History / 使用历史：`history-en.png`, `history-zh.png`.

Captured at 1440 × 1000 CSS pixels, with a 1440 × 1250 viewport for history so the selected day's records are fully visible. Device scale factor is 1. No UI elements or styles are hidden or replaced for capture. Visible interface text remains at least 18 CSS pixels. The browser notice is dismissed using its own close button.

The capture script creates real Markdown and history files in an isolated browser OPFS library. It automates the folder-picker result; the application still loads and renders those files through its normal storage adapter. It does not read or change `example/`, the user's browser storage, or the user's libraries.

To regenerate with Playwright CLI, build the web app, serve `dist-pages/`, create a dedicated browser session, and run the capture function:

```powershell
npm run build:pages
npx vite preview --host 127.0.0.1 --port 4173 --outDir dist-pages --base /tistnote/
# In another terminal, with Playwright CLI available:
npx --no-install --package @playwright/cli playwright-cli -s=readme-screens open http://127.0.0.1:4173/tistnote/
npx --no-install --package @playwright/cli playwright-cli -s=readme-screens run-code --filename scripts/capture-readme.js
npx --no-install --package @playwright/cli playwright-cli -s=readme-screens close
```
