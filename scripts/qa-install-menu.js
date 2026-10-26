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
    if(!['https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote.exe','https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-android.apk'].includes(href))throw Error('Wrong welcome download URL');
   }
   const welcomeLayout=await welcome.evaluate(el=>({minFont:Math.min(...[...el.querySelectorAll('a')].map(n=>parseFloat(getComputedStyle(n).fontSize))),overflow:document.documentElement.scrollWidth>innerWidth}));
   if(welcomeLayout.minFont<18||welcomeLayout.overflow)throw Error(JSON.stringify(welcomeLayout));
   if(platform==='web')await tab.screenshot({path:`output/playwright/welcome-downloads-${width}.png`,fullPage:true});
   if(platform==='web'){
    const banner=tab.locator('.preview-banner');
    if(await banner.count()!==1)throw Error('Browser tip missing');
    if(await banner.locator('span').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))<18)throw Error('Browser tip font too small');
    await banner.getByRole('button',{name:'关闭提示',exact:true}).focus();
    await tab.keyboard.press('Enter');
    if(await banner.count())throw Error('Browser tip did not close');
    await tab.reload();
    if(await banner.count())throw Error('Browser tip dismissal was not remembered');
   }
   await tab.getByRole('button',{name:'设置',exact:true}).click();
   await tab.getByRole('button',{name:'安装本地版本',exact:true}).click();
   const modal=tab.getByRole('dialog',{name:'安装本地版本',exact:true});
   const windows=modal.getByRole('link',{name:/安装 Windows 版本/});const android=modal.getByRole('link',{name:/安装安卓版本/});
   if(await windows.count()!==(platform==='windows'?0:1)||await android.count()!==(platform==='android'?0:1))throw Error('Installed platform was not hidden');
   if(await windows.count()&&await windows.getAttribute('href')!=='https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote.exe')throw Error('Windows URL changed');
   if(await windows.count()){
    await modal.getByText('Windows 10/11 · x64 · 直接运行',{exact:true}).waitFor();
    await modal.getByText('需要已安装 Microsoft WebView2',{exact:true}).waitFor();
   }
   if(await android.count()&&await android.getAttribute('href')!=='https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-android.apk')throw Error('Wrong APK URL');
   const layout=await modal.evaluate(el=>({minFont:Math.min(...[...el.querySelectorAll('a,strong,span,button,h2')].map(n=>parseFloat(getComputedStyle(n).fontSize))),overflow:el.scrollWidth>el.clientWidth}));
   if(layout.minFont<18||layout.overflow)throw Error(JSON.stringify(layout));
   if(platform==='web')await tab.screenshot({path:`output/playwright/install-menu-web-${width}.png`});
   if(platform==='web'){
    await tab.evaluate(()=>{const key='tistnote-preferences-v1',newValue=JSON.stringify({language:'en',theme:'light'});localStorage.setItem(key,newValue);window.dispatchEvent(new StorageEvent('storage',{key,newValue}));});
    const english=tab.getByRole('dialog',{name:'Install a local version',exact:true});
    await english.getByText('Windows 10/11 · x64 · Portable executable',{exact:true}).waitFor();
    await english.getByText('Requires Microsoft WebView2 to be installed',{exact:true}).waitFor();
    await tab.screenshot({path:`output/playwright/install-menu-web-en-${width}.png`});
   }
   results.push({platform,width,...layout,valid:true});
  }finally{await context.close();}
 }
 return results;
}

