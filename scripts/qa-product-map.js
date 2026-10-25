async page => {
  const check=(ok,message)=>{if(!ok)throw Error(message)};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1440,height:1000});
  const data=await page.evaluate(()=>({branches:window.PRODUCT_MAP.branches,features:window.PRODUCT_MAP.features,shots:window.PRODUCT_MAP.shots}));
  check(data.branches.length===6&&data.features.length===36&&Object.keys(data.shots).length===40,'Coverage changed');
  const audit=()=>page.evaluate(()=>{
    const text=[...document.querySelectorAll('body *')].filter(el=>el.checkVisibility()&&([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('input,textarea,select')));
    return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,minFont:Math.min(...text.map(el=>parseFloat(getComputedStyle(el).fontSize)))};
  });
  const audits=[];
  const capture=async name=>page.screenshot({path:`output/playwright/product-map/${name}.png`,fullPage:true,scale:'css'});
  for(const [width,height] of [[1440,1000],[820,1000],[390,844]]){
    await page.setViewportSize({width,height});
    const a=await audit();check(a.documentWidth<=width&&a.minFont>=18,'Map layout '+JSON.stringify(a));audits.push(a);
    await capture(`map-${width}`);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'收起全部',exact:true}).click();
  check(await page.locator('.map-branch[open]').count()===0,'Collapse failed');
  await capture('map-collapsed');
  await page.getByRole('button',{name:'展开全部',exact:true}).click();
  check(await page.locator('.map-branch[open]').count()===6,'Expand failed');
  const search=page.getByRole('searchbox',{name:'查找功能',exact:true});
  await search.fill('回顾');
  check(await page.locator('.feature-node:visible').count()>0&&await page.locator('.feature-node:visible').count()<36,'Search did not filter');
  await search.fill('这项功能不存在xyz');
  check(await page.locator('#empty').isVisible(),'No search empty state');
  await search.fill('');
  await page.getByRole('button',{name:'按顺序浏览',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await page.locator('.viewer-content').evaluate(el=>el.scrollTop=el.scrollHeight);
  await page.getByRole('button',{name:'下一功能',exact:true}).click();
  check(await page.locator('.viewer-content').evaluate(el=>el.scrollTop)===0,'Next feature kept the previous scroll position');
  await dialog.getByRole('heading',{name:'重读有排名的品单',exact:true}).waitFor();
  await page.getByRole('button',{name:'上一功能',exact:true}).click();
  const visited=[];
  for(const feature of data.features){
    await dialog.getByRole('heading',{name:feature.title,exact:true}).waitFor();
    for(const [index,shot] of feature.shots.entries()){
      await page.locator('#shot-tabs').getByRole('button',{name:shot.title,exact:true}).click();
      await page.locator('#product-image').evaluate(img=>img.decode());
      const info=await page.locator('#product-image').evaluate(img=>({width:img.getBoundingClientRect().width,naturalWidth:img.naturalWidth,src:img.src}));
      check(info.width===info.naturalWidth&&info.naturalWidth>0,'Screenshot scaled or missing: '+shot.id);
      check(info.src.startsWith('data:image/png;base64,'),'Standalone asset not embedded');
    }
    const a=await audit();check(a.minFont>=18&&a.documentWidth<=a.width,'Dialog font/overflow '+feature.id);
    visited.push(feature.id);
    if(['workspace','versions','invite','vault'].includes(feature.id))await page.screenshot({path:`output/playwright/product-map/viewer-${feature.id}.png`,scale:'css'});
    if(feature.id!==data.features.at(-1).id)await page.getByRole('button',{name:'下一功能',exact:true}).click();
  }
  check(await page.getByRole('button',{name:'下一功能',exact:true}).isDisabled(),'Last feature boundary');
  await page.keyboard.press('Escape');check(!await dialog.isVisible(),'Esc did not close');
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-feature="share"]').click();
  await page.locator('#product-image').evaluate(img=>img.decode());
  let a=await audit();check(a.documentWidth<=390&&a.minFont>=18,'Narrow viewer overflow '+JSON.stringify(a));audits.push({...a,context:'viewer'});
  const pan=await page.locator('.shot-viewport').evaluate(el=>{el.scrollLeft=400;return {left:el.scrollLeft,width:el.clientWidth,content:el.scrollWidth}});
  check(pan.left>0&&pan.content>pan.width,'Narrow screenshot cannot pan');
  await page.screenshot({path:'output/playwright/product-map/viewer-narrow.png',scale:'css'});
  await page.getByRole('button',{name:'关闭截图浏览',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-feature="workspace"]').click();
  await page.reload();
  await dialog.getByRole('heading',{name:'认识主界面',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByText('关于范例与截图',{exact:true}).click();
  check((await page.locator('.source-note').innerText()).includes('Windows 系统对话框'),'Provenance missing');
  const http=[];await page.context().setOffline(true);page.on('request',r=>{if(/^https?:/.test(r.url()))http.push(r.url())});
  await page.getByRole('button',{name:'按顺序浏览',exact:true}).click();
  await page.locator('#product-image').evaluate(img=>img.decode());
  await page.getByRole('button',{name:'下一功能',exact:true}).click();
  await page.locator('#product-image').evaluate(img=>img.decode());
  await page.keyboard.press('Escape');
  check(!errors.length,'Page errors '+JSON.stringify(errors));check(!http.length,'Offline page requested network '+JSON.stringify(http));
  await page.context().setOffline(false);
  return {coverage:{branches:6,features:visited.length,screenshots:40},audits,naturalSize:'all screenshot states',interactions:['36 feature tour','next feature resets content scroll','all screenshot switches','collapse/expand','search/empty state','Esc/close','narrow panning','hash reload'],offlineHttpRequests:http.length,pageErrors:errors};
}
