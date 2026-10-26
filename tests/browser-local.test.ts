import test from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { isIOSBrowser } from "../src/browser-platform";
import { packLibrary, unpackLibrary } from "../src/library-archive";
import type { LibraryEntries } from "../src/indexed-files";

const text=(value:string)=>new TextEncoder().encode(value);
const fixture=():LibraryEntries=>new Map([
  [".tistnote/manifest.json",text('{"schema":1}')],
  ["notes/生活/空分组/",null],
  ["notes/生活/品单.md",text("# 喜欢与讨厌\n中文与 emoji 🌱")],
  [".tistnote/attachments/test.bin",new Uint8Array([0,255,2,128])],
  [".tistnote/vault.lock",text("not portable")],
]);
function central(zip:Uint8Array){const view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);for(let i=0;i<zip.length-4;i++)if(view.getUint32(i,true)===0x02014b50)return i;throw Error("Missing central directory");}
test("Apple mobile detection includes desktop-style iPad and excludes desktops and Android",()=>{
  for(const device of [
    {userAgent:"Mozilla iPhone Chrome",platform:"iPhone",maxTouchPoints:5},
    {userAgent:"Mozilla iPad",platform:"iPad",maxTouchPoints:5},
    {userAgent:"Mozilla Macintosh Safari",platform:"MacIntel",maxTouchPoints:5},
  ])assert.equal(isIOSBrowser(device),true);
  for(const device of [
    {userAgent:"Mozilla Macintosh Chrome",platform:"MacIntel",maxTouchPoints:0},
    {userAgent:"Mozilla Android Chrome",platform:"Linux",maxTouchPoints:5},
    {userAgent:"Mozilla Windows",platform:"Win32",maxTouchPoints:10},
  ])assert.equal(isIOSBrowser(device),false);
});
test("browser ZIP roundtrip preserves Unicode, binary data and empty groups, omitting desktop lock",()=>{
  const original=fixture(),restored=unpackLibrary(packLibrary(original));
  for(const [path,data]of original)if(path!==".tistnote/vault.lock")assert.deepEqual(restored.get(path),data);
  assert.equal(restored.has(".tistnote/vault.lock"),false);
  assert.equal(restored.get("notes/生活/"),null);
  const wrapped=Object.fromEntries([...original].map(([path,data])=>["Library/"+path,data??new Uint8Array()]));
  assert.deepEqual(unpackLibrary(zipSync(wrapped)),restored);
});
test("browser ZIP import rejects traversal, unknown roots, file-directory collisions and invalid manifests",()=>{
  const samples:Record<string,Uint8Array>[]=[
    {"../escape":text("x")}, {"notes\\escape":text("x")}, {"other/file":text("x")},
    {"notes/a":text("file"),"notes/a/note.md":text("x")},
    {".tistnote/manifest.json":text('{"schema":2}')},
  ];
  for(const entries of samples)assert.throws(()=>unpackLibrary(zipSync(entries)),JSON.stringify(Object.keys(entries)));
  assert.throws(()=>unpackLibrary(new Uint8Array([1,2,3])));
});
test("browser ZIP import refuses understated output sizes and case-colliding groups",()=>{
  const zip=zipSync({".tistnote/manifest.json":text('{"schema":1}'),"notes/data.txt":text("x".repeat(100000))});
  const view=new DataView(zip.buffer),first=central(zip),second=first+46+view.getUint16(first+28,true)+view.getUint16(first+30,true)+view.getUint16(first+32,true);
  const local=view.getUint32(second+42,true);
  view.setUint32(second+24,0,true);view.setUint32(second+16,0,true);view.setUint32(local+22,0,true);view.setUint32(local+14,0,true);
  assert.throws(()=>unpackLibrary(zip));
  assert.throws(()=>unpackLibrary(zipSync({".tistnote/manifest.json":text('{"schema":1}'),"notes/A/one.md":text("a"),"notes/a/two.md":text("b")})));
});
test("browser ZIP import checks CRC and declared sizes before allocating large files",()=>{
  const input={".tistnote/manifest.json":text('{"schema":1}')};
  const corrupted=zipSync(input,{level:0}),p=central(corrupted);
  corrupted[p-1]^=1;assert.throws(()=>unpackLibrary(corrupted));
  const oversized=zipSync(input),offset=central(oversized);
  new DataView(oversized.buffer).setUint32(offset+24,16*1024*1024+1,true);
  assert.throws(()=>unpackLibrary(oversized),/64 MiB/);
  const link=zipSync(input);new DataView(link.buffer).setUint32(central(link)+38,0xa1ff0000,true);
  assert.throws(()=>unpackLibrary(link));
  const encrypted=zipSync(input);new DataView(encrypted.buffer).setUint16(central(encrypted)+8,1,true);
  assert.throws(()=>unpackLibrary(encrypted));
});
