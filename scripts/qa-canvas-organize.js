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
  const group=path=>canvas.locator(`[data-graph-branch="group:${path}"]`);
  const node=title=>canvas.locator(`[data-canvas-node="${ids[title]}"]`);
  const idle=()=>tab.waitForFunction(()=>document.querySelector('.note-list-heading button.primary')?.disabled===false);
  const layout=()=>tab.evaluate(async()=>JSON.parse(await(await(await(await navigator.storage.getDirectory()).getDirectoryHandle('qa-note-canvas')).getDirectoryHandle('.tistnote')).getFileHandle('canvas.json').then(h=>h.getFile()).then(f=>f.text())));
  const read=path=>tab.evaluate(async path=>{let dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('qa-note-canvas');const parts=path.split('/');for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part);try{return await(await(await dir.getFileHandle(parts.at(-1))).getFile()).text()}catch(error){if(error.name==='NotFoundError')return null;throw error}},path);
  async function drag(item,endpoint){
   await item.focus();await idle();const start=await item.boundingBox();
   await tab.mouse.move(start.x+start.width/2,start.y+start.height/2);await tab.mouse.down();
   await tab.mouse.move(endpoint.x,endpoint.y,{steps:12});
  }
  async function drop(){await tab.mouse.up();await idle();await tab.waitForFunction(()=>!document.querySelector('.graph-drag-status'));}
  await group('生活/远行').waitFor();
  check(await canvas.locator('.graph-node.selected').count()===0,'Persistent selected ring remains');
  await group('生活/远行').click({button:'right'});
  await tab.getByRole('menuitem',{name:'新建笔记',exact:true}).click();
  await tab.getByRole('textbox',{name:'笔记主题',exact:true}).fill('分组内的新笔记');
  await tab.getByRole('button',{name:'完成编辑',exact:true}).click();
  await tab.getByRole('dialog',{name:'更新日志',exact:true}).getByRole('button',{name:'提交更新',exact:true}).click();
  await tab.getByRole('button',{name:'‹ 返回画布',exact:true}).click();await canvas.waitFor();await idle();
  const files=await tab.evaluate(async()=>{const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('qa-note-canvas');const dir=await(await(await root.getDirectoryHandle('notes')).getDirectoryHandle('生活')).getDirectoryHandle('远行');const names=[];for await(const [name]of dir.entries())names.push(name);return names});
  check(files.length>=2,'Context creation did not use the selected group');
  await group('生活/远行').click({button:'right'});await tab.getByRole('menuitem',{name:'新建分组',exact:true}).click();
  const folderDialog=tab.getByRole('dialog',{name:'新建分组',exact:true});
  await folderDialog.getByRole('textbox',{name:'分组名称',exact:true}).fill('测试子组');
  await folderDialog.getByRole('button',{name:'新建分组',exact:true}).click();await folderDialog.waitFor({state:'hidden'});await group('生活/远行/测试子组').waitFor();
  const moving=node('等一个答案');await moving.focus();const initial=await moving.boundingBox();
  await drag(moving,{x:initial.x+initial.width/2+75,y:initial.y+initial.height/2+55});
  await canvas.getByText('调整画布位置',{exact:true}).waitFor();await drop();
  let saved=await layout();check(saved.positions['note:'+ids['等一个答案']],'Note position not persisted');
  const moved=await moving.boundingBox();check(Math.abs(moved.x-initial.x-75)<5,'Note drag panned the canvas or failed');
  const beforeCancel=JSON.stringify(await layout());
  const cdp=await context.newCDPSession(tab);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  const point={x:moved.x+moved.width/2,y:moved.y+moved.height/2,id:1};
  await touch('touchStart',[point]);await touch('touchMove',[{...point,x:point.x+40}]);
  await canvas.locator('.graph-drag-status').waitFor();await touch('touchCancel',[]);
  await tab.waitForFunction(()=>!document.querySelector('.graph-drag-status'));
  check(JSON.stringify(await layout())===beforeCancel,'Canceled drag persisted a position');
  await touch('touchStart',[point]);await touch('touchMove',[{...point,x:point.x+30}]);
  await touch('touchStart',[{...point,x:point.x+30},{...point,x:point.x+110,id:2}]);
  await touch('touchMove',[{...point,x:point.x+10},{...point,x:point.x+140,id:2}]);await touch('touchEnd',[]);
  check(JSON.stringify(await layout())===beforeCancel,'Pinch committed the first finger drag');
  check(await canvas.locator('.graph-drag-status').count()===0,'Pinch retained drag preview');
  await canvas.getByRole('button',{name:'居中',exact:true}).click();
  await moving.focus();await tab.keyboard.press('Alt+ArrowRight');await idle();
  check(Math.abs((await layout()).positions['note:'+ids['等一个答案']].x-saved.positions['note:'+ids['等一个答案']].x-20)<0.01,'Keyboard positioning failed');
  await canvas.focus();await tab.mouse.move(0,0);
  await tab.screenshot({path:'output/playwright/canvas-organize-desktop.png',animations:'disabled'});
  const branch=group('阅读');await branch.focus();const beforeGroup=await branch.boundingBox();
  await drag(branch,{x:beforeGroup.x+beforeGroup.width/2-65,y:beforeGroup.y+beforeGroup.height/2+80});await drop();
  saved=await layout();check(saved.positions['group:阅读'],'Group position not persisted');check(saved.positions['note:'+ids['想读的书']],'Group descendants did not follow');
  const target=await group('生活').boundingBox();
  await drag(branch,{x:target.x+target.width/2,y:target.y+2});
  await canvas.getByText('排在“生活”之前',{exact:true}).waitFor();
  await tab.screenshot({path:'output/playwright/canvas-reorder-preview.png',animations:'disabled'});await drop();
  saved=await layout();check(saved.groupOrder.indexOf('阅读')<saved.groupOrder.indexOf('生活'),'Group order did not persist');
  await tab.getByRole('button',{name:'列表视图',exact:true}).click();
  const ordered=await browser.locator('[data-folder]').evaluateAll(items=>items.map(el=>el.dataset.folder).filter(path=>path&&!path.includes('/')));
  check(ordered.indexOf('阅读')<ordered.indexOf('生活'),'List did not follow canvas group order');
  await tab.getByRole('button',{name:'笔记列表选项',exact:true}).click();await tab.getByRole('button',{name:'画布视图',exact:true}).click();await group('阅读').waitFor();
  const noteBytes=await read('notes/'+ids['等一个答案']+'.md');const into=await group('阅读').boundingBox();
  await drag(moving,{x:into.x+into.width/2,y:into.y+into.height/2});
  await canvas.getByText('移入“阅读”',{exact:true}).waitFor();await drop();
  check(await read('notes/'+ids['等一个答案']+'.md')===null,'Old note path remains');
  check(await read('notes/阅读/'+ids['等一个答案']+'.md')===noteBytes,'Note content changed during move');
  const parent=await group('生活').boundingBox();await drag(group('阅读'),{x:parent.x+parent.width/2,y:parent.y+parent.height/2});
  await canvas.getByText('移入“生活”',{exact:true}).waitFor();await drop();await group('生活/阅读').waitFor();
  check(await read('notes/生活/阅读/'+ids['等一个答案']+'.md')===noteBytes,'Group move lost or changed note content');
  check(await group('阅读').count()===0,'Old group path remains');
  saved=await layout();check(!Object.keys(saved.positions).some(key=>key==='group:阅读'),'Layout retained obsolete group keys');
  await tab.reload();await browser.getByRole('tree').waitFor();
  await tab.getByRole('button',{name:'笔记列表选项',exact:true}).click();await tab.getByRole('button',{name:'画布视图',exact:true}).click();await group('生活/阅读').waitFor();
  check((await layout()).groupOrder.includes('生活/阅读'),'Layout did not survive reopening');
  await tab.setViewportSize({width:390,height:844});await canvas.waitFor();await idle();
  await tab.screenshot({path:'output/playwright/canvas-organize-mobile.png',animations:'disabled'});
  const minFont=await tab.evaluate(()=>Math.min(...[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>parseFloat(getComputedStyle(el).fontSize))));
  check(minFont>=18,'Text below 18px');check(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
  check(errors.length===0,errors.join('\n'));
  return {contextNote:true,contextSubgroup:true,notePosition:true,groupPosition:true,subtreeDrag:true,siblingOrder:true,listOrder:true,noteMove:true,groupMove:true,markdownPreserved:true,reopen:true,cancel:true,pinchCancel:true,keyboardPosition:true,selectedRingRemoved:true,minFont};
 }catch(error){await tab.screenshot({path:'output/playwright/canvas-organize-failure.png'});throw Error(String(error)+'\n'+(await tab.locator('body').innerText()).slice(-2000))}
 finally{await context.close()}
}
