async page => {
  const url=page.url();
  const check=(value,message)=>{if(!value)throw Error(message);};
  const results=[];
  for(const [width,height]of [[1440,1000],[390,844]]){
    const context=await page.context().browser().newContext({viewport:{width,height}});
    try{
      const tab=await context.newPage();
      const errors=[];
      tab.on('pageerror',error=>errors.push(String(error)));
      await tab.addInitScript(()=>localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'en',theme:'light'})));
      await tab.goto(url);
      const intro=tab.getByRole('dialog',{name:'About Tistnote',exact:true});
      await intro.waitFor();
      check(await tab.getByRole('button',{name:'Create or open a local library',exact:true}).count()===1,'Introduction requires a library');
      check(await tab.evaluate(()=>localStorage.getItem('tistnote-introduction-seen-v1'))===null,'First visit unexpectedly marked as seen');
      await intro.locator('.intro-slide[aria-hidden="false"] img').evaluate(img=>img.decode());
      const small=await intro.evaluate(dialog=>[...dialog.querySelectorAll('*')].filter(el=>el.getClientRects().length&&[...el.childNodes].some(node=>node.nodeType===3&&node.textContent.trim())&&parseFloat(getComputedStyle(el).fontSize)<18).length);
      check(!small,'Introduction text below 18px');
      await tab.screenshot({path:`output/playwright/web-introduction-${width}.png`});
      for(let i=1;i<=6;i++){
        const active=intro.locator('.intro-slide[aria-hidden="false"]');
        check(await active.getAttribute('data-intro-page')===String(i),'Incorrect page');
        if(await active.locator('img').count())await active.locator('img').evaluate(img=>img.decode());
        if(i<6)await intro.getByRole('button',{name:'Next',exact:true}).click();
      }
      await intro.getByRole('button',{name:'Start Tistnote',exact:true}).click();
      await intro.waitFor({state:'hidden'});
      check(await tab.evaluate(()=>localStorage.getItem('tistnote-introduction-seen-v1'))==='1','Completion not remembered');
      await tab.reload();
      await tab.getByRole('button',{name:'Create or open a local library',exact:true}).waitFor();
      check(await intro.count()===0,'Guide repeated after completion');
      await tab.getByRole('button',{name:'About Tistnote',exact:true}).click();
      await intro.waitFor();
      await intro.getByRole('button',{name:'Close dialog',exact:true}).click();
      await intro.waitFor({state:'hidden'});
      await tab.getByRole('button',{name:'Settings',exact:true}).click();
      const settings=tab.getByRole('dialog',{name:'Local library',exact:true});
      check(await settings.getByRole('button',{name:'Introduction',exact:true}).evaluate(button=>parseFloat(getComputedStyle(button).fontSize))>=22,'Settings guide text too small');
      await settings.screenshot({path:`output/playwright/settings-guide-${width}.png`});
      await settings.getByRole('button',{name:'Introduction',exact:true}).click();
      await settings.waitFor({state:'hidden'});
      await intro.waitFor();
      check(await intro.locator('.intro-slide[aria-hidden="false"]').getAttribute('data-intro-page')==='1','Settings guide did not start at first page');
      check(await tab.getByRole('dialog').count()===1,'Guide stacked over Settings');
      await intro.getByRole('button',{name:'Close dialog',exact:true}).click();
      await intro.waitFor({state:'hidden'});
      check(!errors.length,errors.join('\n'));
      results.push({width,firstVisit:true,sixPages:true,remembered:true,manualReopen:true,settingsEntry:true});
    }finally{await context.close();}
  }
  return results;
}
