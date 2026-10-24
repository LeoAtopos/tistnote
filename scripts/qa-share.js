async (page) => {
  await page.getByRole('checkbox',{name:'条目理由',exact:true}).uncheck();
  await page.getByRole('checkbox',{name:'1. 花样年华',exact:true}).uncheck();
  await page.getByRole('checkbox',{name:'2. 海街日记',exact:true}).uncheck();
  const save=page.getByRole('button',{name:'保存全部图片',exact:true});
  await save.waitFor();
  await page.screenshot({path:'output/playwright/share-desktop.png'});
  const [download]=await Promise.all([page.waitForEvent('download'),save.click()]);
  await download.saveAs('output/playwright/share-selected.png');
  await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
  if(!await page.getByRole('button',{name:'求分享',exact:true}).isVisible()) await page.getByRole('button',{name:'更多笔记操作',exact:true}).click();
  await page.getByRole('button',{name:'求分享',exact:true}).click();
  await page.getByRole('dialog',{name:'邀请对方分享'}).waitFor();
  const [invite]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'保存全部图片',exact:true}).click()]);
  await invite.saveAs('output/playwright/share-invitation.png');
  await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'output/playwright/editor-mobile.png',fullPage:true});
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,tooSmall:[...document.querySelectorAll('body *')].filter(e=>e instanceof HTMLElement&&e.checkVisibility()&&([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||['INPUT','TEXTAREA','SELECT'].includes(e.tagName))).filter(e=>parseFloat(getComputedStyle(e).fontSize)<18).map(e=>e.tagName)}));
  if(layout.scroll>layout.width||layout.tooSmall.length)throw Error(JSON.stringify(layout));
  await page.setViewportSize({width:1440,height:1000});
  return {share:'PNG exported',invitation:'PNG exported',mobile:layout};
}
