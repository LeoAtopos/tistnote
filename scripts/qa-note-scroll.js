async page => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  await page.evaluate(async () => {
    const {command} = await import('/src/api.ts');
    const {newNote,uid} = await import('/src/model.ts');
    for(let i=0;i<35;i++) {
      const note = newNote(); note.title = i === 0 ? '滚动验证长笔记' : `笔记 ${i}`;
      note.entries = Array.from({length:i === 0 ? 40 : 1},(_,j)=>({id:uid(),name:`选择 ${j+1}`,reason:'记录这次品察的感受与理由。\n喜欢与讨厌，都值得认真记录。'}));
      await command('save',{note,expected:null,group:''});
    }
  });
  await page.reload();
  const card = page.locator('.note-card').filter({has:page.getByRole('heading',{name:'滚动验证长笔记',exact:true})});
  await card.click();
  const results = [];
  const inspect = () => page.evaluate(() => {
    const rect = selector => {
      const el = document.querySelector(selector);
      const r = el.getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,scroll:el.scrollTop};
    };
    const visibleText = [...document.querySelectorAll('body *')].filter(el => el.getClientRects().length && !el.closest('dialog:not([open])') &&
      ([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('input,textarea,select')));
    return {window:scrollY,width:innerWidth,height:innerHeight,documentHeight:document.documentElement.scrollHeight,
      documentWidth:document.documentElement.scrollWidth,rail:rect('.rail'),toolbar:rect('.editor-toolbar'),
      listTools:rect('.note-list-tools'),list:rect('.file-tree'),content:rect('.note-content'),
      minimumFont:Math.min(...visibleText.map(el=>parseFloat(getComputedStyle(el).fontSize)))};
  });
  for(const [width,height] of [[1440,900],[1220,720],[800,1100],[390,844]]) {
    await page.setViewportSize({width,height});
    for(const editing of [false,true]) {
      if(editing) await page.getByRole('button',{name:'编辑',exact:true}).click();
      await page.locator('.note-content').evaluate(el=>el.scrollTop=0);
      const before = await inspect();
      const body = await page.locator('.note-content').boundingBox();
      await page.mouse.move(body.x+body.width/2,body.y+body.height/2);
      await page.mouse.wheel(0,800);
      await page.waitForTimeout(200);
      const after = await inspect();
      check(after.content.scroll>0,'Note content did not scroll');
      check(after.window===0 && after.documentHeight<=height,'Document scrolls instead of the note');
      check(after.toolbar.top===before.toolbar.top && after.rail.top===before.rail.top && after.listTools.top===before.listTools.top,'Other panels moved');
      check(after.list.scroll===before.list.scroll,'Content scrolling moved the note list');
      check(after.toolbar.top>=0 && after.toolbar.bottom<=height,'Toolbar left the viewport');
      check(after.minimumFont>=13 && after.documentWidth<=width,'Font/width rule failed');
      await page.locator('.note-content').evaluate(el=>el.scrollTop=el.scrollHeight);
      await page.mouse.wheel(0,1000);
      await page.waitForTimeout(100);
      check((await inspect()).window===0,'Scroll chained out of note at bottom');
      if(editing) check(await page.getByRole('button',{name:'添加一个选择',exact:true}).isVisible(),'Cannot reach add entry');
      await page.screenshot({path:`output/playwright/note-scroll-${width}-${editing?'edit':'read'}.png`});
      results.push({width,height,editing,contentScroll:after.content.scroll,toolbarTop:after.toolbar.top,minimumFont:after.minimumFont});
      if(editing) {
        await page.getByRole('button',{name:'完成编辑',exact:true}).click();
        await page.getByRole('textbox',{name:'更新日志（可选）',exact:true}).fill('滚动布局验证');
        await page.getByRole('button',{name:'提交更新',exact:true}).click();
      }
    }
    if(width>980 && width>height) {
      const contentScroll = await page.locator('.note-content').evaluate(el=>el.scrollTop);
      await page.locator('.file-tree').hover();
      await page.mouse.wheel(0,700);
      await page.waitForTimeout(150);
      check(await page.locator('.file-tree').evaluate(el=>el.scrollTop)>0,'Long list does not scroll independently');
      check(await page.locator('.note-content').evaluate(el=>el.scrollTop)===contentScroll,'List scrolling moved note content');
    }
  }
  await page.getByRole('button',{name:'‹ 笔记',exact:true}).click();
  await page.locator('.file-tree').hover();
  await page.mouse.wheel(0,700);
  await page.waitForTimeout(150);
  check(await page.locator('.file-tree').evaluate(el=>el.scrollTop)>0,'Narrow list cannot scroll');
  check(await page.locator('.note-list-heading').isVisible(),'List heading hidden');
  await page.getByRole('button',{name:/^模板库/}).click();
  await page.locator('.template-card').last().scrollIntoViewIfNeeded();
  check(await page.locator('.template-card').last().isVisible(),'Template library scrolling broken');
  return results;
}
