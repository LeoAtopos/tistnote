async page=>{
 const ctx=await page.context().browser().newContext();
 try{
  const tab=await ctx.newPage();
  await tab.addInitScript(()=>{localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'zh',theme:'light'}));localStorage.setItem('tistnote-introduction-seen-v1','1');});
  await tab.goto('http://127.0.0.1:1420/?preview=1');await tab.locator('.brand').click();
  const results=[];
  for(const dark of [false,true]) for(const size of [{width:390,height:844},{width:414,height:896},{width:768,height:1024},{width:1100,height:900}]){
   await tab.emulateMedia({colorScheme:dark?'dark':'light'});
   await tab.evaluate(dark=>document.documentElement.dataset.theme=dark?'dark':'light',dark);
   await tab.setViewportSize(size);
   for(let i=0;i<6;i++){
    await tab.locator('.intro-slide').nth(i).locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
    if(i>0)await tab.getByRole('button',{name:'下一页',exact:true}).click();
    await tab.locator('.intro-track').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
    const metrics=await tab.locator('.intro-slide').nth(i).evaluate(slide=>{
     const art=slide.querySelector('.intro-art').getBoundingClientRect(),text=slide.querySelector('h2').getBoundingClientRect(),view=slide.closest('.intro-viewport').getBoundingClientRect();
     const bounds=slide.getBoundingClientRect(),image=slide.querySelector('img,svg').getBoundingClientRect();
     return {left:art.left-bounds.left,right:bounds.right-art.right,imageLeft:image.left-bounds.left,imageRight:bounds.right-image.right,clip:getComputedStyle(slide).overflowX,gap:text.top-art.bottom,top:art.top-view.top,bottom:view.bottom-text.bottom,font:parseFloat(getComputedStyle(slide.querySelector('h2')).fontSize)};
    });
    if(Math.abs(metrics.left-metrics.right)>1||Math.abs(metrics.imageLeft-metrics.imageRight)>1||metrics.imageLeft<0||metrics.imageRight<0)throw Error('Artwork not centered '+JSON.stringify({size,i,metrics}));
    if(metrics.clip!=='hidden')throw Error('Slide must clip neighboring artwork');
    if(metrics.top < -1||metrics.bottom < -1||metrics.font<13)throw Error(JSON.stringify({size,i,metrics}));
    if(size.width<size.height&&(metrics.gap<0||metrics.gap>18))throw Error('Bad spacing '+JSON.stringify(metrics));
    results.push({size,page:i+1,...metrics});
    if(i===4)await tab.screenshot({path:`output/playwright/intro-spacing-${size.width}-${dark?"dark":"light"}.png`});
   }
   for(let i=0;i<5;i++)await tab.getByRole('button',{name:'上一页',exact:true}).click();
  }
  return results;
 }finally{await ctx.close();}
}
