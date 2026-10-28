async page => {
  const results = [];
  const check = (ok, message) => { if (!ok) throw Error(message); };
  for (const [width, language] of [[1440, 'zh'], [390, 'zh'], [1440, 'en'], [390, 'en']]) {
    const context = await page.context().browser().newContext({ viewport: { width, height: 960 } });
    try {
      const tab = await context.newPage(), zh = language === 'zh';
      await tab.addInitScript(language => {
        localStorage.setItem('tistnote-preferences-v1', JSON.stringify({ language, theme: 'light' }));
        localStorage.setItem('tistnote-introduction-seen-v1', '1');
      }, language);
      await tab.goto('http://127.0.0.1:1420/?preview=1');
      await tab.getByRole('button', { name: zh ? '创建或打开本地资料库' : 'Create or open a local library', exact: true }).click();
      await tab.evaluate(async () => {
        const { command } = await import('/src/api.ts');
        const { newNote, uid } = await import('/src/model.ts');
        for (const name of ['原组/子组', '其他']) await command('group_create', { name });
        const note = newNote(); note.title = '重命名测试笔记';
        note.entries = [{ id: uid(), name: '山与河流', reason: '保留原内容' }];
        await command('save', { note, expected: null, group: '原组/子组' });
        await command('canvas_put', { expected: null, layout: { schema: 1, positions: { 'group:原组': { x: 100, y: 120 }, 'group:原组/子组': { x: 230, y: 230 } }, groupOrder: ['原组', '其他'] } });
      });
      await tab.reload();
      const state = () => tab.evaluate(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')));
      const before = await state();
      const group = path => tab.getByRole('treeitem', { name: (zh ? '分组 ' : 'Group ') + path, exact: true });
      const menu = tab.getByRole('menu');
      const rename = menu.getByRole('menuitem', { name: zh ? '重命名' : 'Rename', exact: true });
      const dialog = tab.getByRole('dialog', { name: zh ? '重命名' : 'Rename', exact: true });
      const input = dialog.getByRole('textbox', { name: zh ? '分组新名称' : 'New group name', exact: true });
      const save = dialog.getByRole('button', { name: zh ? '保存名称' : 'Save name', exact: true });
      await tab.locator('.tree-note').click({ button: 'right' });
      check(await rename.count() === 0, 'Note context menu can rename its parent');
      await tab.keyboard.press('Escape');
      await group('原组').click({ button: 'right' }); await rename.click();
      check(await input.inputValue() === '原组', 'Wrong root group prefilled');
      await input.fill(''); check(await save.isDisabled(), 'Blank rename accepted');
      await input.fill('其他'); await save.click();
      await dialog.getByRole('alert').waitFor();
      check(JSON.stringify((await state()).vault) === JSON.stringify(before.vault), 'Collision changed notes or groups');
      await input.fill('../越界'); await save.click();
      await dialog.getByRole('alert').waitFor();
      check(JSON.stringify((await state()).vault) === JSON.stringify(before.vault), 'Invalid path changed library');
      await input.fill('新组');
      const layoutCheck = await dialog.evaluate(el => ({ minFont: Math.min(...[...el.querySelectorAll('*')].filter(n => n.getClientRects().length && [...n.childNodes].some(t => t.nodeType === 3 && t.textContent.trim())).map(n => parseFloat(getComputedStyle(n).fontSize))), overflow: el.scrollWidth > el.clientWidth }));
      check(layoutCheck.minFont >= 18 && !layoutCheck.overflow, 'Rename dialog font or overflow regression');
      await tab.screenshot({ path: `output/playwright/group-rename-${width}-${language}.png` });
      await save.click(); await dialog.waitFor({ state: 'hidden' });
      await group('新组/子组').waitFor();
      let current = await state();
      check(current.vault.notes[0].group === '新组/子组', 'Descendant note path not updated');
      check(JSON.stringify(current.vault.notes[0].note) === JSON.stringify(before.vault.notes[0].note), 'Rename changed note content');
      let layout = JSON.parse(current.canvasRaw);
      check(layout.positions['group:新组'].x === 100 && layout.positions['group:新组/子组'].x === 230 && layout.groupOrder[0] === '新组' && !layout.positions['group:原组'], 'Canvas positions or order lost');
      await group('新组/子组').click({ button: 'right' }); await rename.click();
      check(await input.inputValue() === '子组', 'Nested rename should edit only leaf name');
      await input.fill('不应保存');
      await dialog.getByRole('button', { name: zh ? '取消' : 'Cancel', exact: true }).click();
      check((await state()).vault.groups.includes('新组/子组'), 'Cancel changed group');
      await group('新组/子组').click({ button: 'right' }); await rename.click();
      await input.fill('子组新名'); await save.click(); await dialog.waitFor({ state: 'hidden' });
      await group('新组/子组新名').waitFor();
      check((await state()).vault.notes[0].group === '新组/子组新名', 'Nested group moved outside its parent');
      if (width === 1440) {
        await tab.getByRole('button', { name: zh ? '笔记列表选项' : 'Note list options', exact: true }).click();
        await tab.getByRole('button', { name: zh ? '画布视图' : 'Canvas view', exact: true }).click();
        const branch = tab.locator('.graph-group[data-create-in="新组"]');
        await branch.focus(); await branch.click({ button: 'right' }); await rename.click();
        await input.fill('画布分组'); await save.click(); await dialog.waitFor({ state: 'hidden' });
        await tab.locator('.graph-group[data-create-in="画布分组"]').waitFor();
        current = await state();
        check(current.vault.notes[0].group === '画布分组/子组新名', 'Canvas rename did not update descendants');
        check(JSON.stringify(current.vault.notes[0].note) === JSON.stringify(before.vault.notes[0].note), 'Canvas rename changed content');
      }
      results.push({ width, language, rightClickRename: true, descendantsPreserved: true, layoutPreserved: true, collisionAndInvalidPathProtected: true, cancel: true, nestedName: true, canvas: width === 1440 });
    } finally { await context.close(); }
  }
  return results;
}
