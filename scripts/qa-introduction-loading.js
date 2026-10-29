async page => {
 const context=await page.context().browser().newContext({viewport:{width:1100,height:900}});
 try {
  const tab=await context.newPage(), requests=[];
  tab.on('request',r=>{if(r.url().includes('/introduction/'))requests.push(r.url().split('/').pop());});
  await tab.addInitScript(()=>localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'en',theme:'light'})));
  await tab.goto('http://127.0.0.1:1420/?preview=1');
  await tab.locator('.brand').click(); const intro=tab.locator('.intro-modal');await intro.waitFor();
  const loaded=async()=>{await intro.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));};
  await loaded();
  if(requests.length!==5||!requests.includes('conversation.webp'))throw Error('Initial batch '+requests);
  const batches=[requests.slice()];
  for(let i=1;i<6;i++){
   await intro.getByRole('button',{name:'Next',exact:true}).click();await loaded();
   batches.push(requests.slice());
   if(i===1&&!requests.includes('hospital.webp'))throw Error('Next not preloaded');

   if(i===3)await intro.locator('.intro-track').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
   if(i===3)await tab.screenshot({path:'output/playwright/intro-webp-desktop.png'});
  }
  if(requests.some(r=>r.endsWith('.png')))throw Error('PNG requested');
  await tab.setViewportSize({width:390,height:844});
  await intro.getByRole('button',{name:'Previous',exact:true}).click();await loaded();
  await intro.locator('.intro-track').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
  await tab.screenshot({path:'output/playwright/intro-webp-mobile.png'});
  return {batches,decoded:true};
 }finally{await context.close();}
}
