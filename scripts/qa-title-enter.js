async page => {
  const results = [];
  const check = (ok, message) => { if (!ok) throw Error(message); };
  for (const [width, language] of [[1440, 'zh'], [390, 'zh'], [1440, 'en'], [390, 'en']]) {
    const context = await page.context().browser().newContext({ viewport: { width, height: 960 }, isMobile: width < 600, hasTouch: width < 600 });
    try {
      const tab = await context.newPage();
      const errors = [];
      tab.on('pageerror', error => errors.push(String(error)));
      await tab.addInitScript(language => {
        localStorage.setItem('tistnote-preferences-v1', JSON.stringify({ language, theme: 'light' }));
        localStorage.setItem('tistnote-introduction-seen-v1', '1');
        localStorage.setItem('tistnote-browser-tip-dismissed-v1', '1');
      }, language);
      const zh = language === 'zh';
      await tab.goto('http://127.0.0.1:1420/?preview=1');
      await tab.getByRole('button', { name: zh ? '创建或打开本地资料库' : 'Create or open a local library', exact: true }).click();
      await tab.getByRole('button', { name: zh ? '写一份新笔记' : 'Write a new note', exact: true }).click();
      const title = tab.getByRole('textbox', { name: zh ? '笔记主题' : 'Note title', exact: true });
      const description = tab.getByRole('textbox', { name: zh ? '主题说明' : 'Description', exact: true });
      const first = tab.getByRole('textbox', { name: zh ? '条目 1 名称' : 'Entry 1 name', exact: true });
      const focused = locator => locator.evaluate(el => document.activeElement === el);
      await tab.waitForFunction(() => document.activeElement?.matches('.note-title'));
      check(await title.inputValue() === '', 'Default title is actual input instead of a placeholder');
      check(await title.getAttribute('placeholder') === (zh ? '我最...' : 'My most...'), 'Wrong placeholder');
      check(await tab.locator('.note-properties').count() === 0, 'Properties visible by default');
      await tab.screenshot({ path: `output/playwright/writing-empty-${width}-${language}.png` });
      await tab.keyboard.type('愿意再去的地方');
      for (const event of [{ key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }, { key: 'Enter', repeat: true }, { key: 'Enter', ctrlKey: true }, { key: 'Enter', metaKey: true }, { key: 'Enter', altKey: true }, { key: 'Enter', shiftKey: true }]) {
        await title.dispatchEvent('keydown', event);
        check(await focused(title), 'IME/modified title Enter moved focus');
      }
      await title.press('Enter');
      check(await focused(description), 'Title Enter missed description');
      await description.fill('值得再次出发');
      for (const event of [{ key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }, { key: 'Enter', repeat: true }, { key: 'Enter', ctrlKey: true }, { key: 'Enter', metaKey: true }, { key: 'Enter', altKey: true }]) {
        await description.dispatchEvent('keydown', event);
        check(await focused(description) && await tab.locator('.entry').count() === 0, 'IME/modified description Enter added an entry');
      }
      await description.press('Shift+Enter');
      await tab.keyboard.type('也记下每一次变化');
      check((await description.inputValue()).includes('\n'), 'Shift+Enter no longer inserts a line break');
      await description.press('Enter');
      await first.waitFor();
      await tab.waitForFunction(() => document.activeElement?.matches('[id^="entry-"]'));
      check(await focused(first), 'Description Enter missed the first entry');
      await first.fill('大山与河流');
      await first.press('Enter');
      const reason = tab.getByRole('textbox', { name: zh ? '条目 1 理由' : 'Entry 1 reason', exact: true });
      check(await focused(reason) && await tab.locator('.entry').count() === 1, 'Entry Enter skipped its reason or added another entry');
      await tab.keyboard.type('喜欢安静的地方');
      await reason.press('Shift+Enter');
      await tab.keyboard.type('也喜欢河流');
      check((await reason.inputValue()).includes('\n'), 'Reason Shift+Enter did not insert a newline');
      for (const event of [{ key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }, { key: 'Enter', repeat: true }]) {
        await reason.dispatchEvent('keydown', event);
        check(await focused(reason) && await tab.locator('.entry').count() === 1, 'Reason IME or repeat added an entry');
      }
      await reason.press('Enter');
      const second = tab.getByRole('textbox', { name: zh ? '条目 2 名称' : 'Entry 2 name', exact: true });
      await second.waitFor();
      await tab.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === (document.documentElement.lang === 'en' ? 'Entry 2 name' : '条目 2 名称'));
      check(await focused(second), 'Reason Enter missed next entry');
      await reason.focus(); await reason.press('Enter');
      check(await focused(second) && await tab.locator('.entry').count() === 2, 'Reason Enter duplicated an existing next entry');
      await description.focus(); await description.press('Enter');
      check(await focused(first) && await tab.locator('.entry').count() === 2, 'Returning to first entry added a duplicate');
      await title.focus(); await title.press('Tab');
      check(await focused(description), 'Title Tab missed description');
      await description.press('Tab');
      check(await focused(first), 'Description Tab focused a property or drag handle');
      const options = () => tab.locator('.editor-toolbar').getByRole('button', { name: zh ? '设置' : 'Settings', exact: true });
      await options().click();
      await tab.locator('.note-properties').waitFor();
      await tab.getByRole('textbox', { name: zh ? '笔记标签' : 'Note tags', exact: true }).fill('测试');
      await title.focus(); await title.press('Tab'); await description.press('Tab');
      check(await focused(first), 'Expanded properties interrupted sequential writing');
      await options().click();
      check(await tab.locator('.note-properties').count() === 0, 'Properties did not collapse');
      await title.fill('临时标题'); await title.press('Control+z');
      check(await title.inputValue() === '愿意再去的地方', 'Undo desynchronized title input');
      await title.fill('');
      check(await title.inputValue() === '', 'Clearing title restored an actual default title');
      await title.press('Tab'); await description.press('Tab');
      check(await focused(first), 'Blank title broke writing flow');
      await title.fill('愿意再去的地方');
      await tab.getByRole('button', { name: zh ? '完成编辑' : 'Finish editing', exact: true }).click();
      await tab.getByRole('dialog').getByRole('button', { name: zh ? '提交更新' : 'Submit update', exact: true }).click();
      await tab.getByRole('button', { name: zh ? '编辑' : 'Edit', exact: true }).click();
      check(await title.inputValue() === '愿意再去的地方', 'Saved title changed on reopening');
      check(await tab.locator('.note-properties').count() === 0, 'Properties reopened by default');
      const stored = await tab.evaluate(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes);
      check(stored.length === 1 && stored[0].note.title === '愿意再去的地方' && stored[0].note.tags.includes('测试') && stored[0].note.entries[0].name === '大山与河流', 'Stored draft/title/options mismatch');
      await tab.screenshot({ path: `output/playwright/writing-flow-${width}-${language}.png` });
      const minFont = await description.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      check(minFont >= 18 && await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Font or horizontal overflow regression');
      const createAnother = async () => {
        const back = tab.locator('.editor-toolbar .back-button');
        if (await back.isVisible()) await back.click();
        await tab.getByRole('button', { name: zh ? '新建笔记' : 'New note', exact: true }).click();
        await tab.waitForFunction(() => document.activeElement?.matches('.note-title'));
        check(await title.inputValue() === '', 'Numbered draft leaked into title input');
      };
      await createAnother();
      await title.press('Enter'); await description.press('Tab');
      await first.waitFor();
      await tab.waitForFunction(() => document.activeElement?.matches('[id^="entry-"]'));
      check(await focused(first) && await tab.locator('.entry').count() === 1, 'Empty description Tab did not create/focus first entry');
      await createAnother();
      const drafts = await tab.evaluate(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes);
      check(drafts.length === 3 && new Set(drafts.map(r => r.note.title)).size === 3, 'Repeated blank drafts conflicted or reused titles');
      check(drafts.every(r => !['我最...', 'My most...'].includes(r.note.title)), 'Placeholder was saved as a title');
      check(!errors.length, errors.join('\n'));
      results.push({ width, language, emptyFocusedTitle: true, placeholderOnly: true, enterAndTabFlow: true, imeGuard: true, shiftEnter: true, optionsOptIn: true, storedContentPreserved: true, repeatedDraftsUnique: true, minFont });
    } finally { await context.close(); }
  }
  return results;
}
