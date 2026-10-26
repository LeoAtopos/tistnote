async(page)=>{
 const dialog=page.getByRole('dialog',{name:'审美与偏好的变化'});
 await dialog.getByRole('combobox',{name:'从',exact:true}).selectOption('0');
 await dialog.getByRole('combobox',{name:'到',exact:true}).selectOption('2');
 if(!await dialog.getByText('改名：花样年华 → 一一',{exact:true}).last().isVisible())throw Error('version diff missing');
 await page.screenshot({path:'output/playwright/native-history.png'});
 await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
 await page.getByRole('button',{name:'品交',exact:true}).click();
 await page.getByRole('button',{name:'展品',exact:true}).click();
 await page.getByRole('dialog',{name:'展品',exact:true}).waitFor();
 await page.getByRole('button',{name:'复制到剪切板',exact:true}).click();
 await page.getByText('已复制到剪切板',{exact:true}).waitFor();
 await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
 const requests=await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>x.name).filter(x=>!x.startsWith('http://tauri.localhost/')&&!x.startsWith('http://ipc.localhost/')&&!x.startsWith('data:')));
 if(requests.length)throw Error('External resources: '+JSON.stringify(requests));
 return {history:'arbitrary comparison passed',nativeClipboard:'passed',externalResources:requests};
}
