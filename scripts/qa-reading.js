async page => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  await page.evaluate(async () => {
    const {command} = await import('/src/api.ts');
    const {newNote,uid} = await import('/src/model.ts');
    await command('group_create',{name:'电影'});
    for (const [title, ranked, entries] of [
      ['空笔记', true, [['', '空条目理由不应显示']]],
      ['无排名清单', false, [['白芝麻','简单而清晰']]],
      ['电影清单', true, [['花样年华','光影与时间。\n想再看一遍。'],['','空条目理由不应显示'],['一一','']]]
    ]) {
      const note = newNote(); note.title = title; note.ranked = ranked;
      note.description = title === '电影清单' ? '那些看过以后，还想再看一遍的电影。' : '';
      note.entries = entries.map(([name,reason]) => ({id:uid(),name,reason}));
      note.tags = ['测试'];
      await command('save',{note,expected:null,group:title === '电影清单' ? '电影' : ''});
    }
  });
  await page.reload();
  const card = name => page.locator('.note-card').filter({has:page.getByRole('heading',{name,exact:true})});
  await card('电影清单').click();
  const reader = page.getByRole('article',{name:'笔记内容',exact:true});
  const edit = () => page.getByRole('button',{name:'编辑',exact:true}).click();
  const done = async () => {
    await page.getByRole('button',{name:'完成编辑',exact:true}).click();
    await page.getByRole('dialog',{name:/^(更新日志|标题重复)$/}).waitFor();
    const dialog = page.getByRole('dialog',{name:'更新日志',exact:true});
    if(await dialog.isVisible()) {
      await dialog.getByRole('textbox',{name:'更新日志（可选）',exact:true}).fill('阅读模式验证');
      await dialog.getByRole('button',{name:'提交更新',exact:true}).click();
    }
  };
  await reader.waitFor();
  check(await page.locator('.editor input,.editor textarea,.editor select,[contenteditable="true"]').count() === 0, 'Browse mode contains editable fields');
  check(await page.locator('.editor .entry-actions,.editor .add-entry,.editor .editor-footer,.editor .rank-handle,.editor .save-state').count() === 0, 'Browse mode exposes edit controls');
  check(await reader.locator('li').count() === 2, 'Browse mode includes blank entries');
  check(await reader.getByText('空条目理由不应显示',{exact:true}).count() === 0, 'Blank entry reason leaked into reading view');
  check(JSON.stringify(await reader.locator('ol > li').evaluateAll(nodes => nodes.map(n => n.value))) === '[1,3]', 'Original ranks were changed');
  await page.getByRole('button',{name:'更多笔记操作',exact:true}).click();
  check(await page.getByRole('button',{name:'移入回收站',exact:true}).count() === 0, 'Browse menu exposes deletion');
  await page.locator('.editor').getByRole('button',{name:'历史',exact:true}).click();
  await page.getByRole('dialog',{name:'审美与偏好的变化',exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
  await reader.waitFor();
  await edit();
  const title = page.getByRole('textbox',{name:'笔记主题',exact:true});
  await title.waitFor();
  await page.getByRole('button',{name:'添加一个选择',exact:true}).waitFor();
  await title.fill('无排名清单');
  await done();
  const duplicate = page.getByRole('dialog',{name:'标题重复',exact:true});
  await duplicate.waitFor();
  check(await page.locator('.note-reading').count() === 0, 'Duplicate title switched to browse before saving');
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes.find(r => r.note.title === '电影清单'));
  check(!!original, 'Duplicate title overwrote stored note');
  await duplicate.getByRole('button',{name:'知道了',exact:true}).click();
  await title.fill('电影清单·修订');
  await page.getByRole('textbox',{name:'条目 1 理由',exact:true}).fill('更新后的理由。\n第二行也要保留。');
  await done();
  await reader.getByRole('heading',{name:'电影清单·修订',exact:true}).waitFor();
  const saved = await page.evaluate(id => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes.find(r => r.note.id === id), original.note.id);
  check(saved.note.title === '电影清单·修订' && saved.note.entries[0].reason.includes('第二行'), 'Done returned before persisting edits');
  await page.getByRole('button',{name:'编辑',exact:true}).press('Control+z');
  check(await reader.getByRole('heading',{name:'电影清单·修订',exact:true}).isVisible(), 'Browse Ctrl+Z edited the note');
  await card('无排名清单').click();
  check(await reader.locator('ul > li').count() === 1 && await reader.locator('ol').count() === 0, 'Unranked browse mode displays ranks');
  await card('空笔记').click();
  await reader.getByText('还没有填写条目',{exact:true}).waitFor();
  check(await reader.locator('li').count() === 0, 'Empty note renders a fake entry');
  await page.getByRole('button',{name:'新建笔记',exact:true}).click();
  await title.waitFor();
  await title.fill('刚创建的笔记');
  await done();
  await reader.waitFor();
  await card('电影清单·修订').click();
  await page.screenshot({path:'output/playwright/note-reading-desktop.png',fullPage:true});
  const audit = () => page.evaluate(() => {
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('dialog:not([open])');
    const nodes = [...document.querySelectorAll('body *')].filter(el=>visible(el)&&([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('input,textarea,select')));
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,minimumFont:Math.min(...nodes.map(el=>parseFloat(getComputedStyle(el).fontSize))),markers:[...document.querySelectorAll('.reading-entries > li')].map(el=>parseFloat(getComputedStyle(el,'::marker').fontSize))};
  });
  const desktop = await audit();
  check(desktop.minimumFont >= 18 && desktop.markers.every(px=>px>=18) && desktop.scrollWidth <= desktop.width, 'Desktop reading layout failed: '+JSON.stringify(desktop));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/note-reading-narrow.png',fullPage:true});
  const narrow = await audit();
  check(narrow.minimumFont >= 18 && narrow.scrollWidth <= narrow.width, 'Narrow reading layout failed');
  await edit();
  await title.waitFor();
  await page.screenshot({path:'output/playwright/note-editing-narrow.png',fullPage:true});
  const editing = await audit();
  check(editing.minimumFont >= 18 && editing.scrollWidth <= editing.width, 'Narrow edit layout failed');
  await done();
  await reader.waitFor();
  await page.reload();
  await page.getByRole('tree',{name:'笔记文件树',exact:true}).waitFor();
  await card('电影清单·修订').click();
  await reader.waitFor();
  check(await page.getByRole('button',{name:'编辑',exact:true}).isVisible() && await page.locator('.editor input,.editor textarea,.editor select').count() === 0, 'Reload did not default to browse');
  return {default:'browse on open and reload',newNote:'starts editing',content:'ranked/unranked, reasons, no blank entries',controls:'hidden until Edit',done:'saved before browse',duplicateTitle:'stays in editor and preserves original',browseUndo:'blocked',history:'available from More',desktop,narrow,editing};
}
