async page => {
  if(!new URL(page.url()).searchParams.has('preview')) throw Error('Use isolated preview');
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  await page.evaluate(()=>localStorage.removeItem('tistnote-development-preview-v1'));
  await page.reload();
  await page.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  await page.evaluate(async()=>{
    const {command}=await import('/src/api.ts');
    const {newNote,uid}=await import('/src/model.ts');
    for(const title of ['想反复重看的电影','喜欢的设计作品']) {
      const note={...newNote(),title};
      if(title==='喜欢的设计作品')note.entries=[{id:uid(),name:'计算机',reason:''}];
      await command('save',{note,expected:null});
    }
  });
  const tree=page.getByRole('tree',{name:'笔记文件树',exact:true});
  const card=title=>tree.getByRole('treeitem').filter({has:page.getByRole('heading',{name:title,exact:true})});
  const audit=()=>page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('input,textarea,select')));
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,minFont:Math.min(...nodes.map(el=>parseFloat(getComputedStyle(el).fontSize)))};
  });
  const results=[];
  for(const [width,height] of [[485,924],[390,844],[1080,1920]]){
    await page.setViewportSize({width,height});
    await page.reload();
    await tree.waitFor();
    check(await page.getByRole('heading',{name:'我的笔记',exact:true}).isVisible(),'Existing vault opens outside note list');
    check(!(await page.getByRole('article',{name:'笔记内容',exact:true}).isVisible()),'Portrait startup shows content instead of list');
    check(await tree.locator('.tree-note').count()===2,'Startup lost notes');
    await page.screenshot({path:`output/playwright/startup-list-${width}.png`,fullPage:true});
    const result=await audit();
    check(result.minFont>=13&&result.scrollWidth<=width,'Font or overflow regression');
    results.push(result);
    await card('想反复重看的电影').click();
    await page.getByRole('article',{name:'笔记内容',exact:true}).waitFor();
    check(!(await tree.isVisible()),'Selecting note did not switch to reading');
    await page.getByRole('button',{name:'‹ 笔记',exact:true}).click();
    await tree.waitFor();
  }
  await page.getByRole('button',{name:'新建笔记',exact:true}).click();
  await page.getByRole('textbox',{name:'笔记主题',exact:true}).waitFor();
  await page.setViewportSize({width:1440,height:960});
  await page.reload();
  check(await tree.isVisible()&&await page.getByRole('article',{name:'笔记内容',exact:true}).isVisible(),'Desktop should retain side-by-side list and reader');
  return {portrait:'existing vault starts on list after every reload',selection:'opens reader; back returns list',newNote:'still starts editing',desktop:'list and reader visible',results};
}
