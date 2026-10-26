async page => {
 const context=await page.context().browser().newContext({viewport:{width:1440,height:960}});
 const tab=await context.newPage();
 const errors=[];tab.on('pageerror',error=>errors.push(String(error)));
 const check=(ok,message)=>{if(!ok)throw Error(message)};
 try{
  await tab.addInitScript(()=>{
   localStorage.setItem('tistnote-preferences-v1',JSON.stringify({language:'zh',theme:'light'}));
   localStorage.setItem('tistnote-introduction-seen-v1','1');
   localStorage.setItem('tistnote-browser-tip-dismissed-v1','1');
  });
  await tab.goto('http://127.0.0.1:1420/?preview=1');
  await tab.getByRole('button',{name:'创建或打开本地资料库',exact:true}).click();
  await tab.getByRole('button',{name:'写一份新笔记',exact:true}).click();
  const title=tab.getByRole('textbox',{name:'笔记主题',exact:true});
  const description=tab.getByRole('textbox',{name:'主题说明',exact:true});
  const focused=locator=>locator.evaluate(el=>document.activeElement===el);
  await title.fill('愿意再去的地方');
  for(const event of [{key:'Enter',isComposing:true},{key:'Enter',keyCode:229},{key:'Enter',repeat:true},{key:'Enter',ctrlKey:true},{key:'Enter',metaKey:true},{key:'Enter',altKey:true},{key:'Enter',shiftKey:true}]){
   await title.dispatchEvent('keydown',event);
   check(await focused(title),'IME or modified Enter moved focus');
  }
  await title.press('Enter');
  check(await focused(description),'Title Enter did not focus description');
  await tab.keyboard.type('值得再次出发的地方');
  await description.press('Enter');await tab.keyboard.type('也记下每一次变化');
  check(await description.inputValue()==='值得再次出发的地方\n也记下每一次变化','Continuous typing or description line break failed');
  check(await tab.locator('.entry').count()===0,'Title Enter added an unwanted entry');
  await tab.getByRole('button',{name:'添加一个选择',exact:true}).click();
  await tab.getByRole('textbox',{name:'条目 1 名称',exact:true}).fill('大山与河流');
  const before=await description.inputValue();
  await title.focus();await title.press('Enter');
  check(await focused(description),'Existing note did not focus description');
  check(await description.inputValue()===before,'Existing description changed');
  check(await tab.locator('.entry').count()===1,'Title Enter changed entry count');
  await tab.screenshot({path:'output/playwright/title-enter-desktop.png'});
  await tab.setViewportSize({width:390,height:844});
  await title.focus();await title.press('Enter');
  check(await focused(description),'Narrow screen focus failed');
  const bounds=await description.boundingBox();check(bounds.y>=0&&bounds.y+bounds.height<=845,'Description not visible after focus');
  await tab.screenshot({path:'output/playwright/title-enter-narrow.png'});
  await title.focus();await title.press('Tab');
  check(await focused(description),'Normal Tab navigation changed');
  const minFont=await description.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  check(minFont>=18,'Description font below 18px');
  check(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
  check(errors.length===0,errors.join('\n'));
  return {titleToDescription:true,continuousTyping:true,descriptionLineBreak:true,noExtraEntry:true,preservesContent:true,imeGuard:true,modifiers:true,tabOrder:true,narrowFocus:true,minFont};
 }finally{await context.close()}
}
