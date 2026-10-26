async page => {
  const result=await page.evaluate(async()=>{
    const {renderShare}=await import('/src/share.ts');
    const {newNote,uid}=await import('/src/model.ts');
    const note=newNote();note.title='我珍视的作品';
    note.entries=Array.from({length:18},(_,i)=>({id:uid(),name:`私人选择${i+1}`,reason:'私人理由，不能出现在求品图片。'.repeat(5)}));
    const original=CanvasRenderingContext2D.prototype.fillText;
    const drawn=[];
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){drawn.push(text);return original.call(this,text,...args);};
    window.__qrExports=[];
    const cases=[];
    try{
      for(const invitation of [false,true])for(const format of ['long','pages']){
        drawn.length=0;
        const images=await renderShare(note,{selected:note.entries.map(entry=>entry.id),reasons:true,description:false,tags:false,date:false,invitation,message:'想听听你的选择。'.repeat(100),signature:'品友',format});
        if(invitation&&drawn.some(text=>text.includes('私人选择')||text.includes('私人理由')))throw Error('Invitation leaked answers');
        if(drawn.some(text=>text.includes('预留')||text.includes('Placeholder')))throw Error('QR placeholder remains');
        if(format==='pages'&&images.length<2)throw Error('Pagination not exercised');
        const hint=invitation?'扫描二维码，打开品记回复':'来自品记，自我建设';
        if(drawn.filter(text=>text===hint).length!==images.length)throw Error('Footer hint missing');
        images.forEach((image,i)=>window.__qrExports.push({name:`qr-${invitation?'invite':'share'}-${format}-${i+1}.png`,image}));
        cases.push({invitation,format,pages:images.length});
      }
    }finally{CanvasRenderingContext2D.prototype.fillText=original;}
    return {cases,count:window.__qrExports.length};
  });
  for(let i=0;i<result.count;i++){
    const download=page.waitForEvent('download');
    const name=await page.evaluate(index=>{
      const item=window.__qrExports[index],anchor=document.createElement('a');
      anchor.href=item.image;anchor.download=item.name;anchor.click();return item.name;
    },i);
    await(await download).saveAs(`output/playwright/${name}`);
  }
  return result;
}
