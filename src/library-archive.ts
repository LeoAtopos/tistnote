import { Inflate, zipSync } from "fflate";
import { groupName } from "./model";
import { tr } from "./i18n";
import type { LibraryEntries } from "./indexed-files";

export const archiveLimit = 64 * 1024 * 1024;
const fileLimit = 16 * 1024 * 1024, entryLimit = 10000;
const invalid = () => Error(tr("备份格式无效或已损坏，当前资料库未被修改。"));
const tooLarge = () => Error(tr("浏览器备份最多 64 MiB、10000 项，单文件最多 16 MiB。"));
const crcTable = Uint32Array.from({length:256}, (_,n) => { for(let i=0;i<8;i++) n=n&1 ? 0xedb88320^(n>>>1) : n>>>1; return n>>>0; });
const crc32 = (bytes: Uint8Array) => { let crc=0xffffffff; for(const byte of bytes) crc=crcTable[(crc^byte)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; };
function checkedPath(name: string) {
  const path = name.endsWith("/") ? name.slice(0,-1) : name;
  if (!path || groupName(path) !== path) throw invalid();
  return path;
}
export function packLibrary(entries: LibraryEntries): Uint8Array {
  const files: Record<string,Uint8Array> = Object.create(null);
  let total=0;
  if (entries.size > entryLimit) throw tooLarge();
  for (const [name, data] of entries) {
    checkedPath(name);
    if (name === ".tistnote/vault.lock") continue;
    const bytes=data ?? new Uint8Array();total+=bytes.length;
    if(bytes.length>fileLimit||total>archiveLimit)throw tooLarge();
    files[name]=bytes;
  }
  const zip=zipSync(files,{level:1});
  if(zip.length>archiveLimit)throw tooLarge();
  return zip;
}
export function unpackLibrary(bytes: Uint8Array): LibraryEntries {
  if(bytes.length>archiveLimit)throw tooLarge();
  if(bytes.length<22)throw invalid();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=(p:number)=>view.getUint16(p,true),u32=(p:number)=>view.getUint32(p,true);
  let end=bytes.length-22;
  while(end>=Math.max(0,bytes.length-65558)&&u32(end)!==0x06054b50)end--;
  if(end<0||end<bytes.length-65558||end+22+u16(end+20)!==bytes.length)throw invalid();
  const count=u16(end+10),central=u32(end+16);
  if(u16(end+4)||u16(end+6)||u16(end+8)!==count||count===65535||central+u32(end+12)!==end)throw invalid();
  if(count>entryLimit)throw tooLarge();
  const records: {name:string;size:number;crc:number;start:number;compressed:number;method:number}[]=[], names=new Set<string>(), ranges:{start:number;end:number}[]=[];
  let offset=central,total=0;
  for(let i=0;i<count;i++){
    if(offset+46>end||u32(offset)!==0x02014b50)throw invalid();
    const flags=u16(offset+8),method=u16(offset+10),size=u32(offset+24),compressed=u32(offset+20),local=u32(offset+42);
    const next=offset+46+u16(offset+28)+u16(offset+30)+u16(offset+32);
    if(next>end||local+30>central||u16(offset+34)||flags&1||![0,8].includes(method)||(u32(offset+38)>>>16&0xf000)===0xa000)throw invalid();
    const name=new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(offset+46,offset+46+u16(offset+28)));
    checkedPath(name);
    if(names.has(name))throw invalid();names.add(name);
    total+=size;if(size>fileLimit||total>archiveLimit)throw tooLarge();
    if(u32(local)!==0x04034b50||u16(local+8)!==method||(u16(local+6)&1))throw invalid();
    const start=local+30+u16(local+26)+u16(local+28),nameEnd=local+30+u16(local+26);
    if(start>central||start+compressed>central||new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(local+30,nameEnd))!==name)throw invalid();
    if(!(flags&8)&&(u32(local+14)!==u32(offset+16)||u32(local+18)!==compressed||u32(local+22)!==size))throw invalid();
    ranges.push({start:local,end:start+compressed});
    records.push({name,size,crc:u32(offset+16),start,compressed,method});offset=next;
  }
  if(offset!==end)throw invalid();
  ranges.sort((a,b)=>a.start-b.start);
  if(ranges.some((range,i)=>i>0&&range.start<ranges[i-1].end))throw invalid();
  const direct=records.some(r=>r.name===".tistnote/manifest.json");
  const prefix=direct?"":records[0]?.name.split("/")[0]+"/";
  const result:LibraryEntries=new Map();
  for(const record of records){
    let data:Uint8Array;
    if(record.method===0)data=bytes.slice(record.start,record.start+record.compressed);
    else{
      let length=0,finished=false;const chunks:Uint8Array[]=[];
      const decoder=new Inflate((chunk,final)=>{length+=chunk.length;if(length>record.size)throw invalid();chunks.push(chunk);finished=final;});
      try{
        for(let p=0;p<record.compressed;p+=1024)decoder.push(bytes.subarray(record.start+p,record.start+Math.min(p+1024,record.compressed)),p+1024>=record.compressed);
      }catch{throw invalid();}
      if(!finished||length!==record.size)throw invalid();
      data=new Uint8Array(length);let position=0;for(const chunk of chunks){data.set(chunk,position);position+=chunk.length;}
    }
    if(!data||data.length!==record.size||crc32(data)!==record.crc)throw invalid();
    if(!record.name.startsWith(prefix))throw invalid();
    const name=record.name.slice(prefix.length);if(!name)continue;
    const path=checkedPath(name);
    if(path!=="notes"&&path!==".tistnote"&&!path.startsWith("notes/")&&!path.startsWith(".tistnote/"))throw invalid();
    if(path===".tistnote/vault.lock")continue;
    if(name.endsWith("/")&&data.length)throw invalid();
    result.set(name,name.endsWith("/")?null:data);
  }
  for(const [name]of [...result]){
    const parts=checkedPath(name).split("/");
    for(let i=1;i<parts.length;i++){
      const parent=parts.slice(0,i).join("/");
      if(result.has(parent))throw invalid();
      if(!result.has(parent+"/"))result.set(parent+"/",null);
    }
    if(result.has(name.endsWith("/")?name.slice(0,-1):name+"/"))throw invalid();
  }
  const canonical=new Map<string,string>();
  for(const name of result.keys()){
    const key=name.toLowerCase();if(canonical.has(key)&&canonical.get(key)!==name)throw invalid();canonical.set(key,name);
  }
  const manifest=result.get(".tistnote/manifest.json");
  try{if(!manifest||JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(manifest)).schema!==1)throw invalid();}catch{throw invalid();}
  return result;
}
