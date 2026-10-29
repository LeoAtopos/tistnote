async page => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const base = 'output/playwright/';
  await page.goto(new URL('/?preview=1', page.url().startsWith('http') ? page.url() : 'http://127.0.0.1:1420').href);
  await page.evaluate(async () => {
    const { newNote, uid } = await import('/src/model.ts');
    const note = newNote();
    note.title = '想反复重看的电影';
    note.description = '同一部电影，在不同年纪会看见不同的自己。';
    note.entries = [['海街日记','喜欢那些没有被大声说出的关心，和四季慢慢经过的日常。'],['步履不停','越长大，越能看见一家人说不出口的话。'],['帕特森','提醒自己，普通的一天也值得认真感受。']].map(([name,reason]) => ({id:uid(),name,reason}));
    localStorage.setItem('tistnote-introduction-seen-v1','1');
    localStorage.setItem('tistnote-development-preview-v1', JSON.stringify({vault:{path:'界面验收资料库',notes:[{note,revision:'ui-qa',group:'书影音/电影'}],trash:[],templates:[],warnings:[],groups:['书影音','书影音/电影']},history:{}}));
  });
  const results = [];
  const audit = async (surface, width, language, theme) => {
    const result = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('body *')].filter(el => el instanceof HTMLElement && el.checkVisibility() && ([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()) || el.matches('input,textarea,select')));
      const minFont = Math.min(...nodes.map(el=>parseFloat(getComputedStyle(el).fontSize)));
      const reason = document.querySelector('.reading-entries p');
      const readingFont = reason && parseFloat(getComputedStyle(reason).fontSize);
      const controls = [...document.querySelectorAll('.toolbar-actions button,.rail nav button,.settings-grid button')].filter(el=>el.checkVisibility());
      const smallTargets = innerWidth <= 640 ? controls.filter(el=>el.getBoundingClientRect().height<44).length : 0;
      const cells = [...document.querySelectorAll('.activity-cell')];
      const stretchedCells = cells.some(el => Math.abs(el.getBoundingClientRect().height - parseFloat(getComputedStyle(el).width)) > 1);
      const dialog = document.querySelector('dialog[open]');
      const dialogOverflow = dialog && dialog.scrollWidth > dialog.clientWidth;
      return {minFont,readingFont,smallTargets,stretchedCells,dialogOverflow,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    check(result.minFont>=13 && !result.overflow && !result.dialogOverflow && !result.smallTargets && !result.stretchedCells, 'Layout: '+JSON.stringify({surface,width,language,theme,...result}));
    if(surface==='reading') check(result.readingFont>=17, 'Reading text too small');
    await page.screenshot({path:base+`redesign-${surface}-${language}-${theme}-${width}.png`});
    results.push({surface,width,language,theme,...result});
  };
  for(const language of ['zh','en']) for(const theme of ['light','dark']) {
    await page.evaluate(({language,theme})=>localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language,theme})), {language,theme});
    await page.reload();
    const zh = language==='zh';
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:960});
      await page.locator('.rail nav button').first().click();
      await page.locator('.note-card').first().click();
      await page.locator('.note-reading').waitFor();
      await audit('reading',width,language,theme);
      await page.getByRole('button',{name:zh?'编辑':'Edit',exact:true}).click();
      await audit('editing',width,language,theme);
      await page.getByRole('button',{name:zh?'完成编辑':'Finish editing',exact:true}).click();
      await page.locator('dialog[open] .modal-actions button').last().click();
      await page.locator('.note-reading').waitFor();
      await page.locator('.rail-bottom').getByRole('button',{name:zh?'设置':'Settings',exact:true}).click();
      await audit('settings',width,language,theme);
      await page.getByRole('button',{name:zh?'关闭对话框':'Close dialog',exact:true}).click();
      await page.locator('.rail nav button').nth(1).click();
      await audit('templates',width,language,theme);
      await page.locator('.rail nav button').nth(2).click();
      await audit('activity',width,language,theme);
    }
  }
  await page.setViewportSize({width:1440,height:960});
  await page.evaluate(()=>localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'zh',theme:'light'})));
  await page.reload();
  await page.locator('.note-card').first().click();
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  await page.getByRole('textbox',{name:'条目 1 理由',exact:true}).fill('重新整理后的理由，仍保留在本地笔记中。');
  await page.getByRole('button',{name:'完成编辑',exact:true}).click();
  await page.getByRole('dialog',{name:'更新日志',exact:true}).waitFor();
  await page.getByRole('button',{name:'提交更新',exact:true}).click();
  await page.locator('.note-reading').getByText('重新整理后的理由，仍保留在本地笔记中。',{exact:true}).waitFor();
  await page.reload();
  await page.locator('.note-card').first().click();
  await page.locator('.note-reading').getByText('重新整理后的理由，仍保留在本地笔记中。',{exact:true}).waitFor();
  return {layouts:results,save:'edit, commit and reload preserve content'};
}
