async page => {
 const ctx=await page.context().browser().newContext();
 try{
  const tab=await ctx.newPage();let release;const gate=new Promise(r=>release=r);
  await tab.addInitScript(()=>localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'en',theme:'light'})));
  await tab.route('**/introduction/*.webp',async route=>{await gate;await route.continue();});
  await tab.setViewportSize({width:1100,height:900});
  await tab.goto('http://127.0.0.1:1420/?preview=1',{waitUntil:'domcontentloaded'});
  await tab.getByText('Loading introduction images…',{exact:true}).waitFor();
  if(await tab.locator('.app').count())throw Error('Entered before images loaded');
  await tab.screenshot({path:'output/playwright/startup-desktop.png'});
  await tab.setViewportSize({width:390,height:844});
  await tab.screenshot({path:'output/playwright/startup-mobile.png'});
  release();await tab.locator('.app').waitFor();
  await tab.unrouteAll({behavior:'wait'});
  let fail=true;
  await tab.route('**/introduction/hospital.webp',route=>fail?route.abort():route.continue());
  await tab.reload({waitUntil:'domcontentloaded'});
  await tab.getByRole('button',{name:'Retry',exact:true}).waitFor();
  if(await tab.locator('.app').count())throw Error('Failure entered app');
  fail=false;await tab.getByRole('button',{name:'Retry',exact:true}).click();await tab.locator('.app').waitFor();
  fail=true;await tab.reload({waitUntil:'domcontentloaded'});
  await tab.getByRole('button',{name:'Skip loading and enter Tistnote',exact:true}).click();await tab.locator('.app').waitFor();
  return {loadingGate:true,retry:true,skip:true};
 }finally{await ctx.close();}
}
