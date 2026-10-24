async(page)=>{
 const result=await page.evaluate(async()=>{
   const {renderShare}=await import('/src/share.ts');
   const {newNote,uid}=await import('/src/model.ts');
   const note=newNote();note.title='在不同季节里，我愿意反复看过的那些电影与它们留下来的生活片段'.repeat(3);
   note.entries=[{id:uid(),name:'长理由的电影',reason:'细雨、街道、窗边的光，以及那些欲言又止的时刻。'.repeat(65)},{id:uid(),name:'不应泄露的另一部电影',reason:'绝不公开的理由'}];
   const original=CanvasRenderingContext2D.prototype.fillText;const drawn=[];
   CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){drawn.push({text,x,y,width:this.measureText(text).width,canvasWidth:this.canvas.width,canvasHeight:this.canvas.height});return original.call(this,text,x,y,...rest);};
   let pages;
   try{pages=await renderShare(note,{selected:[note.entries[0].id],reasons:true,description:false,tags:false,date:false,invitation:false,message:''});}finally{CanvasRenderingContext2D.prototype.fillText=original;}
   if(pages.length<3)throw Error('Expected multiple pages');
   if(drawn.some(x=>x.text.includes('不应泄露')||x.text.includes('绝不公开')))throw Error('Share privacy failed');
   const clipped=drawn.filter(x=>x.x+x.width>x.canvasWidth-50||x.y+32>x.canvasHeight);
   if(clipped.length)throw Error(JSON.stringify(clipped));
   window.__qaPages=pages;
   return {pages:pages.length,continuations:drawn.filter(x=>x.text==='（上页条目续）').length,clipped:clipped.length};
 });
 for(const [index,label] of [[0,'first'],[result.pages-1,'last']]){
   const promise=page.waitForEvent('download');
   await page.evaluate(i=>{const a=document.createElement('a');a.href=window.__qaPages[i];a.download='long-page.png';a.click();},index);
   const download=await promise;await download.saveAs(`output/playwright/long-share-${label}.png`);
 }
 return result;
}
