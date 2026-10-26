async page=>{
 const results=[];
 for(const platform of ['web','windows','android'])for(const width of [1440,390]){
  const context=await page.context().browser().newContext({viewport:{width,height:width===390?844:1000}});
  try{
   const tab=await context.newPage();
   await tab.addInitScript(platform=>{
    localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'zh',theme:'dark'}));localStorage.setItem('tistnote-introduction-seen-v1','1');
    if(platform==='windows'){
     window.isTauri=true;window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'}},transformCallback:()=>1,invoke:async command=>command==='plugin:event|listen'?1:null};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
    }
    if(platform==='android')window.TistnoteAndroid={call:(id)=>queueMicrotask(()=>window.dispatchEvent(new CustomEvent('tistnote-android-response',{detail:{id,ok:true,value:null}})))};
   },platform);
   await tab.goto(page.url());
   const welcome=tab.locator('.welcome-downloads');
   const welcomeWindows=welcome.getByRole('link',{name:'安装 Windows 版本',exact:true});
   const welcomeAndroid=welcome.getByRole('link',{name:'安装安卓版本',exact:true});
   if(await welcomeWindows.count()!==(platform==='windows'?0:1)||await welcomeAndroid.count()!==(platform==='android'?0:1))throw Error('Wrong welcome download links');
   for(const link of await welcome.getByRole('link').all()){
    const href=await link.getAttribute('href');
    if(!['https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-windows-x64-setup.exe','https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-android.apk'].includes(href))throw Error('Wrong welcome download URL');
   }
   const welcomeLayout=await welcome.evaluate(el=>({minFont:Math.min(...[...el.querySelectorAll('a')].map(n=>parseFloat(getComputedStyle(n).fontSize))),overflow:document.documentElement.scrollWidth>innerWidth}));
   if(welcomeLayout.minFont<18||welcomeLayout.overflow)throw Error(JSON.stringify(welcomeLayout));
   if(platform==='web')await tab.screenshot({path:`output/playwright/welcome-downloads-${width}.png`,fullPage:true});
   await tab.getByRole('button',{name:'设置',exact:true}).click();
   await tab.getByRole('button',{name:'安装本地版本',exact:true}).click();
   const modal=tab.getByRole('dialog',{name:'安装本地版本',exact:true});
   const windows=modal.getByRole('link',{name:/安装 Windows 版本/});const android=modal.getByRole('link',{name:/安装安卓版本/});
   if(await windows.count()!==(platform==='windows'?0:1)||await android.count()!==(platform==='android'?0:1))throw Error('Installed platform was not hidden');
   if(await windows.count()&&await windows.getAttribute('href')!=='https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-windows-x64-setup.exe')throw Error('Windows URL changed');
   if(await android.count()&&await android.getAttribute('href')!=='https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-android.apk')throw Error('Wrong APK URL');
   const layout=await modal.evaluate(el=>({minFont:Math.min(...[...el.querySelectorAll('a,strong,span,button,h2')].map(n=>parseFloat(getComputedStyle(n).fontSize))),overflow:el.scrollWidth>el.clientWidth}));
   if(layout.minFont<18||layout.overflow)throw Error(JSON.stringify(layout));
   if(platform==='web')await tab.screenshot({path:`output/playwright/install-menu-web-${width}.png`});
   results.push({platform,width,...layout,valid:true});
  }finally{await context.close();}
 }
 return results;
}
