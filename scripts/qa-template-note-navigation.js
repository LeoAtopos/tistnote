async page => {
  if (!new URL(page.url()).searchParams.has('preview')) throw Error('Use isolated preview');
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.evaluate(() => localStorage.removeItem('tistnote-development-preview-v1'));
  await page.reload();
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  const seeded = await page.evaluate(async () => {
    const {command} = await import('/src/api.ts');
    const {newNote,uid} = await import('/src/model.ts');
    const {builtinTemplates} = await import('/src/templates.ts');
    await command('group_create',{name:'电影'});
    await command('group_create',{name:'电影/重看'});
    const add = async (title, source, name, group='') => command('save',{
      note:{...newNote(),title,source,entries:[{id:uid(),name,reason:'用于确认跳转到正确笔记的理由。'}]},
      expected:null,group,
    });
    await add('我最喜欢的电影',builtinTemplates[0].id,'旧版本的答案');
    const latest = await add('重看之后的电影品单',builtinTemplates[0].id,'海街日记','电影/重看');
    await add('空的电影草稿',builtinTemplates[0].id,' ');
    await add(' 读不下去的书 ',undefined,'暂时没有读完的书');
    const trashed = await add('回收站中的更新电影笔记',builtinTemplates[0].id,'不应打开的内容');
    await command('trash',{id:trashed.note.id,restore:false,expected:trashed.revision});
    const personalId = uid();
    await command('template_put',{template:{id:personalId,title:'我的个人主题',description:'',hint:'',tags:['个人'],ranked:false,suggestedCount:3}});
    await add('改名后的个人品单',personalId,'属于个人模板的答案');
    const state = JSON.parse(localStorage.getItem('tistnote-development-preview-v1'));
    state.vault.notes.forEach((record,index)=>{
      const at = new Date(Date.UTC(2026,9,20+index)).toISOString();
      record.note.createdAt = record.note.updatedAt = at;
      state.history[record.note.id].forEach(version=>{
        version.at=at;
        version.note.createdAt=version.note.updatedAt=at;
      });
    });
    localStorage.setItem('tistnote-development-preview-v1',JSON.stringify(state));
    return {latestId:latest.note.id,activeNotes:5};
  });
  await page.reload();
  const nav = page.getByRole('navigation',{name:'主导航',exact:true});
  const templates = () => nav.getByRole('button',{name:'模板库',exact:true}).click();
  const card = title => page.locator('.template-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
  const reader = page.getByRole('article',{name:'笔记内容',exact:true});
  const opened = async (title, entry) => {
    await reader.getByRole('heading',{name:title,exact:true}).waitFor();
    check((await reader.innerText()).includes(entry),'Wrong note content');
    check((await nav.locator('.nav-item.active').innerText()).includes('笔记'),'Main navigation did not switch to notes');
    check(await page.locator('.editor input,.editor textarea').count()===0,'Opening a template started editing');
    const count = await page.evaluate(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes.length);
    check(count===seeded.activeNotes,'Viewing a covered template created another note');
  };
  await templates();
  await page.getByRole('button',{name:'展开或收起搜索',exact:true}).click();
  await page.getByRole('textbox',{name:'搜索',exact:true}).fill('我最喜欢的电影');
  await card('我最喜欢的电影').getByRole('button',{name:'查看笔记',exact:true}).click();
  await opened('重看之后的电影品单','海街日记');
  const selected = page.getByRole('treeitem',{selected:true}).filter({has:page.getByRole('heading',{name:'重看之后的电影品单',exact:true})});
  await selected.waitFor();
  check(await selected.isVisible(),'Template search or closed groups hid the opened note');
  await templates();
  await card('我最喜欢的电影').getByRole('button',{name:'查看“我最喜欢的电影”的笔记',exact:true}).click();
  await opened('重看之后的电影品单','海街日记');
  await templates();
  await card('我最喜欢的电影').getByRole('button',{name:'我最喜欢的电影',exact:true}).press('Enter');
  await opened('重看之后的电影品单','海街日记');
  await templates();
  await card('读不下去的书').getByRole('button',{name:'查看笔记',exact:true}).click();
  await opened('读不下去的书','暂时没有读完的书');
  await templates();
  await card('我的个人主题').getByRole('button',{name:'查看笔记',exact:true}).click();
  await opened('改名后的个人品单','属于个人模板的答案');
  const audits=[];
  for (const [width,height] of [[1440,960],[390,844]]) {
    await page.setViewportSize({width,height});
    await templates();
    await page.getByRole('button',{name:'展开或收起搜索',exact:true}).click();
    await page.getByRole('textbox',{name:'搜索',exact:true}).fill('我最喜欢的电影');
    await page.getByRole('button',{name:'随机一品 ↗',exact:true}).click();
    const random = page.locator('.random-card');
    check(await random.getByRole('button',{name:'查看笔记',exact:true}).isVisible(),'Covered random topic kept the create action');
    const audit=await page.evaluate(()=>{
      const visible=[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('input,textarea,select')));
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,minFont:Math.min(...visible.map(el=>parseFloat(getComputedStyle(el).fontSize)))};
    });
    check(audit.minFont>=18&&audit.scrollWidth<=width,'Font or overflow regression: '+JSON.stringify(audit));
    audits.push(audit);
    await page.screenshot({path:`output/playwright/template-note-library-${width}.png`,fullPage:true});
    await random.getByRole('button',{name:'查看笔记',exact:true}).click();
    await opened('重看之后的电影品单','海街日记');
    await page.screenshot({path:`output/playwright/template-note-opened-${width}.png`,fullPage:true});
  }
  await templates();
  await card('想反复重看的电影').getByRole('button',{name:'开始填写',exact:true}).click();
  await page.getByRole('textbox',{name:'笔记主题',exact:true}).waitFor();
  check(await page.getByRole('textbox',{name:'笔记主题',exact:true}).inputValue()==='想反复重看的电影','Uncovered template no longer creates a note');
  return {covered:'primary action, title keyboard activation and badge open existing note',selection:'latest valid active note, excluding blank drafts and trash',legacy:'trimmed title fallback',personal:'source association after rename',navigation:'notes selected, browse mode, template filters cleared, folder expanded',random:'same behavior on desktop and narrow width',uncovered:'starts a new note',audits};
}
