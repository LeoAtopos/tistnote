async page => {
  if (!new URL(page.url()).searchParams.has('preview')) throw Error('Use an isolated preview session');
  await page.evaluate(() => localStorage.removeItem('tistnote-development-preview-v1'));
  await page.reload();
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  await page.evaluate(async () => {
    const {command} = await import('/src/api.ts');
    const {newNote,uid} = await import('/src/model.ts');
    for (const name of ['电影/收藏','电影/待看','设计','待整理']) await command('group_create',{name});
    for (const [title, group, entry, tag] of [
      ['随手记录','','','生活'],
      ['喜欢的设计作品','设计','计算机 · 白芝麻','设计'],
      ['最喜欢的电影角色','电影','阿飞','电影'],
      ['想反复重看的电影','电影/收藏','花样年华','电影']
    ]) {
      const note = newNote(); note.title = title; note.tags = [tag];
      if (entry) note.entries = [{id:uid(),name:entry,reason:''}];
      await command('save',{note,expected:null,group});
    }
  });
  await page.reload();
  const tree = page.getByRole('tree',{name:'笔记文件树',exact:true});
  const folder = path => tree.getByRole('treeitem',{name:`分组 ${path}`,exact:true});
  const card = name => tree.locator('.note-card').filter({has:page.getByRole('heading',{name,exact:true})});
  await tree.waitFor();
  check(await page.locator('.note-list-heading button').count() === 3, 'Default toolbar should have three actions');
  check(await page.locator('.note-list-options,.note-search-panel').count() === 0, 'Panels should start closed');
  const headerHeight = await page.evaluate(() => document.querySelector('.file-tree').getBoundingClientRect().top - document.querySelector('.note-browser').getBoundingClientRect().top);
  check(headerHeight < 110, 'Default controls still take too much vertical space');
  await page.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await page.getByRole('combobox',{name:'笔记排序',exact:true}).selectOption('title');
  await page.keyboard.press('Escape');
  check(await page.getByRole('button',{name:'笔记列表选项',exact:true}).evaluate(el => document.activeElement === el), 'Escape did not return focus');
  await page.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await page.getByRole('button',{name:'管理分组',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
  check(await tree.locator(':scope > li > .tree-note').count() === 1, 'Ungrouped notes are not at root');
  check(await folder('电影/收藏').locator('..').locator('.tree-note').count() === 1, 'Nested note is not in its folder');
  check(await folder('待整理').count() === 1 && await folder('电影/待看').count() === 1, 'Empty folders disappeared');
  check(await page.getByRole('combobox',{name:'查看笔记分组',exact:true}).count() === 0, 'Old flat group picker is still present');

  await folder('电影').click();
  check(await card('想反复重看的电影').count() === 0, 'Collapse did not hide descendants');
  await folder('电影').press('ArrowRight');
  await folder('电影/收藏').waitFor();
  await folder('电影').press('ArrowRight');
  const childPath = await page.evaluate(() => document.activeElement?.getAttribute('data-folder'));
  check(['电影/收藏','电影/待看'].includes(childPath), 'Right arrow did not focus a direct child');
  await folder(childPath).press('ArrowLeft');
  check(await folder(childPath).getAttribute('aria-expanded') === 'false', 'Left arrow did not collapse child');
  await folder(childPath).press('ArrowLeft');
  check(await page.evaluate(() => document.activeElement?.getAttribute('data-folder')) === '电影', 'Left arrow did not focus parent');
  await folder('电影').press('Home');
  check(await page.evaluate(() => document.activeElement?.getAttribute('role')) === 'treeitem', 'Home lost tree focus');
  await page.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await page.getByRole('button',{name:'折叠全部分组',exact:true}).click();
  check(await tree.locator('.tree-note').count() === 1, 'Collapse all hid root notes or kept nested notes');
  await page.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await page.getByRole('button',{name:'展开全部分组',exact:true}).click();
  check(await tree.locator('.tree-note').count() === 4, 'Expand all lost notes');

  await page.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await page.getByRole('button',{name:'折叠全部分组',exact:true}).click();
  await page.getByRole('button',{name:'搜索与标签筛选',exact:true}).click();
  await page.getByRole('textbox',{name:'搜索',exact:true}).fill('花样年华');
  await card('想反复重看的电影').waitFor();
  await page.getByRole('button',{name:'搜索与标签筛选',exact:true}).click();
  check(await page.locator('.list-search-button.active').count() === 1, 'Collapsed search lost active indicator');
  await page.getByRole('button',{name:'搜索与标签筛选',exact:true}).click();
  check(await tree.locator('.tree-folder-button').count() === 2, 'Search failed to retain just matching ancestors');
  await page.getByRole('button',{name:'清除筛选',exact:true}).click();

  await page.locator('.tag-filter').getByRole('button',{name:'设计',exact:true}).click();
  check(await tree.locator('.tree-note').count() === 1 && await folder('设计').count() === 1, 'Tag filter lost folder hierarchy');
  await page.getByRole('button',{name:'清除筛选',exact:true}).click();
  await page.getByRole('button',{name:'搜索与标签筛选',exact:true}).click();

  await card('喜欢的设计作品').click();
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  await page.getByRole('combobox',{name:'笔记所在分组',exact:true}).selectOption('电影/收藏');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes.find(r => r.note.title === '喜欢的设计作品').group === '电影/收藏');
  check(await folder('电影/收藏').locator('..').locator('.tree-note').count() === 2, 'Move did not update the visible tree');
  await folder('电影/收藏').click();
  await page.getByRole('button',{name:'新建笔记',exact:true}).click();
  await page.getByRole('textbox',{name:'笔记主题',exact:true}).fill('分组内新笔记');
  await page.locator('.save-state').filter({hasText:/^已保存$/}).waitFor();
  await card('分组内新笔记').waitFor();
  check(await folder('电影/收藏').locator('..').locator('.tree-note').count() === 3, 'New note ignored selected folder');
  await page.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await page.getByRole('button',{name:'选择根目录',exact:true}).click();
  await page.getByRole('button',{name:'新建笔记',exact:true}).click();
  await page.getByRole('textbox',{name:'笔记主题',exact:true}).fill('根目录新笔记');
  await page.locator('.save-state').filter({hasText:/^已保存$/}).waitFor();
  check(await tree.locator(':scope > li > .tree-note').count() === 2, 'Root creation inherited an old group');
  await page.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await page.getByRole('button',{name:'切换为详细展示',exact:true}).click();
  check(await tree.locator('.note-card time').count() === 6, 'Detailed mode lost date metadata');
  await page.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await page.getByRole('button',{name:'切换为精简展示',exact:true}).click();
  check(await tree.locator('.note-card p,.note-card time').count() === 0, 'Compact mode shows extra text');
  await card('想反复重看的电影').click();
  await page.screenshot({path:'output/playwright/file-tree-desktop.png',fullPage:true});

  const audit = () => page.evaluate(() => {
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('dialog:not([open])');
    const nodes = [...document.querySelectorAll('body *')].filter(el => visible(el) && ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || el.matches('input,textarea,select')));
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,minimumFont:Math.min(...nodes.map(el=>parseFloat(getComputedStyle(el).fontSize))),small:nodes.filter(el=>parseFloat(getComputedStyle(el).fontSize)<18).map(el=>el.textContent.slice(0,30))};
  });
  await page.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await page.screenshot({path:'output/playwright/note-toolbar-options.png',fullPage:true});
  const desktop = await audit();
  await page.locator('.reading-title').click();
  check(await page.locator('.note-list-options').count() === 0, 'Outside click did not dismiss options');
  const panel = await page.locator('.note-browser').boundingBox();
  await page.screenshot({path:'output/playwright/note-toolbar.png',clip:{x:panel.x,y:panel.y,width:panel.width,height:700}});
  check(!desktop.small.length && desktop.scrollWidth <= desktop.width, 'Desktop layout check failed: '+JSON.stringify(desktop));
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/^笔记/}).first().click();
  await page.screenshot({path:'output/playwright/file-tree-narrow.png',fullPage:true});
  await page.getByRole('button',{name:'笔记列表选项',exact:true}).click();
  await page.screenshot({path:'output/playwright/note-toolbar-narrow-options.png',fullPage:true});
  const narrow = await audit();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'搜索与标签筛选',exact:true}).click();
  await page.screenshot({path:'output/playwright/note-toolbar-narrow-search.png',fullPage:true});
  const narrowSearch = await audit();
  check(!narrowSearch.small.length && narrowSearch.scrollWidth <= narrowSearch.width, 'Narrow search overflow');
  check(!narrow.small.length && narrow.scrollWidth <= narrow.width, 'Narrow layout check failed: '+JSON.stringify(narrow));
  return {headerHeight,structure:'root, groups, nested notes and empty folders',collapse:'individual and all',keyboard:'right, left, home',search:'matching ancestors expanded',tags:'hierarchy retained',move:'tree updated',creation:'selected folder or root',modes:'compact and detailed',desktop,narrow};
}

