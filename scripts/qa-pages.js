async page => {
  const target=page.url();
  const testContext=await page.context().browser().newContext();
  page=await testContext.newPage();
  try {
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const failures=[];
  page.on('pageerror',error=>failures.push(String(error)));
  const fonts=()=>page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>({text:el.textContent.slice(0,60),size:parseFloat(getComputedStyle(el).fontSize)})).filter(row=>row.size<13));
  await page.addInitScript(()=>{
    localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'en',theme:'light'}));
    localStorage.setItem('tistnote-introduction-seen-v1','1');
    // Use real browser file handles in an isolated test folder, not a mock data store.
    window.showDirectoryPicker=async options=>{
      const root=await navigator.storage.getDirectory();
      if(options?.id==='tistnote-backup-destination')return root.getDirectoryHandle('qa-backups',{create:true});
      if(options?.id==='tistnote-restore-destination')return root.getDirectoryHandle('qa-restored',{create:true});
      if(options?.id==='tistnote-backup'){
        const parent=await root.getDirectoryHandle('qa-backups');
        for await(const [,handle]of parent.entries())if(handle.kind==='directory')return handle;
        throw Error('Backup missing');
      }
      return root.getDirectoryHandle('qa-library',{create:true});
    };
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(target);
  await page.getByRole('button',{name:'Create or open a local library',exact:true}).click();
  const browser=page.locator('.note-browser');
  const menu=page.getByRole('menu',{name:'Create note menu'});
  const rootMenu=async()=>{const b=await browser.boundingBox();await page.mouse.click(b.x+b.width-12,b.y+b.height-20,{button:'right'});};
  await rootMenu();await menu.getByRole('menuitem',{name:'New group',exact:true}).click();
  const groupDialog=page.getByRole('dialog',{name:'New group',exact:true});
  await groupDialog.getByRole('textbox',{name:'Group name',exact:true}).fill('Web group');
  await groupDialog.getByRole('button',{name:'New group',exact:true}).click();
  await groupDialog.waitFor({state:'hidden'});
  await page.getByRole('treeitem',{name:'Group Web group',exact:true}).click({button:'right'});
  await menu.getByRole('menuitem',{name:'New note',exact:true}).click();
  await page.getByRole('textbox',{name:'Note title',exact:true}).fill('Web folder test');
  await page.getByRole('textbox',{name:'Description',exact:true}).fill('Created in the GitHub Pages edition.');
  await page.getByRole('button',{name:'Add a choice',exact:true}).click();
  await page.getByRole('textbox',{name:'Entry 1 name',exact:true}).fill('A thoughtful choice');
  await page.getByRole('textbox',{name:'Entry 1 reason',exact:true}).fill('A reason worth keeping.');
  await page.getByRole('button',{name:'Finish editing',exact:true}).click();
  const update=page.getByRole('dialog',{name:'Update log',exact:true});
  await update.getByRole('textbox',{name:'Update log (optional)',exact:true}).fill('First web commit');
  await update.getByRole('button',{name:'Submit update',exact:true}).click();
  await update.waitFor({state:'hidden'});
  const files=await page.evaluate(async()=>{
    const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('qa-library');
    const dir=await(await root.getDirectoryHandle('notes')).getDirectoryHandle('Web group');
    for await(const [name,handle]of dir.entries())if(handle.kind==='file')return {name,text:await(await handle.getFile()).text()};
    throw Error('No Markdown file written');
  });
  check(files.text.includes('A thoughtful choice')&&files.text.includes('A reason worth keeping.'),'Real Markdown content missing');
  const noteId=JSON.parse(files.text.split('---')[1]).id;
  await page.getByRole('button',{name:'Confirm review',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Review confirmed'}).waitFor();
  for(const [label,mode]of [['Share picks','share'],['Ask for picks','invite']]){
    await page.getByRole('button',{name:'Exchange',exact:true}).click();
    await page.getByRole('button',{name:label,exact:true}).click();
    const share=page.getByRole('dialog',{name:label,exact:true});
    await page.waitForFunction(()=>[...document.querySelectorAll('dialog button')].some(button=>/^Save (?:all )?images?$/.test(button.textContent)&&!button.disabled));
    await share.locator('.share-image').evaluate(image=>image.decode());
    const download=page.waitForEvent('download');
    await share.getByRole('button',{name:/^Save (?:all )?images?$/}).click();
    await(await download).saveAs(`output/playwright/qr-live-${mode}.png`);
    await share.getByRole('button',{name:'Close dialog',exact:true}).click();
  }
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Local library · qa-library',exact:true});
  await settings.getByRole('button',{name:'Full backup',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(el=>el.textContent.includes('Backup saved:')));
  await settings.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.reload();
  await page.getByRole('heading',{name:'Web folder test',exact:true}).last().waitFor();
  const reopen=await page.evaluate(()=>!!document.querySelector('.note-reading'));
  check(reopen,'Remembered directory did not reopen');
  const second=await page.context().newPage();
  try{
    await second.goto(page.url());
    await second.getByRole('alert').filter({hasText:'Close the other Tistnote'}).waitFor();
  }finally{await second.close();}
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('button',{name:'More note actions',exact:true}).click();
  await page.locator('.editor').getByRole('button',{name:'Move to trash',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Trash',exact:true}).click();
  await page.getByRole('button',{name:'Restore',exact:true}).click();
  await page.getByRole('heading',{name:'Web folder test',exact:true}).last().waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Restore backup',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'Web folder test',exact:true}).last().waitFor();
  await page.screenshot({path:'output/playwright/pages-local-1440.png'});
  check(!(await fonts()).length,'Desktop text below 13px');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.rail nav button').first().click();
  await page.getByRole('button',{name:'Settings',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('.rail button:last-child')?.disabled);
  await page.screenshot({path:'output/playwright/pages-local-390.png'});
  const narrow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  check(narrow.scroll<=narrow.width,'Narrow Pages layout overflow');
  check(!(await fonts()).length,'Narrow text below 13px');
  check(!failures.length,failures.join('\n'));
  const disk=await page.evaluate(async id=>{
    const root=await navigator.storage.getDirectory(),backups=await root.getDirectoryHandle('qa-backups');
    let backupCount=0;
    for await(const[,h]of backups.entries())if(h.kind==='directory')backupCount++;
    const source=await root.getDirectoryHandle('qa-library');
    const history=await(await source.getDirectoryHandle('.tistnote')).getDirectoryHandle('history');
    const versions=await history.getDirectoryHandle(id);
    const kinds=[];
    for await(const[,h]of versions.entries())if(h.kind==='file')kinds.push(JSON.parse(await(await h.getFile()).text()).kind);
    return {backupCount,kinds};
  },noteId);
  check(disk.kinds.includes('edit')&&disk.kinds.includes('review'),'History or review not persisted');
  return {storage:'real browser file handles',markdown:files.name,reopen,singleWriter:true,backupRestore:disk.backupCount,trashRestore:true,history:disk.kinds,narrow};
  } catch(error) { console.log(await page.locator('body').innerText()); await page.screenshot({path:'output/playwright/pages-error.png'}); throw error; }
  finally { await testContext.close(); }
}
