async page => {
  await page.reload();
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(async()=>{
    const {newNote,uid}=await import('/src/model.ts');
    const note=newNote(); note.title='用户原文';
    note.entries=[{id:uid(),name:'私人条目',reason:'私人理由不可出现在求品里'}];
    localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'en',theme:'dark'}));
    localStorage.setItem('tistnote-introduction-seen-v1','1');
    localStorage.setItem('tistnote-development-preview-v1',JSON.stringify({vault:{path:'QA library',notes:[{note,revision:'detail-qa',group:''}],trash:[],templates:[],warnings:[],groups:[]},history:{[note.id]:[{id:uid(),at:note.createdAt,kind:'initial',label:'',note},{id:uid(),at:note.updatedAt,kind:'review',label:'',note}]}}));
  });
  await page.reload();
  await page.getByRole('button',{name:'About Tistnote',exact:true}).click();
  const intro=page.getByRole('dialog');
  const introLayouts=[];
  for(const [width,height] of [[1440,1000],[390,844],[380,600]]){
    await page.setViewportSize({width,height});
    for(let i=0;i<6;i++){
      const active=intro.locator('.intro-slide[aria-hidden="false"]');
      if(await active.locator('img').count())await active.locator('img').evaluate(el=>el.decode());
      const layout=await active.evaluate(el=>{
        const caption=el.querySelector('.intro-caption').getBoundingClientRect();
        const nav=document.querySelector('.intro-navigation').getBoundingClientRect();
        return {captionTop:caption.top,captionBottom:caption.bottom,navTop:nav.top,navBottom:nav.bottom,font:parseFloat(getComputedStyle(el.querySelector('.intro-caption')).fontSize),artHeight:el.querySelector('.intro-art').getBoundingClientRect().height};
      });
      check(layout.font>=13&&layout.captionTop>=0&&layout.captionBottom<=layout.navTop&&layout.navBottom<=height&&layout.artHeight>=100,'English intro clipped '+JSON.stringify({width,height,i,layout}));
      introLayouts.push({width,height,page:i+1,...layout});
      if(i===0||i===5)await page.screenshot({path:`output/playwright/intro-en-dark-${width}-page-${i+1}.png`});
      if(i<5)await intro.getByRole('button',{name:'Next',exact:true}).click();
    }
    await intro.getByRole('button',{name:'Start Tistnote',exact:true}).click();
    await page.getByRole('button',{name:'About Tistnote',exact:true}).click();
  }
  await intro.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'More note actions',exact:true}).click();
  await page.locator('.editor').getByRole('button',{name:'History',exact:true}).click();
  const history=page.getByRole('dialog');
  check(await history.getByText('Confirm review',{exact:true}).count()>0,'Review history untranslated');
  await page.screenshot({path:'output/playwright/version-en-dark-1440.png'});
  await history.getByRole('button',{name:'Close dialog',exact:true}).click();
  const exports=[];
  for(const mode of ['Share picks','Ask for picks']){
    await page.getByRole('button',{name:'Exchange',exact:true}).click();
    await page.getByRole('button',{name:mode,exact:true}).click();
    const dialog=page.getByRole('dialog',{name:mode,exact:true});
    await dialog.getByRole('textbox',{name:'Signature (optional)'}).fill('Alex');
    await page.waitForFunction(()=>![...document.querySelectorAll('dialog button')].find(el=>el.textContent==='Save image').disabled);
    await dialog.locator('img').evaluate(el=>el.decode());
    const [download]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'Save image',exact:true}).click()]);
    await download.saveAs(`output/playwright/export-en-${mode==='Share picks'?'share':'invite'}.png`);
    await page.screenshot({path:`output/playwright/exchange-en-dark-${mode==='Share picks'?'share':'invite'}-1440.png`});
    await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
    exports.push(mode);
  }
  const canvas=await page.evaluate(async()=>{
    const {renderShare}=await import('/src/share.ts');
    const {note}=JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes[0];
    const original=CanvasRenderingContext2D.prototype.fillText;
    const all=[];
    try{
      for(const invitation of [false,true]){
        const drawn=[];
        CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){drawn.push({text,x,y,width:this.measureText(text).width,canvasWidth:this.canvas.width,height:this.canvas.height});return original.call(this,text,x,y,...rest);};
        await renderShare(note,{selected:note.entries.map(e=>e.id),reasons:true,description:false,tags:false,date:true,invitation,message:'What are your picks?',signature:'Alex',format:'long'});
        if(drawn.some(line=>line.x+line.width>line.canvasWidth-50||line.x<50||line.y+28>line.height))throw Error('English export clipped '+JSON.stringify(drawn));
        if(invitation&&drawn.some(line=>line.text.includes('私人')))throw Error('Invitation leaked private entries');
        const chrome=drawn.map(line=>line.text).filter(text=>!['用户原文','01. 私人条目','私人理由不可出现在求品里'].includes(text));
        if(chrome.some(text=>/[\u3400-\u9fff]/.test(text)))throw Error('Untranslated image label '+JSON.stringify(chrome));
        all.push({invitation,text:chrome});
      }
    }finally{CanvasRenderingContext2D.prototype.fillText=original;}
    return all;
  });
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Denied','QuotaExceededError');};});
  await page.getByRole('combobox',{name:'Appearance'}).selectOption('light');
  check(await page.getByRole('dialog').getByRole('alert').isVisible(),'Preference failure is hidden');
  check(await page.evaluate(()=>document.documentElement.dataset.theme)==='dark','Failed preference was applied');
  return {introLayouts,exports,canvas,storageFailure:'visible error, current appearance preserved'};
}
