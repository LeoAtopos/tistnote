import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.join(root,'docs','pitch');
const assets=path.join(folder,'assets');
const manifest=JSON.parse(await readFile(path.join(assets,'manifest.json'),'utf8'));

// Insert provenance without decoding or changing the generated PNG image data.
function crc32(buffer){
  let crc=0xffffffff;
  for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
for(const asset of manifest.assets){
  const filename=path.join(assets,asset.file);
  const original=await readFile(filename);
  if(original.includes(Buffer.from('TistnoteProvenance\0'))) continue;
  if(original.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw new Error('Expected PNG');
  const data=Buffer.from(`TistnoteProvenance\0${JSON.stringify(asset)}`,'utf8');
  const type=Buffer.from('tEXt');
  const size=Buffer.alloc(4);size.writeUInt32BE(data.length);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
  let iend=8;
  while(iend<original.length && original.subarray(iend+4,iend+8).toString()!=='IEND') iend+=12+original.readUInt32BE(iend);
  if(iend>=original.length) throw new Error('Invalid PNG');
  await writeFile(filename,Buffer.concat([original.subarray(0,iend),size,type,data,crc,original.subarray(iend)]));
}

let html=await readFile(path.join(folder,'index.html'),'utf8');
const css=await readFile(path.join(folder,'pitch.css'),'utf8');
const js=await readFile(path.join(folder,'pitch.js'),'utf8');
html=html.replace('<link rel="stylesheet" href="pitch.css">',`<style>\n${css}\n</style>`)
  .replace('<script src="pitch.js"></script>',`<script>\n${js}\n</script>`);
for(const [name,mime] of [...manifest.assets.map(asset=>[asset.file,'image/png']),['app-icon.svg','image/svg+xml']]){
  const data=await readFile(path.join(assets,name));
  html=html.replaceAll(`assets/${name}`,`data:${mime};base64,${data.toString('base64')}`);
}
for(const [href,name] of [['../PRD.md','品记-产品需求文档.md'],['../PRODUCT_THEORY.md','品记-产品理论.md'],['../../example/范例1/仓库说明.md','品记-范例说明.md']]){
  const data=await readFile(path.resolve(folder,href));
  html=html.replace(`href="${href}"`,`href="data:text/markdown;charset=utf-8;base64,${data.toString('base64')}" download="${name}"`);
}
const target=path.join(folder,'品记-项目提案.html');
await writeFile(target,html,'utf8');
console.log(JSON.stringify({file:target,bytes:Buffer.byteLength(html),externalDependencies:0}));
