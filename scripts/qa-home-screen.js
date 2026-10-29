async page => {
  const base = page.url(), browser = page.context().browser();
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const cases = [
    {id:'iphone',ios:true,width:390,height:844,language:'zh',theme:'light',ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'},
    {id:'ipad',ios:true,width:744,height:1133,language:'en',theme:'dark',platform:'MacIntel',touch:5,ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'},
    {id:'ipad-landscape',ios:true,width:1133,height:744,language:'zh',theme:'dark',platform:'MacIntel',touch:5,ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'},
    {id:'mac',ios:false,width:1440,height:960,language:'en',theme:'light',platform:'MacIntel',touch:0,ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'},
    {id:'windows',ios:false,width:1440,height:960,language:'zh',theme:'light',platform:'Win32',touch:0,ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36'},
    {id:'android',ios:false,width:390,height:844,language:'en',theme:'dark',platform:'Linux armv8l',touch:5,ua:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36'},
    {id:'standalone-legacy',ios:true,standalone:true,width:390,height:844,language:'zh',theme:'light',ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'},
    {id:'standalone-media',ios:true,media:true,width:744,height:1133,language:'en',theme:'dark',platform:'MacIntel',touch:5,ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'},
  ];
  const results=[];
  for (const device of cases) {
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},userAgent:device.ua,hasTouch:device.ios||device.touch>0});
    const tab=await context.newPage(),errors=[]; tab.on('pageerror',e=>errors.push(String(e)));
    try {
      await tab.addInitScript(device=>{
        if(!localStorage.getItem('tistnote-preferences-v1'))localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:device.language,theme:device.theme}));
        localStorage.setItem('tistnote-introduction-seen-v1','1');
        localStorage.setItem('tistnote-browser-tip-dismissed-v1','1');
        localStorage.setItem('tistnote-browser-local-tip-dismissed-v1','1');
        if(device.platform)Object.defineProperty(navigator,'platform',{configurable:true,value:device.platform});
        if(device.touch!==undefined)Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:device.touch});
        if(device.standalone)Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
        if(device.media){const original=window.matchMedia.bind(window);window.matchMedia=query=>{const media=original(query);if(query==='(display-mode: standalone)')Object.defineProperty(media,'matches',{value:true});return media}};
      },device);
      await tab.goto(base);
      await tab.getByRole('button',{name:device.language==='zh'?'设置':'Settings',exact:true}).waitFor();
      const offered=device.ios&&!device.standalone&&!device.media;
      const label=device.language==='zh'?'添加到主屏幕':'Add to Home Screen';
      check(await tab.locator('.home-screen-tip').count()===(offered?1:0),device.id+': wrong tip visibility');
      if(offered){
        await tab.locator('.home-screen-tip-action').click();
        const guide=tab.getByRole('dialog',{name:label,exact:true});await guide.waitFor();
        const copy=await guide.innerText();
        check(device.language==='zh'?copy.includes('不会自动迁移'):copy.includes('do not move automatically'),'Missing storage guidance');
        if(device.language==='en')check(!/[\u4e00-\u9fff]/.test(copy),'Untranslated guide');
        check(await guide.locator('ol li').count()===2,'Missing steps');
        const minFont=await guide.evaluate(el=>Math.min(...[...el.querySelectorAll('p,li,strong,button')].map(e=>parseFloat(getComputedStyle(e).fontSize))));
        check(minFont>=13,'Small guide text');
        await tab.screenshot({path:`output/playwright/home-screen-guide-${device.id}.png`});
        await guide.getByRole('button',{name:device.language==='zh'?'知道了':'Got it',exact:true}).click();
        await tab.locator('.home-screen-tip .icon-button').click();await tab.reload();
        await tab.getByRole('button',{name:device.language==='zh'?'设置':'Settings',exact:true}).waitFor();
        check(await tab.locator('.home-screen-tip').count()===0,'Dismissal not remembered');
      }
      await tab.getByRole('button',{name:device.language==='zh'?'设置':'Settings',exact:true}).click();
      const entry=tab.getByRole('button',{name:label,exact:true});
      check(await entry.count()===(offered?1:0),device.id+': wrong settings entry');
      if(device.id==='mac'||device.id==='windows')await tab.screenshot({path:`output/playwright/home-screen-hidden-${device.id}.png`});
      if(offered){await entry.scrollIntoViewIfNeeded();await tab.screenshot({path:`output/playwright/home-screen-settings-${device.id}.png`});await entry.click();await tab.getByRole('dialog',{name:label,exact:true}).waitFor()}
      check(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow');
      if(device.id==='iphone'){
        const assets=await tab.evaluate(async()=>{
          const link=document.querySelector('link[rel="manifest"]'),manifestURL=link.href;
          const manifest=await(await fetch(manifestURL)).json();
          const icons=[document.querySelector('link[rel="apple-touch-icon"]').href,...manifest.icons.map(i=>new URL(i.src,manifestURL).href)];
          const sizes=[];
          for(const url of icons){const image=new Image();image.src=url;await image.decode();sizes.push([url,image.naturalWidth,image.naturalHeight]);if(url.endsWith('.png')){const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d');c.drawImage(image,0,0);const pixel=[...c.getImageData(0,0,1,1).data];if(pixel.join(',')!=='52,79,66,255')throw Error('Transparent or incorrect icon background')}}
          return {display:manifest.display,start:new URL(manifest.start_url,manifestURL).pathname,scope:new URL(manifest.scope,manifestURL).pathname,sizes};
        });
        check(assets.display==='standalone','Wrong display mode');
        check(assets.start==='/tistnote/'&&assets.scope==='/tistnote/','Pages base escaped');
        check(assets.sizes.map(s=>s[1]).join(',')==='180,512,192,512','Wrong icon sizes');
        results.push({assets});
      }
      check(errors.length===0,errors.join('\n'));
      results.push({device:device.id,offered,errors:errors.length});
    } finally {await context.close()}
  }
  return results;
}
