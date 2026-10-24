async (page) => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.setViewportSize({ width: 1440, height: 960 });
  const card = name => page.locator('.note-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const initialCount = await page.locator('.note-card').count();
  const title = page.getByRole('textbox', { name: '笔记主题', exact: true });
  const saved = () => page.locator('.save-state').filter({ hasText: /^已保存$/ }).waitFor();
  for (const name of ['想反复重看的电影（副本）', '想反复重看的电影（副本）（2）']) {
    await card('想反复重看的电影').click();
    await page.getByRole('button', {name:'编辑',exact:true}).click();
    await page.getByRole('button', { name: '更多笔记操作', exact: true }).click();
    await page.getByRole('button', { name: '复制笔记', exact: true }).click();
    await page.waitForFunction(name => document.querySelector('.reading-title')?.textContent === name, name);
  }
  check(await page.locator('.note-card').count() === initialCount + 2, 'Repeated copies did not keep unique titles');
  await card('暂存空笔记').click();
  await page.getByRole('button', {name:'编辑',exact:true}).click();
  await page.getByRole('button', { name: '添加一个选择', exact: true }).click();
  await page.locator('.entry-body input').fill('   ');
  await saved();
  check(await card('暂存空笔记').locator('.empty-mark').count() === 1, 'Blank entry incorrectly removes empty marker');
  await title.fill('  想反复重看的电影  ');
  await page.getByRole('dialog', { name: '标题重复', exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/duplicate-title-dialog.png', fullPage: true });
  await page.getByRole('button', { name: '知道了', exact: true }).click();
  await title.fill('暂存空笔记');
  await saved();
  const long = '这是一个很长的列表标题用于确认字号保持可读并且标题换行时空标记仍然留在标题所在行';
  await title.fill(long);
  await saved();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^笔记/ }).first().click();
  const layout = await card(long).evaluate(el => {
    const title = el.querySelector('h2');
    const mark = el.querySelector('.empty-mark');
    return {
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      titleFont: parseFloat(getComputedStyle(title).fontSize),
      markFont: parseFloat(getComputedStyle(mark).fontSize),
      sameRow: Math.abs(title.getBoundingClientRect().top - mark.getBoundingClientRect().top) < 10,
      inside: mark.getBoundingClientRect().right <= innerWidth
    };
  });
  check(layout.width <= layout.viewport && layout.titleFont >= 18 && layout.markFont >= 18 && layout.sameRow && layout.inside, 'Long title layout failed: ' + JSON.stringify(layout));
  await page.screenshot({ path: 'output/playwright/compact-long-title-narrow.png', fullPage: true });
  await card(long).click();
  await page.getByRole('button', {name:'编辑',exact:true}).click();
  await title.fill('暂存空笔记');
  await saved();
  return { copies: 'unique sequence', whitespaceRename: 'blocked', blankEntry: 'still empty', rejectedRenameReverted: 'saved state restored', longTitle: layout };
}
