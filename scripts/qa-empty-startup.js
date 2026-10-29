async page => {
  if(!new URL(page.url()).searchParams.has('preview'))throw Error('Use isolated preview');
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  await page.evaluate(()=>localStorage.removeItem('tistnote-development-preview-v1'));
  await page.reload();
  await page.setViewportSize({width:485,height:924});
  await page.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  const empty=page.getByRole('heading',{name:'从一次品察开始。',exact:true});
  const tree=page.getByRole('tree',{name:'笔记文件树',exact:true});
  const nav=page.getByRole('navigation',{name:'主导航',exact:true});
  for(const [width,height] of [[485,924],[390,844],[1080,1920]]){
    await page.setViewportSize({width,height});
    await page.reload();
    await empty.waitFor();
    check(!(await tree.isVisible()),'Empty vault shows empty file list instead of introduction');
    check(await page.getByRole('button',{name:'写一份新笔记',exact:true}).isVisible(),'Create note entry is missing');
    await page.screenshot({path:`output/playwright/empty-startup-${width}.png`,fullPage:true});
    const audit=await page.evaluate(()=>{
      const nodes=[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('input,textarea,select')));
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,minFont:Math.min(...nodes.map(el=>parseFloat(getComputedStyle(el).fontSize)))};
    });
    check(audit.minFont>=13&&audit.scrollWidth<=width,'Font/overflow regression');
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'去模板库找灵感',exact:true}).click();
  await page.getByRole('heading',{name:'世间万事，皆可一品',exact:true}).waitFor();
  await nav.getByRole('button',{name:/^笔记/}).click();
  await empty.waitFor();
  await page.getByRole('button',{name:'写一份新笔记',exact:true}).click();
  await page.getByRole('textbox',{name:'笔记主题',exact:true}).waitFor();
  for(const [width,height] of [[485,924],[390,844],[1080,1920]]) {
    await page.setViewportSize({width,height});
    await page.reload();
    await tree.waitFor();
    check(!(await empty.isVisible()),'Vault with a note still shows onboarding');
  }
  await tree.getByRole('treeitem').first().click();
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  await page.getByRole('button',{name:'更多笔记操作',exact:true}).click();
  await page.getByRole('button',{name:'移入回收站',exact:true}).click();
  await empty.waitFor();
  check(!(await tree.isVisible()),'Deleting last note did not return to empty introduction');
  return {empty:'introduction on new vault and reload; three portrait sizes',actions:'create and browse templates work',nonempty:'reload shows note list',lastDeletion:'returns to introduction',fonts:'>=13px; no page overflow'};
}
