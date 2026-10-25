async page => {
  const check=(value,message)=>{if(!value)throw Error(message)};
  const failures=[],network=[];
  page.on('pageerror',error=>failures.push(error.message));
  await page.context().setOffline(false);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:5180/%E5%93%81%E8%AE%B0-%E9%A1%B9%E7%9B%AE%E6%8F%90%E6%A1%88.html');
  await page.getByRole('heading',{level:1}).waitFor();
  await page.context().setOffline(true);
  page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url())});
  check(await page.locator('.paper-note,.revision-grid,.share-paper,[data-note]').count()===0,'A DOM product mock remains');
  check(await page.locator('.product-shot').count()===4,'Missing screenshot figure');
  await page.locator('[data-share="answer"]').click();
  check(await page.locator('#answer-content').isVisible(),'Answer screenshot did not switch');
  await page.locator('#answer-content img').evaluate(image=>image.decode());
  await page.locator('[data-share="invite"]').click();
  check(await page.locator('#answer-content').isHidden(),'Invitation exposes own answer screenshot');
  await page.evaluate(()=>{window.__printCalls=0;window.print=()=>window.__printCalls++});
  await page.locator('#print-button').click();
  check(await page.evaluate(()=>window.__printCalls===1),'Print action failed');
  const audits=[];
  for(const [name,width,height] of [['desktop',1440,1000],['narrow',390,844],['medium',820,1000]]){
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>{
      const alternate=matchMedia('(max-width: 680px)').matches;
      return [...document.querySelectorAll('.product-shot img')].filter(image=>image.getClientRects().length).every(image=>(image.currentSrc!==image.src)===alternate);
    });
    await page.evaluate(async()=>{
      await document.fonts.ready;
      await Promise.all([...document.images].filter(image=>image.getAttribute('src')).map(image=>image.decode()));
      document.activeElement.blur();
      window.scrollTo({top:0,behavior:'instant'});
    });
    const audit=await page.evaluate(()=>{
      const visible=[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&!el.closest('dialog:not([open])'));
      const text=visible.filter(el=>[...el.childNodes].some(node=>node.nodeType===3&&node.textContent.trim()));
      const shots=[...document.querySelectorAll('.product-shot img')].filter(el=>el.getClientRects().length).map(image=>{
        const base=image.currentSrc!==image.src?+image.dataset.alternateFont:+image.dataset.fontFloor;
        return {width:image.getBoundingClientRect().width,naturalWidth:image.naturalWidth,minRenderedFont:base*image.getBoundingClientRect().width/image.naturalWidth};
      });
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,minFont:Math.min(...text.map(el=>parseFloat(getComputedStyle(el).fontSize))),shots,images:[...document.images].filter(image=>image.getAttribute('src')).every(image=>image.naturalWidth>0),inlineOnly:[...document.images].filter(image=>image.getAttribute('src')).every(image=>image.src.startsWith('data:'))&&document.querySelectorAll('script[src],link[rel="stylesheet"]').length===0};
    });
    check(audit.documentWidth<=width,'Page overflow at '+width);
    check(audit.minFont>=18,'Small text at '+width);
    check(audit.shots.every(shot=>shot.minRenderedFont>=18),'Screenshot text shrank below 18px at '+width);
    check(audit.images&&audit.inlineOnly,'External or unloaded image at '+width);
    audits.push(audit);
    await page.screenshot({path:'output/playwright/pitch-v3/'+name+'.png',fullPage:true});
    await page.screenshot({path:'output/playwright/pitch-v3/'+name+'-hero.png'});
    if(name!=='medium'){
      for(const [part,selector] of [['time','#time'],['social','#together'],['sharing','#sharing']]){
        await page.locator(selector).screenshot({path:'output/playwright/pitch-v3/'+name+'-'+part+'.png'});
      }
    }
    const viewer=page.getByRole('dialog',{name:'笔记阅读界面',exact:true});
    await page.locator('.hero-example [data-open-shot]').click();
    await viewer.waitFor();
    await page.locator('#screenshot-image').evaluate(image=>image.decode());
    const full=await page.locator('#screenshot-image').evaluate(image=>({width:image.getBoundingClientRect().width,natural:image.naturalWidth}));
    check(full.width===full.natural,'Viewer does not preserve image pixels');
    await page.keyboard.press('Escape');
    check(await viewer.isHidden(),'Escape does not close image viewer');
    if(name==='narrow'){
      const frame=page.locator('#invitation-content .shot-scroll');
      await frame.evaluate(el=>el.scrollLeft=el.scrollWidth);
      check(await frame.evaluate(el=>el.scrollLeft>0),'Narrow screenshot cannot be panned');
      await frame.evaluate(el=>el.scrollLeft=0);
      await page.locator('[data-share="answer"]').click();
      await page.locator('#answer-content [data-open-shot]').click();
      await page.getByRole('dialog',{name:'分享我的选择',exact:true}).waitFor();
      await page.locator('#close-screenshot').click();
      await page.locator('[data-share="invite"]').click();
    }
  }
  await page.locator('.source-details summary').click();
  check(await page.locator('.source-details>div').isVisible(),'Source panel failed');
  check(await page.evaluate(()=>[...document.querySelectorAll('.source-details a')].every(a=>a.href.startsWith('data:text/markdown')&&a.download)),'Sources not embedded');
  await page.locator('.source-details summary').click();
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({media:'print'});
  await page.waitForFunction(()=>[...document.querySelectorAll('.product-shot img')].filter(image=>image.getClientRects().length).every(image=>image.currentSrc!==image.src));
  await page.evaluate(async()=>await Promise.all([...document.querySelectorAll('.product-shot img')].map(image=>image.decode())));
  const print=await page.evaluate(()=>[...document.querySelectorAll('.product-shot img')].filter(image=>image.getClientRects().length).map(image=>{
    const base=image.currentSrc!==image.src?+image.dataset.alternateFont:+image.dataset.fontFloor;
    return {width:image.getBoundingClientRect().width,naturalWidth:image.naturalWidth,minRenderedFont:base*image.getBoundingClientRect().width/image.naturalWidth};
  }));
  check(print.every(shot=>shot.minRenderedFont>=18),'Print screenshot font too small');
  await page.emulateMedia({media:'screen'});
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  check(network.length===0,'Unexpected HTTP requests after going offline');
  check(failures.length===0,'Page errors: '+failures);
  return {audits,print,offline:true,externalRequests:network.length,pageErrors:failures,screenshotFigures:4,shareModes:2,viewer:'opens, native size, Escape and Close',mocksRemoved:true};
}

