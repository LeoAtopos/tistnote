async (page) => {
  const result=await page.evaluate(async()=>{
    const call=request=>window.__TAURI_INTERNALS__.invoke('vault_command',{request});
    const vault=await call({type:'list'});const original=vault.notes[0];
    if(!original)throw Error('Create a blank note first');
    const note=original.note;note.title='我最喜欢的电影';note.description='那些看过以后，还想再看一遍的电影。';note.tags=['电影','生活'];
    note.entries=[['花样年华','有些东西，越是克制，越是难忘。喜欢那些没有说出口的部分。'],['海街日记','温柔地看待日常，也认真对待每一次相遇。'],['布达佩斯大饭店','秩序、色彩和一点点荒诞，构成一个值得反复走进的世界。']].map(([name,reason])=>({id:crypto.randomUUID(),name,reason}));
    const saved=await call({type:'save',note,expected:original.revision});
    await call({type:'snapshot',id:note.id,kind:'milestone',label:'最初的选择'});
    const before=await call({type:'versions',id:note.id});
    const changed=structuredClone(saved.note);changed.entries[0].name='一一';
    const newer=await call({type:'save',note:changed,expected:saved.revision});
    const restored=await call({type:'restore',id:note.id,version:before[0].id,expected:newer.revision});
    if(restored.note.entries[0].name!=='花样年华')throw Error('Native restore failed');
    await call({type:'trash',id:note.id,restore:false,expected:restored.revision});
    const trash=await call({type:'list'});if(trash.trash.length!==1)throw Error('Native trash failed');
    await call({type:'trash',id:note.id,restore:true,expected:restored.revision});
    const versions=await call({type:'versions',id:note.id});
    return {nativeMarkdown:true,noteId:note.id,versionCount:versions.length,restoredTitle:restored.note.title};
  });
  await page.reload();
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  await page.getByRole('textbox',{name:'笔记主题',exact:true}).waitFor();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'output/playwright/native-editor.png'});
  return result;
}
