async page => {
  if(!new URL(page.url()).searchParams.has('preview'))throw Error('Use isolated preview');
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  await page.evaluate(()=>localStorage.removeItem('tistnote-development-preview-v1'));
  await page.reload();
  const audit=()=>page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('input,textarea,select')));
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,minFont:Math.min(...nodes.map(el=>parseFloat(getComputedStyle(el).fontSize)))};
  });
  const results=[];
  for(const [width,height] of [[1440,960],[414,924],[390,844]]){
    await page.setViewportSize({width,height});
    await page.getByRole('heading',{name:'品察世间，记录好恶。',exact:true}).waitFor();
    check((await page.locator('.welcome').innerText()).includes('喜欢与讨厌，认同与反感'),'Welcome excludes negative preferences');
    await page.screenshot({path:`output/playwright/positioning-welcome-${width}.png`,fullPage:true});
    results.push(await audit());
  }
  await page.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  await page.getByRole('heading',{name:'从一次品察开始。',exact:true}).waitFor();
  check((await page.locator('.empty-editor').innerText()).includes('喜欢与讨厌，都可以成为一份记录'),'Empty state excludes negative preferences');
  await page.screenshot({path:'output/playwright/positioning-empty-narrow.png',fullPage:true});
  await page.getByRole('button',{name:'去模板库找灵感',exact:true}).click();
  await page.getByRole('heading',{name:'世间万事，皆可一品',exact:true}).waitFor();
  check(await page.locator('.template-card').count()===45,'Expanded catalogue incomplete');
  await page.getByRole('button',{name:'展开或收起搜索',exact:true}).click();
  await page.getByRole('textbox',{name:'搜索',exact:true}).fill('讨厌');
  await page.screenshot({path:'output/playwright/positioning-template-narrow.png',fullPage:true});
  check(await page.locator('.template-card').count()===1,'Negative preference template cannot be found');
  results.push(await audit());
  await page.locator('.template-card').getByRole('button',{name:'开始填写',exact:true}).click();
  check(await page.getByRole('textbox',{name:'笔记主题',exact:true}).inputValue()==='我讨厌的相处方式','Negative title altered');
  await page.getByRole('button',{name:'添加一个选择',exact:true}).click();
  await page.locator('.entry-body input').fill('被随意打断');
  const reason=page.getByPlaceholder('感受与理由（可选）',{exact:true});
  await reason.fill('让我觉得不被尊重。');
  await page.getByRole('button',{name:'完成编辑',exact:true}).click();
  await page.getByRole('textbox',{name:'更新日志（可选）',exact:true}).fill('产品文案验证');
  await page.getByRole('button',{name:'提交更新',exact:true}).click();
  const reader=page.getByRole('article',{name:'笔记内容',exact:true});
  await reader.waitFor();
  check((await reader.innerText()).includes('被随意打断')&&(await reader.innerText()).includes('不被尊重'),'Negative preference content changed or lost');
  await page.getByRole('button',{name:'更多笔记操作',exact:true}).click();
  await page.locator('.editor').getByRole('button',{name:'历史',exact:true}).click();
  await page.getByRole('dialog',{name:'审美与偏好的变化',exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
  for(const result of results)check(result.minFont>=13&&result.scrollWidth<=result.width,'Font or overflow regression: '+JSON.stringify(result));
  return {welcome:'aesthetics and preferences including likes and dislikes',empty:'start from observation',templates:'45 topics, original IDs preserved; negative topic searchable',editor:'neutral reason prompt; negative content unchanged',history:'aesthetics and preferences',results};
}
