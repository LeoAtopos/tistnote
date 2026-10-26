async page=>{
 const context=await page.context().browser().newContext({viewport:{width:1024,height:768},hasTouch:true,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'});
 const tab=await context.newPage();
 try{
  await tab.addInitScript(()=>{
   Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'});
   Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:5});
   Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:undefined});
   localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'zh',theme:'light'}));
   localStorage.setItem('tistnote-introduction-seen-v1','1');
  });
  await tab.goto('http://127.0.0.1:1420/');
  await tab.getByRole('button',{name:'创建或打开浏览器资料库',exact:true}).click();
  await tab.getByRole('button',{name:'写一份新笔记',exact:true}).waitFor();
  const result=await tab.evaluate(async()=>{
   const backendURL=performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/browser-vault.ts');
   const {newInternalLibrary}=await import(backendURL);
   const {IndexedFiles,openBrowserDatabase,activeBrowserLibrary,browserLibraries,createBrowserLibrary}=await import('/src/indexed-files.ts');
   const {WebStore}=await import('/src/web-store.ts');
   const {newNote,uid}=await import('/src/model.ts');
   const check=(value,message)=>{if(!value)throw Error(message)};
   const reject=async operation=>{try{await operation()}catch(error){return String(error)}throw Error('Expected rejection')};
   const db=await openBrowserDatabase(),library=await activeBrowserLibrary(db),files=new IndexedFiles(db,library.id),store=new WebStore(files,library.name);
   await store.initialize();await store.command('group_create',{name:'生活/偏好'});
   const note=newNote();note.title='判断与偏好';note.entries=[{id:uid(),name:'不喜欢的设计',reason:'自己的理由'}];
   const record=await store.command('save',{note,expected:null,group:'生活/偏好'}),path='notes/生活/偏好/'+note.id+'.md',original=await files.read(path);
   await reject(()=>store.command('save',{note:{...note,id:uid()},expected:null,group:''}));
   await reject(()=>store.command('save',{note,expected:'stale'}));
   check(await files.read(path)===original,'Rejected operation changed original');
   await store.command('group_rename',{name:'生活',new_name:'品察'});
   check(await files.read('notes/品察/偏好/'+note.id+'.md')===original,'Folder move changed Markdown bytes');
   await store.command('review_note',{id:note.id,expected:record.revision});
   check((await store.command('versions',{id:note.id})).some(v=>v.kind==='review'),'Review history missing');
   await store.command('canvas_put',{layout:{schema:1,positions:{['note:'+note.id]:{x:40,y:80}},groupOrder:['品察']},expected:null});
   const reopened=new WebStore(new IndexedFiles(db,library.id),library.name);await reopened.initialize();
   check((await reopened.command('canvas_get')).layout.positions['note:'+note.id].y===80,'Canvas did not reopen');
   await files.write('notes/raw-file','untouched');
   await reject(()=>files.mkdir('notes/raw-file/child'));await reject(()=>files.remove('notes/品察'));
   check(await files.read('notes/raw-file')==='untouched','Path conflict damaged file');
   const before=(await browserLibraries(db)).length;
   const restoreError=await reject(()=>newInternalLibrary('损坏的恢复',new Map([['.tistnote/manifest.json',new TextEncoder().encode('{"schema":1}')],['notes/bad.md',new TextEncoder().encode('broken')]])));
   check(restoreError.includes('bad.md'),'Restore failed before validating staged Markdown: '+restoreError);
   check((await browserLibraries(db)).length===before&&(await activeBrowserLibrary(db)).id===library.id,'Invalid staged restore changed libraries');
   const binary=await createBrowserLibrary(db,'严格编码',new Map([['notes/',null],['notes/binary.md',new Uint8Array([255,254,128])]]));
   const binaryFiles=new IndexedFiles(db,binary.id);await reject(()=>binaryFiles.read('notes/binary.md'));await binaryFiles.discard();
   db.close();
   return {desktopStyleIPad:true,realIndexedDB:true,globalTitleUniqueness:true,staleRevision:true,folderMove:true,reviewHistory:true,canvas:true,nonemptyGroupGuard:true,pathCollision:true,invalidRestoreAtomic:true,strictUTF8:true};
  });
  await tab.reload();await tab.getByRole('heading',{name:'判断与偏好',exact:true}).last().waitFor();
  await tab.screenshot({path:'output/playwright/ipad-browser-local.png'});
  return result;
 }finally{await context.close()}
}
