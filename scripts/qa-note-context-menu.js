async page => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('tistnote-introduction-seen-v1', '1');
  });
  await page.reload();
  await page.getByRole('button', { name: '创建或打开本地资料库', exact: true }).click();
  const browser = page.locator('.note-browser');
  const menu = page.getByRole('menu', { name: '笔记新建菜单' });
  const dialog = page.getByRole('dialog', { name: '新建分组', exact: true });
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')));
  const rootMenu = async () => {
    const b = await browser.boundingBox();
    await page.mouse.click(b.x + b.width - 12, b.y + b.height - 20, { button: 'right' });
    await menu.waitFor();
  };
  const createFolder = async name => {
    await menu.getByRole('menuitem', { name: '新建分组', exact: true }).click();
    await dialog.getByRole('textbox', { name: '分组名称' }).fill(name);
    await dialog.getByRole('button', { name: '新建分组', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  };
  await rootMenu();
  await createFolder('阅读');
  const folder = page.getByRole('treeitem', { name: '分组 阅读', exact: true });
  await folder.click({ button: 'right' });
  await createFolder('作家');
  check((await state()).vault.groups.includes('阅读/作家'), 'Nested folder was not created in parent');
  const child = page.getByRole('treeitem', { name: '分组 阅读/作家', exact: true });
  await child.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '新建笔记', exact: true }).click();
  await page.getByRole('textbox', { name: '笔记主题', exact: true }).waitFor();
  check((await state()).vault.notes[0].group === '阅读/作家', 'Note created in wrong folder');
  const note = browser.getByRole('treeitem').filter({ hasText: '未命名笔记' });
  await note.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '新建笔记', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes.length === 2);
  let notes = (await state()).vault.notes;
  check(new Set(notes.map(r => r.note.title)).size === 2 && notes.every(r => r.group === '阅读/作家'), 'Duplicate creation or note context destination failed');
  await rootMenu();
  await menu.getByRole('menuitem', { name: '新建笔记', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes.length === 3);
  notes = (await state()).vault.notes;
  check(notes.filter(r => !r.group).length === 1 && new Set(notes.map(r => r.note.title)).size === 3, 'Blank area must create in root with unique title');
  await rootMenu();
  await menu.getByRole('menuitem', { name: '新建分组', exact: true }).click();
  await dialog.getByRole('textbox', { name: '分组名称' }).fill('阅读');
  await dialog.getByRole('button', { name: '新建分组', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  check((await state()).vault.groups.length === 2, 'Duplicate folder overwrote data');
  await dialog.getByRole('textbox', { name: '分组名称' }).fill('../越界');
  await dialog.getByRole('button', { name: '新建分组', exact: true }).click();
  check((await state()).vault.groups.length === 2, 'Invalid path accepted');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await rootMenu();
  await page.keyboard.press('ArrowDown');
  check(await menu.getByRole('menuitem', { name: '新建分组' }).evaluate(el => el === document.activeElement), 'Keyboard menu navigation failed');
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  await rootMenu();
  await page.locator('.editor h1, .note-title').first().click();
  await menu.waitFor({ state: 'hidden' });
  const layouts = [];
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.rail nav button').first().click();
    await rootMenu();
    const layout = await menu.evaluate(el => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, minFont: Math.min(...[...el.querySelectorAll('button')].map(button => parseFloat(getComputedStyle(button).fontSize))) };
    });
    check(layout.left >= 0 && layout.top >= 0 && layout.right <= width && layout.bottom <= height && layout.minFont >= 13, 'Menu clipped or font too small');
    layouts.push({ width, height, ...layout });
    await page.screenshot({ path: `output/playwright/note-context-menu-${width}.png` });
    await page.keyboard.press('Escape');
  }
  return { creation: 'root, folder, note parent, nested folder', validation: 'unique note titles, duplicate folder, invalid path', dismissal: 'outside click and Escape', keyboard: 'arrow navigation', layouts };
}
