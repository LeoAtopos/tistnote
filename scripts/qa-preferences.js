async page => {
  await page.reload();
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const url = 'http://127.0.0.1:1420/?preview=1';
  const defaults = [];
  for (const [systemLocale, colorScheme] of [['zh-CN','light'], ['zh-TW','dark'], ['en-US','dark'], ['ja-JP','light']]) {
    const context = await page.context().browser().newContext({ locale: systemLocale, colorScheme });
    try {
      const p = await context.newPage();
      await p.goto(url);
      const zh = systemLocale.startsWith('zh');
      await p.getByRole('button', { name: zh ? '设置' : 'Settings', exact: true }).click();
      const settings = p.getByRole('dialog');
      const actual = await p.evaluate(() => ({ language: document.documentElement.lang, theme: document.documentElement.dataset.theme }));
      check(actual.language === (zh ? 'zh-CN' : 'en') && actual.theme === colorScheme, 'System default mismatch: '+JSON.stringify({ systemLocale, actual }));
      await settings.getByRole('combobox', { name: zh ? '界面语言' : 'Interface language' }).selectOption(zh ? 'en' : 'zh');
      await settings.getByRole('combobox', { name: zh ? 'Appearance' : '外观' }).selectOption(colorScheme === 'dark' ? 'light' : 'dark');
      await p.reload();
      const stored = await p.evaluate(() => ({ language: document.documentElement.lang, theme: document.documentElement.dataset.theme }));
      check(stored.language === (zh ? 'en' : 'zh-CN') && stored.theme !== colorScheme, 'Manual override did not survive reload');
      defaults.push({ systemLocale, actual, manual: stored });
    } finally { await context.close(); }
  }
  await page.setViewportSize({ width:1440, height:1000 });
  await page.evaluate(async () => {
    const { newNote, uid } = await import('/src/model.ts');
    const note = newNote();
    note.title = '我的原笔记';
    note.entries = [{ id:uid(), name:'中国文字保持不变', reason:'原本的理由' }];
    localStorage.setItem('tistnote-preferences-v1', JSON.stringify({ language:'zh',theme:'light' }));
    localStorage.setItem('tistnote-introduction-seen-v1','1');
    localStorage.setItem('tistnote-development-preview-v1',JSON.stringify({vault:{path:'浏览器预览 · 数据仅保存在此浏览器',notes:[{note,revision:'preferences-qa',group:''}],trash:[],templates:[],warnings:[],groups:[]},history:{}}));
  });
  await page.reload();
  const original = await page.evaluate(() => localStorage.getItem('tistnote-development-preview-v1'));
  const audit = async () => page.evaluate(() => {
    const textNodes = [...document.querySelectorAll('body *')].filter(el => el instanceof HTMLElement && el.checkVisibility() && ([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()) || el.matches('input,textarea,select')));
    return { minFont:Math.min(...textNodes.map(el=>parseFloat(getComputedStyle(el).fontSize))), overflow:document.documentElement.scrollWidth>innerWidth, background:getComputedStyle(document.documentElement).backgroundColor };
  });
  const layouts = [];
  for (const lang of ['zh','en']) for (const appearance of ['light','dark']) {
    await page.getByRole('button',{name:/^(设置|Settings)$/,exact:true}).click();
    const settings = page.getByRole('dialog');
    await settings.getByRole('combobox',{name:/^(界面语言|Interface language)$/}).selectOption(lang);
    await settings.getByRole('combobox',{name:/^(外观|Appearance)$/}).selectOption(appearance);
    check(await settings.locator('.vault-path').innerText() === (lang === 'en'
      ? 'Browser preview · Data stays in this browser' : '浏览器预览 · 数据仅保存在此浏览器'),
      'Preview notice reused a previously stored language');
    for (const [width,height] of [[1440,1000],[390,844]]) {
      await page.setViewportSize({width,height});
      const result = await audit();
      check(result.minFont>=13&&!result.overflow,'Invalid settings layout '+JSON.stringify({lang,appearance,width,result}));
      await page.screenshot({path:`output/playwright/preferences-${lang}-${appearance}-${width}.png`});
      layouts.push({lang,appearance,width,...result});
    }
    await settings.getByRole('button',{name:lang==='zh'?'关闭对话框':'Close dialog',exact:true}).click();
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:`output/playwright/notes-${lang}-${appearance}-1440.png`});
  }
  check(await page.evaluate(()=>localStorage.getItem('tistnote-development-preview-v1'))===original,'Preference switch modified notes or history');
  await page.locator('.rail nav button').nth(1).click();
  const templateText=await page.locator('.library').innerText();
  check(!/[\u3400-\u9fff]/.test(templateText),'Chinese text remains in English templates: '+templateText);
  await page.screenshot({path:'output/playwright/templates-en-dark-1440.png'});
  await page.locator('.rail nav button').nth(2).click();
  const activityText=await page.locator('.activity-page').innerText();
  check(!/[\u3400-\u9fff]/.test(activityText.replaceAll('我的原笔记','')),'Chinese text remains in English history: '+activityText);
  await page.screenshot({path:'output/playwright/history-en-dark-1440.png'});
  await page.getByRole('button',{name:'About Tistnote',exact:true}).click();
  const intro=page.getByRole('dialog');
  check((await intro.locator('[data-intro-page="1"] img').getAttribute('src')).includes('brand-en'),'English brand graphic missing');
  for(let index=0;index<6;index++) {
    const active=intro.locator('.intro-slide[aria-hidden="false"]');
    check(!/[\u3400-\u9fff]/.test(await active.innerText()),'Untranslated introduction');
    if(index<5)await intro.getByRole('button',{name:'Next',exact:true}).click();
  }
  await intro.getByRole('button',{name:'Start Tistnote',exact:true}).click();
  await page.locator('.rail nav button').first().click();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  check(await page.getByRole('textbox',{name:'Note title',exact:true}).inputValue()==='我的原笔记','Existing note title was translated');
  await page.getByRole('textbox',{name:'Description',exact:true}).fill('未完成的编辑也需要保留');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('combobox',{name:'Interface language'}).selectOption('zh');
  await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
  check(await page.getByRole('textbox',{name:'主题说明',exact:true}).inputValue()==='未完成的编辑也需要保留','Language switch discarded an edit');
  const systemContext=await page.context().browser().newContext({locale:'en-US',colorScheme:'light'});
  try {
    const p=await systemContext.newPage();
    await p.goto(url);
    await p.emulateMedia({colorScheme:'dark'});
    await p.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await p.getByRole('button',{name:'Settings',exact:true}).click();
    await p.getByRole('combobox',{name:'Appearance'}).selectOption('light');
    await p.emulateMedia({colorScheme:'dark'});
    check(await p.evaluate(()=>document.documentElement.dataset.theme)==='light','Explicit theme ignored');
  } finally { await systemContext.close(); }
  return { defaults, layouts, templates:'English, all 45 topics', introduction:'all six pages in English', data:'existing notes and edits preserved', systemTheme:'live system updates and explicit override' };
}
