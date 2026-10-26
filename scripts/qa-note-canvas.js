async page=>{
 const context=await page.context().browser().newContext({viewport:{width:1440,height:1000},hasTouch:true});
 const tab=await context.newPage();
 const errors=[];tab.on('pageerror',error=>errors.push(String(error)));
 const check=(ok,message)=>{if(!ok)throw Error(message)};
 try{
  await tab.clock.install({time:new Date()});
  await tab.addInitScript(()=>{
   localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'zh',theme:'dark'}));
   localStorage.setItem('tistnote-introduction-seen-v1','1');
   localStorage.setItem('tistnote-browser-tip-dismissed-v1','1');
   window.showDirectoryPicker=async()=>{
    const library=await(await navigator.storage.getDirectory()).getDirectoryHandle('qa-note-canvas',{create:true});
    const metadataDir=await library.getDirectoryHandle('.tistnote',{create:true});
    const manifest=await(await metadataDir.getFileHandle('manifest.json',{create:true})).createWritable();await manifest.write('{"schema":1}');await manifest.close();
    const now=Date.now();
    const samples=[['等一个答案','',false,false],['喜欢的大山','',true,true],['不喜欢的声音','',true,false],['想重访的地方','生活/远行',true,false],['想读的书','阅读',false,false],['山间的记忆','生活/远行/北方',true,true]];
    window.qaNotes={};
    for(const [title,group,filled,due]of samples){
     const id=crypto.randomUUID(),at=new Date(now-(due?65_000:0)).toISOString();window.qaNotes[title]=id;
     let directory=await library.getDirectoryHandle('notes',{create:true});
     for(const part of group.split('/').filter(Boolean))directory=await directory.getDirectoryHandle(part,{create:true});
     const metadata={schema:1,id,tags:title==='想重访的地方'?['旅行']:[],ranked:true,createdAt:at,updatedAt:at,reviewIntervalMonths:3,reviewTestMinute:title==='喜欢的大山'||title==='不喜欢的声音'||title==='山间的记忆',lastReviewedAt:null};
     const text=`---\n${JSON.stringify(metadata)}\n---\n\n# ${title}\n\n> \n\n<!-- tistnote:entries -->\n\n`+(filled?`1. 真实记录的选择\n  <!-- tistnote-entry:${crypto.randomUUID()} -->\n  > 为这一刻留下理由\n\n`:'');
     const writer=await(await directory.getFileHandle(id+'.md',{create:true})).createWritable();await writer.write(text);await writer.close();
    }
    await(await library.getDirectoryHandle('notes')).getDirectoryHandle('未整理',{create:true});
    return library;
   };
  });
  await tab.goto(page.url());
  await tab.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  const browser=tab.locator('.note-browser');
  await browser.getByRole('tree').waitFor();
  check(await tab.getByRole('region',{name:'我的笔记画布',exact:true}).count()===0,'Canvas replaced default list');
  await tab.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await tab.getByRole('button',{name:'画布视图',exact:true}).click();
  const canvas=tab.getByRole('region',{name:'我的笔记画布',exact:true});
  await canvas.waitFor();
  check(await canvas.locator('.graph-node').count()===6,'Missing notes');
  check(await canvas.locator('.graph-node.covered').count()===4,'Wrong filled circles');
  check(await canvas.locator('.graph-node .graph-review-dot').count()===2,'Wrong review markers');
  const ids=await tab.evaluate(()=>window.qaNotes);
  const due=canvas.locator(`[data-canvas-node="${ids['喜欢的大山']}"]`);
  const fresh=canvas.locator(`[data-canvas-node="${ids['不喜欢的声音']}"]`);
  check(await due.getAttribute('data-parent')==='root','Ungrouped note did not connect to root');
  check(await canvas.locator('[data-graph-branch="group:生活/远行/北方"]').getAttribute('data-parent')==='group:生活/远行','Nested hierarchy was flattened');
  check(await canvas.locator(`[data-canvas-node="${ids['山间的记忆']}"]`).getAttribute('data-parent')==='group:生活/远行/北方','Nested note has wrong parent');
  await tab.screenshot({path:'output/playwright/note-canvas-desktop-dark.png'});
  await due.focus();await due.hover();await due.locator('.graph-tooltip').waitFor();
  await due.click();
  await tab.getByRole('heading',{name:'喜欢的大山',exact:true}).waitFor();
  check(await tab.locator('.canvas-note-detail .note-browser').isVisible()===false,'Detail did not open');
  await tab.getByRole('button',{name:'回顾确认',exact:true}).click();
  await tab.getByRole('button',{name:'‹ 返回画布',exact:true}).click();
  await canvas.waitFor();
  await due.locator('.graph-review-dot').waitFor({state:'hidden'});
  check(await due.locator('.graph-review-dot').count()===0,'Review dot remained after confirmation');
  await tab.clock.runFor(61_000);
  await fresh.locator('.graph-review-dot').waitFor();
  await tab.getByRole('button',{name:'搜索与标签筛选',exact:true}).click();
  await tab.getByRole('textbox',{name:'搜索',exact:true}).fill('想重访');
  check(await canvas.locator('.graph-node').count()===1,'Canvas search failed');
  check(await canvas.locator('[data-graph-branch]').count()===2,'Search did not preserve matching ancestry');
  await tab.getByRole('textbox',{name:'搜索',exact:true}).fill('');
  await tab.getByRole('button',{name:'搜索与标签筛选',exact:true}).click();
  const oldZoom=await canvas.locator('output').innerText();
  await canvas.getByRole('button',{name:'放大画布',exact:true}).click();
  check(await canvas.locator('output').innerText()!==oldZoom,'Zoom failed');
  const b=await canvas.boundingBox(),root=canvas.locator('.graph-root');
  const before=await root.boundingBox();
  await tab.mouse.move(b.x+50,b.y+b.height-70);await tab.mouse.down();await tab.mouse.move(b.x+140,b.y+b.height-110,{steps:6});await tab.mouse.up();
  check(Math.abs((await root.boundingBox()).x-before.x)>70,'Pan failed');
  await tab.getByRole('button',{name:'列表视图',exact:true}).click();
  await browser.getByRole('tree').waitFor();
  await tab.getByRole('button',{name:'笔记列表选项',exact:true}).click();await tab.getByRole('button',{name:'画布视图',exact:true}).click();
  await tab.setViewportSize({width:390,height:844});
  await canvas.waitFor();
  await tab.screenshot({path:'output/playwright/note-canvas-mobile-dark.png'});
  const mobile=await canvas.boundingBox();check(mobile.height>=240,'Mobile canvas collapsed');
  await due.focus();await tab.keyboard.press('Enter');
  await tab.getByRole('heading',{name:'喜欢的大山',exact:true}).waitFor();
  await tab.getByRole('button',{name:'‹ 返回画布',exact:true}).click();await canvas.waitFor();
  await tab.evaluate(()=>{const key='tistnote-preferences-v1',value=JSON.stringify({language:'en',theme:'light'});localStorage.setItem(key,value);window.dispatchEvent(new StorageEvent('storage',{key,newValue:value}));});
  const english=tab.getByRole('region',{name:'My notes canvas',exact:true});await english.waitFor();
  await tab.waitForFunction(()=>document.querySelector('.note-list-heading button.primary')?.disabled===false);
  await tab.screenshot({path:'output/playwright/note-canvas-mobile-light-en.png',animations:'disabled'});
  const fonts=await tab.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>parseFloat(getComputedStyle(el).fontSize)));
  check(Math.min(...fonts)>=18,'Font below 18px');
  check(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
  check(errors.length===0,errors.join('\n'));
  return {defaultList:true,notes:6,nestedGroups:true,ungrouped:true,filled:4,reviewMarkers:2,reviewConfirmation:true,liveDueTimer:true,search:true,zoom:true,pan:true,listToggle:true,keyboard:true,mobileHeight:mobile.height,minFont:Math.min(...fonts)};
 }catch(error){
  await tab.screenshot({path:'output/playwright/note-canvas-failure.png'});
  throw Error(String(error)+'\n'+(await tab.locator('body').innerText()).slice(-1800));
 }finally{await context.close()}
}
