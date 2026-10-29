async page => {
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  const intro=page.getByRole('dialog',{name:'关于品记',exact:true});
  check(await intro.count()===0,'Empty first launch interrupts before opening a note');
  await page.getByRole('button',{name:'关于品记',exact:true}).click();
  await intro.waitFor();
  const active=()=>intro.locator('.intro-slide[aria-hidden="false"]');
  const turn=()=>intro.getByRole('button',{name:'下一页',exact:true}).click();
  const captions=['记录品好，建设自我','突然被问，最喜欢的5位作家是谁？','最后时刻，最珍视的记忆怎么记不起来了？','“最爱音乐人”的品单发给她了，她会回复她的么？','回顾几年品记历史，发现自己越来越爱大山了。','品记，你的人生值得花时间好好建设'];
  await intro.getByRole('button',{name:'关闭对话框',exact:true}).click();
  check(await page.evaluate(()=>localStorage.getItem('tistnote-introduction-seen-v1'))==='1','Close did not persist seen state');
  await page.evaluate(()=>localStorage.removeItem('tistnote-introduction-seen-v1'));
  await page.reload();
  await page.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  await page.getByRole('button',{name:'写一份新笔记',exact:true}).click();
  await intro.waitFor();
  check(await active().getAttribute('data-intro-page')==='1','First note did not automatically introduce');
  const audit=()=>intro.evaluate(el=>{
    const visible=n=>n.getClientRects().length&&!n.closest('[aria-hidden="true"]');
    const nodes=[...el.querySelectorAll('*')].filter(n=>visible(n)&&([...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())||n.matches('input,textarea,select')));
    const dialog=el.getBoundingClientRect();
    const nav=el.querySelector('.intro-navigation').getBoundingClientRect();
    const slide=el.querySelector('.intro-slide[aria-hidden="false"]');
    const caption=slide.querySelector('.intro-caption').getBoundingClientRect();
    const art=slide.querySelector('.intro-art').getBoundingClientRect();
    return {width:innerWidth,height:innerHeight,minFont:Math.min(...nodes.map(n=>parseFloat(getComputedStyle(n).fontSize))),scrollWidth:document.documentElement.scrollWidth,dialogTop:dialog.top,dialogBottom:dialog.bottom,navBottom:nav.bottom,captionBottom:caption.bottom,navTop:nav.top,artHeight:art.height};
  });
  const layouts=[];
  for(const [width,height] of [[1440,1000],[390,844],[380,600]]){
    await page.setViewportSize({width,height});
    for(let i=0;i<6;i++){
      check(await active().locator('.intro-caption').innerText()===captions[i],'Caption mismatch '+i);
      const img=active().locator('img');
      if(await img.count()) await img.evaluate(el=>el.decode());
      await page.waitForFunction(()=>{
        const viewport=document.querySelector('.intro-viewport');
        const track=document.querySelector('.intro-track');
        const index=Number(document.querySelector('.intro-slide[aria-hidden="false"]').getAttribute('data-intro-page'))-1;
        return Math.abs(new DOMMatrixReadOnly(getComputedStyle(track).transform).m41+index*viewport.clientWidth)<1;
      });
      if(i===5) await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelectorAll('.intro-writing.active .intro-stroke')[4]).strokeDashoffset)===0);
      const layout=await audit();
      check(layout.minFont>=13&&layout.scrollWidth<=width,'Font/horizontal overflow '+JSON.stringify(layout));
      check(layout.dialogTop>=0&&layout.dialogBottom<=height+1&&layout.navBottom<=height&&layout.captionBottom<=layout.navTop&&layout.artHeight>=100,'Clipped introduction '+JSON.stringify(layout));
      await page.screenshot({path:`output/playwright/intro-${width}-page-${i+1}.png`});
      if(i<5)await turn();
      else layouts.push(layout);
    }
    check(await active().locator('svg .intro-stroke').count()===5,'Final SVG missing title/rows');
    check(await active().locator('.intro-stroke').first().evaluate(el=>getComputedStyle(el).animationName)==='intro-write','SVG writing animation missing');
    await intro.getByRole('button',{name:'开始品记',exact:true}).click();
    await page.getByRole('textbox',{name:'笔记主题',exact:true}).waitFor();
    await page.getByRole('button',{name:'关于品记',exact:true}).click();
    await intro.waitFor();
  }
  await page.setViewportSize({width:900,height:900});
  await page.keyboard.press('ArrowRight');
  check(await active().getAttribute('data-intro-page')==='2','Right arrow did not navigate');
  await page.keyboard.press('ArrowLeft');
  const viewport=await intro.locator('.intro-viewport').boundingBox();
  await page.mouse.move(viewport.x+viewport.width*.7,viewport.y+100);
  await page.mouse.down();
  await page.mouse.move(viewport.x+viewport.width*.3,viewport.y+102,{steps:8});
  await page.mouse.up();
  check(await active().getAttribute('data-intro-page')==='2','Swipe left did not navigate');
  await page.keyboard.press('Escape');
  await intro.waitFor({state:'hidden'});
  await page.reload();
  await page.getByRole('tree',{name:'笔记文件树',exact:true}).waitFor();
  check(await intro.count()===0,'Seen introduction reopened after restart');
  await page.getByRole('button',{name:'关于品记',exact:true}).click();
  await intro.waitFor();
  await page.keyboard.press('Escape');
  await page.evaluate(()=>localStorage.removeItem('tistnote-introduction-seen-v1'));
  await page.reload();
  await intro.waitFor();
  check(await active().getAttribute('data-intro-page')==='1','Existing vault first startup did not show introduction');
  await page.emulateMedia({reducedMotion:'reduce'});
  for(let i=0;i<5;i++)await turn();
  check(await active().locator('.intro-stroke').first().evaluate(el=>getComputedStyle(el).animationName)==='none','Reduced motion ignored');
  await intro.getByRole('button',{name:'开始品记',exact:true}).click();
  return {slides:captions.length,trigger:'brand, first new note, first existing vault',remembered:true,navigation:'buttons, keyboard and left swipe',animation:'SVG title then four rows; reduced motion supported',layouts};
}
