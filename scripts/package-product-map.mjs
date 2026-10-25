import {readFile,writeFile,readdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.join(root,'docs','product-map'),assets=path.join(folder,'assets');
const data=JSON.parse(await readFile(path.join(folder,'features.json'),'utf8'));
const names=(await readdir(assets)).filter(name=>name.endsWith('.png')).sort();
const shots={};
for(const file of names){
  const bytes=await readFile(path.join(assets,file));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',`Invalid PNG: ${file}`);
  const id=file.slice(0,-4),isExport=id.endsWith('-export');
  shots[id]={src:`assets/${file}`,file,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),minimumSourceFont:isExport?28:18,source:isExport?'应用实际导出 PNG':'当前 React 应用的显式开发预览',sample:'范例1（虚构）',date:'2026-10-25'};
}
const featureIds=data.features.map(f=>f.id),used=data.features.flatMap(f=>f.shots.map(s=>s.id));
assert.equal(new Set(featureIds).size,featureIds.length,'Duplicate feature');
assert.deepEqual(data.branches.flatMap(b=>b.features),featureIds,'Branch order must match the tour');
for(const f of data.features){assert.ok(f.title&&f.value&&f.path&&f.example&&f.points.length&&f.shots.length,`Incomplete feature: ${f.id}`);for(const s of f.shots)assert.ok(shots[s.id],`Missing shot: ${s.id}`)}
assert.deepEqual([...new Set(used)].sort(),Object.keys(shots).sort(),'Every captured screenshot must be reachable');
await copyFile(path.join(root,'public','app-icon.svg'),path.join(assets,'app-icon.svg'));
const payload={...data,shots};
await writeFile(path.join(folder,'data.js'),`window.PRODUCT_MAP=${JSON.stringify(payload)};\n`);
await writeFile(path.join(assets,'manifest.json'),JSON.stringify({captureDate:'2026-10-25',source:'Current application, isolated explicit ?preview; original example vault unchanged',sample:{persona:'林知夏，23岁，北京',notes:53,nonTemplateNotes:26,builtinCovered:27,builtinTemplates:45,coverage:'60%'},notes:['部分状态为范例的临时操作演示。','备份、恢复、Markdown导入只展示入口，未拍摄系统文件对话框。','截图原像素展示，不缩小。'],assets:shots},null,2)+'\n');
let html=await readFile(path.join(folder,'index.html'),'utf8');
const css=await readFile(path.join(folder,'map.css'),'utf8'),js=await readFile(path.join(folder,'map.js'),'utf8');
const embedded=structuredClone(payload);
for(const shot of Object.values(embedded.shots))shot.src=`data:image/png;base64,${(await readFile(path.join(assets,shot.file))).toString('base64')}`;
html=html.replace('<link rel="stylesheet" href="map.css">',`<style>\n${css}\n</style>`)
  .replace('<script src="data.js"></script>',`<script>window.PRODUCT_MAP=${JSON.stringify(embedded).replaceAll('<','\\u003c')};</script>`)
  .replace('<script src="map.js"></script>',`<script>\n${js}\n</script>`)
  .replaceAll('assets/app-icon.svg',`data:image/svg+xml;base64,${(await readFile(path.join(assets,'app-icon.svg'))).toString('base64')}`);
assert.ok(!/(?:src|href)="(?:https?:|map\.|data\.js|assets\/)/.test(html),'External artifact dependency');
const target=path.join(folder,'品记-功能全景图.html');
await writeFile(target,html);
console.log(JSON.stringify({target,branches:data.branches.length,features:featureIds.length,screenshots:names.length,bytes:Buffer.byteLength(html),externalDependencies:0}));
