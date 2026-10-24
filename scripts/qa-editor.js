async (page) => {
  if (await page.getByRole('button', {name:'编辑',exact:true}).isVisible()) await page.getByRole('button', {name:'编辑',exact:true}).click();
  await page.getByRole('textbox', {name:'条目 2 名称',exact:true}).fill('海街日记');
  await page.getByRole('textbox', {name:'条目 2 理由',exact:true}).fill('温柔地看待日常，也认真对待每一次相遇。');
  await page.getByRole('button', {name:'添加一个选择',exact:true}).click();
  await page.getByRole('textbox', {name:'条目 3 名称',exact:true}).fill('布达佩斯大饭店');
  await page.getByRole('textbox', {name:'条目 3 理由',exact:true}).fill('秩序、色彩和一点点荒诞，构成一个值得反复走进的世界。');
  await page.getByRole('button', {name:'上移条目 3',exact:true}).click();
  if(await page.getByRole('textbox',{name:'条目 2 名称',exact:true}).inputValue()!=='布达佩斯大饭店') throw Error('move failed');
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  if(await page.getByRole('textbox',{name:'条目 2 名称',exact:true}).inputValue()!=='海街日记') throw Error('undo failed');
  await page.getByRole('button',{name:'重做',exact:true}).click();
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await page.getByRole('combobox',{name:'列表模式',exact:true}).selectOption('false');
  await page.getByRole('combobox',{name:'列表模式',exact:true}).selectOption('true');
  await page.getByRole('textbox',{name:'笔记主题',exact:true}).press('Control+s');
  await page.getByRole('status').filter({hasText:'已保存'}).waitFor();
  await page.screenshot({path:'output/playwright/editor-desktop.png',fullPage:true});
  const fonts=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e instanceof HTMLElement&&e.checkVisibility()&&([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||['INPUT','TEXTAREA','SELECT'].includes(e.tagName))).map(e=>({text:(e.textContent||e.getAttribute('aria-label')||'').slice(0,35),px:parseFloat(getComputedStyle(e).fontSize)})).filter(x=>x.px<18));
  if(fonts.length) throw Error(JSON.stringify(fonts));
  return {editor:'passed',minimumFont:'18px',entries:3};
}
