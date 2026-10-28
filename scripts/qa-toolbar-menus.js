async page => {
  const results = [];
  const cases = [
    [320, 568, 'en', 'dark'], [393, 852, 'zh', 'light'],
    [430, 400, 'zh', 'light'], [744, 430, 'en', 'light'],
    [1040, 700, 'en', 'dark'], [1440, 1000, 'zh', 'light'],
  ];
  for (const [width, height, language, theme] of cases) {
    const context = await page.context().browser().newContext({ viewport: { width, height }, isMobile: width <= 744, hasTouch: width <= 744 });
    try {
      const tab = await context.newPage();
      const errors = [];
      tab.on('pageerror', error => errors.push(String(error)));
      await tab.goto('http://127.0.0.1:1420/?preview=1');
      await tab.evaluate(async ({ language, theme }) => {
        const { newNote, uid } = await import('/src/model.ts');
        const note = newNote();
        note.title = '菜单定位测试';
        note.entries = [{ id: uid(), name: '山与河流', reason: '独立测试数据' }];
        localStorage.setItem('tistnote-preferences-v1', JSON.stringify({ language, theme }));
        localStorage.setItem('tistnote-introduction-seen-v1', '1');
        localStorage.setItem('tistnote-development-preview-v1', JSON.stringify({ vault: { path: '菜单测试库', notes: [{ note, revision: uid(), group: '' }], groups: [], trash: [], templates: [], warnings: [] }, history: {} }));
      }, { language, theme });
      await tab.reload();
      await tab.locator('.tree-note').filter({ hasText: '菜单定位测试' }).click();
      const zh = language === 'zh';
      const more = tab.getByRole('button', { name: zh ? '更多笔记操作' : 'More note actions', exact: true });
      const menu = tab.locator('.editor-toolbar .more-menu');
      const checkBounds = async mode => {
        await menu.waitFor();
        await tab.waitForFunction(() => {
          const el = document.querySelector('.editor-toolbar .more-menu');
          if (!el) return false;
          const r = el.getBoundingClientRect(), v = visualViewport;
          return r.left >= (v?.offsetLeft ?? 0) + 7 && r.right <= (v?.offsetLeft ?? 0) + (v?.width ?? innerWidth) - 7 && r.top >= (v?.offsetTop ?? 0) + 7 && r.bottom <= (v?.offsetTop ?? 0) + (v?.height ?? innerHeight) - 7;
        }, null, { timeout: 3000 });
        const bounds = await menu.evaluate(el => {
          const r = el.getBoundingClientRect();
          const v = visualViewport;
          const buttons = [...el.querySelectorAll('button')];
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, viewportLeft: v?.offsetLeft ?? 0, viewportTop: v?.offsetTop ?? 0, width: v?.width ?? innerWidth, height: v?.height ?? innerHeight, minFont: Math.min(...buttons.map(b => parseFloat(getComputedStyle(b).fontSize))), scrollable: getComputedStyle(el).overflowY };
        });
        if (bounds.left < bounds.viewportLeft + 7 || bounds.right > bounds.viewportLeft + bounds.width - 7 || bounds.top < bounds.viewportTop + 7 || bounds.bottom > bounds.viewportTop + bounds.height - 7 || bounds.minFont < 18) throw Error(JSON.stringify({ width, height, mode, bounds }));
        await menu.getByRole('button').last().evaluate(el => el.scrollIntoView({ block: 'nearest' }));
        const reachable = await menu.getByRole('button').last().evaluate(el => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !!hit && el.contains(hit);
        });
        if (!reachable) throw Error(`Last menu item is clipped or covered: ${width} ${mode}`);
        return bounds;
      };
      await more.click();
      await checkBounds('reading');
      await more.click();
      await menu.waitFor({ state: 'hidden' });
      await tab.getByRole('button', { name: zh ? '品交' : 'Exchange', exact: true }).click();
      await checkBounds('exchange');
      await tab.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
      await tab.getByRole('button', { name: zh ? '编辑' : 'Edit', exact: true }).click();
      if (await tab.locator('.toolbar-actions > button').filter({ hasText: zh ? /^历史$/ : /^History$/ }).count()) throw Error('History still present outside More');
      await tab.locator('.toolbar-actions > button').filter({ hasText: zh ? '设置' : 'Settings' }).waitFor();
      await more.click();
      const editing = await checkBounds('editing');
      await menu.getByRole('button', { name: zh ? '历史' : 'History', exact: true }).click();
      const history = tab.getByRole('dialog');
      await history.waitFor();
      await history.getByRole('button', { name: zh ? '关闭对话框' : 'Close dialog', exact: true }).click();
      await more.click();
      await tab.screenshot({ path: `output/playwright/toolbar-menu-${width}-${height}-${language}.png` });
      await menu.getByRole('button', { name: zh ? '保存里程碑' : 'Save milestone', exact: true }).click();
      const milestone = tab.getByRole('dialog');
      await milestone.waitFor();
      await milestone.getByRole('button', { name: zh ? '关闭对话框' : 'Close dialog', exact: true }).click();
      await more.click();
      await tab.setViewportSize({ width: height, height: width });
      await checkBounds('resized while open');
      if (width === 320) {
        await tab.setViewportSize({ width: 320, height: 160 });
        await checkBounds('short viewport with scrolling');
        if (!await menu.evaluate(el => el.scrollHeight > el.clientHeight)) throw Error('Short viewport did not constrain menu height');
        await tab.setViewportSize({ width: height, height: width });
        await checkBounds('restored viewport');
      }
      await tab.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
      await more.click();
      await tab.mouse.click(2, 2);
      await menu.waitFor({ state: 'hidden' });
      if (errors.length) throw Error(errors.join('\n'));
      results.push({ width, height, language, theme, editing, exchange: true, actionsReachable: true, escapeAndOutsideClose: true, resize: true });
    } finally { await context.close(); }
  }
  return results;
}
