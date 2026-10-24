async(page)=>{
 if(await page.getByRole('button',{name:'编辑',exact:true}).isVisible())await page.getByRole('button',{name:'编辑',exact:true}).click();
 const title=page.getByRole('textbox',{name:'笔记主题',exact:true});
 const original=await title.inputValue();
 await title.fill(original+' · 快捷键检查');
 await page.getByRole('button',{name:'更多笔记操作',exact:true}).click();
 await page.getByRole('button',{name:'保存为模板',exact:true}).click();
 const field=page.getByRole('dialog',{name:'编辑模板'}).getByRole('textbox',{name:'主题',exact:true});
 await field.press('Control+z');
 await page.getByRole('button',{name:'取消',exact:true}).click();
 if(await title.inputValue()!==original+' · 快捷键检查')throw Error('Dialog undo changed underlying note');
 await title.fill(original);
 await title.press('Control+s');
 await page.getByRole('status').filter({hasText:'已保存'}).waitFor();
 await page.clock.install();
 const description=page.getByRole('textbox',{name:'主题说明',exact:true});
 await description.fill('自动历史计时验证');
 await page.clock.fastForward(1000);
 const before=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).history).reduce((n,h)=>n+h.length,0));
 await page.clock.fastForward(60_000);
 await page.waitForFunction(before=>Object.values(JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).history).reduce((n,h)=>n+h.length,0)>before,before);
 await page.clock.fastForward(60_000);
 const after=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).history).reduce((n,h)=>n+h.length,0));
 if(after!==before+1)throw Error('Unchanged content created duplicate history');
 await page.reload();
 return {modalUndo:'isolated',idleHistory:'created after 60 seconds',duplicateAutoVersions:0};
}
