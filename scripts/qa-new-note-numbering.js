async page => {
  if (!new URL(page.url()).searchParams.has('preview')) throw Error('Use isolated preview');
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.evaluate(() => localStorage.removeItem('tistnote-development-preview-v1'));
  await page.reload();
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  const originals = await page.evaluate(async () => {
    const {command} = await import('/src/api.ts');
    const {newNote} = await import('/src/model.ts');
    await command('group_create',{name:'分组测试'});
    const records = [];
    for (const [index,title] of ['未命名笔记','未命名笔记（1）','未命名笔记（3）'].entries()) {
      const note = newNote(); note.title = title;
      records.push(await command('save',{note,expected:null,group:index ? '分组测试' : ''}));
    }
    return records;
  });
  await page.reload();
  const title = page.getByRole('textbox',{name:'笔记主题',exact:true});
  for (const expected of ['未命名笔记（2）','未命名笔记（4）']) {
    await page.getByRole('button',{name:'新建笔记',exact:true}).click();
    check(await title.inputValue() === expected, 'Wrong generated title: '+await title.inputValue());
    check(await page.getByRole('dialog',{name:'标题重复',exact:true}).count() === 0, 'Creation blocked');
  }
  await page.getByRole('treeitem',{name:'分组 分组测试',exact:true}).click();
  await page.getByRole('button',{name:'新建笔记',exact:true}).click();
  check(await title.inputValue() === '未命名笔记（5）', 'Group creation ignored global titles');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')));
  check(state.vault.notes.length === 6 && new Set(state.vault.notes.map(r=>r.note.title)).size === 6, 'Notes missing or duplicated');
  for (const original of originals) check(JSON.stringify(state.vault.notes.find(r=>r.note.id===original.note.id)) === JSON.stringify(original), 'Original record changed');
  check(state.vault.notes.find(r=>r.note.title==='未命名笔记（5）').group === '分组测试', 'Selected group was lost');
  check(Object.values(state.history).every(versions=>versions.length === 0), 'Blank numbered notes created content history');
  await page.getByRole('button',{name:'完成编辑',exact:true}).click();
  await page.screenshot({path:'output/playwright/new-note-numbering-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/^笔记/}).first().click();
  await page.screenshot({path:'output/playwright/new-note-numbering-narrow.png',fullPage:true});
  await page.reload();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes);
  check(persisted.length === 6 && new Set(persisted.map(r=>r.note.title)).size === 6, 'Reload lost numbered notes');
  return {created:['未命名笔记（2）','未命名笔记（4）','未命名笔记（5）'],scope:'global across folders',originals:'unchanged',history:'empty until content',reload:'persisted'};
}
