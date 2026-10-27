import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { newNote, uid, setReviewInterval, type Note, type RecordNote, type Vault, type Version } from "../src/model";
import { markdown, parseMarkdown, revision } from "../src/markdown";
import { WebStore, type FilePort } from "../src/web-store";
import { emptyCanvasLayout, type CanvasState } from "../src/canvas-layout";

class MemoryFiles implements FilePort {
  data = new Map<string,string>();
  dirs = new Set<string>();
  fail: ((path: string, text: string | null) => boolean) | null = null;
  async read(path: string) { return this.data.get(path) ?? null; }
  async mkdir(path: string) { const parts=path.split('/'); for(let i=1;i<=parts.length;i++)this.dirs.add(parts.slice(0,i).join('/')); }
  async write(path: string, text: string) {
    if(this.fail?.(path,text))throw Error('Injected write failure');
    await this.mkdir(path.slice(0,path.lastIndexOf('/'))); this.data.set(path,text);
  }
  async remove(path: string) {
    if(this.fail?.(path,null))throw Error('Injected remove failure');
    if(this.data.has(path)){this.data.delete(path);return;}
    if([...this.data.keys(),...this.dirs].some(p=>p.startsWith(path+'/')))throw Error('Directory is not empty');
    this.dirs.delete(path);
  }
  async walk(path: string) {return {files:[...this.data.keys()].filter(p=>p.startsWith(path+'/')).sort(),directories:[...this.dirs].filter(p=>p.startsWith(path+'/')).sort()};}
}
const fixture=()=>{const note=newNote();note.title='喜欢与不喜欢';note.description='第一行\n\n最后一行';note.entries=[{id:uid(),name:'作品',reason:'\n\n真实感受\n'}];return note;};
async function setup(){const files=new MemoryFiles();const store=new WebStore(files,'test');await store.initialize();return {files,store};}
const save=(store:WebStore,note:Note,expected:string|null=null,group='')=>store.command('save',{note,expected,group}) as Promise<RecordNote>;
const versions=(store:WebStore,id:string)=>store.command('versions',{id}) as Promise<Version[]>;

test('custom review intervals survive Markdown, review history, moves and cancellation; invalid metadata preserves files',async()=>{
  const {store,files}=await setup();
  const note=fixture();setReviewInterval(note,{value:3,unit:'day'});
  assert.match(markdown(note),/"schema": 2/);
  const initial=await save(store,note);
  assert.deepEqual((await parseMarkdown(markdown(initial.note))).note,{...initial.note,source:null});
  const reviewed=await store.command('review_note',{id:note.id,expected:initial.revision}) as RecordNote;
  assert.deepEqual(reviewed.note.reviewInterval,{value:3,unit:'day'});
  assert.deepEqual((await versions(store,note.id)).at(-1)?.note.reviewInterval,{value:3,unit:'day'});
  const draft=structuredClone(reviewed.note);setReviewInterval(draft,{value:2,unit:'week'});
  const changed=await save(store,draft,reviewed.revision);
  const cancelled=await store.command('cancel_edit',{note:reviewed.note,expected:changed.revision,group:''}) as RecordNote;
  assert.deepEqual(cancelled.note,reviewed.note);
  await store.command('group_create',{name:'回顾'});
  const moved=await store.command('move_note',{id:note.id,expected:cancelled.revision,group:'回顾'}) as RecordNote;
  const reopened=new WebStore(files,'test');await reopened.initialize();
  assert.deepEqual((await reopened.list()).notes[0].note,moved.note);
  const path=`notes/回顾/${note.id}.md`,before=files.data.get(path)!;
  await assert.rejects(save(store,{...moved.note,reviewInterval:{value:0,unit:'day'}},moved.revision));
  assert.equal(files.data.get(path),before);
  await assert.rejects(parseMarkdown(before.replace('"schema": 2','"schema": 1')));
  setReviewInterval(note,{value:6,unit:'month'});
  assert.match(markdown(note),/"schema": 1/);
});

test('canvas positions and group order persist without touching Markdown and reject conflicts or corruption',async()=>{
  const {store,files}=await setup();
  const r=await save(store,fixture());
  const noteFile=`notes/${r.note.id}.md`,original=files.data.get(noteFile);
  const initial=await store.command('canvas_get') as CanvasState;
  assert.equal(initial.revision,null);
  const layout={...emptyCanvasLayout(),positions:{[`note:${r.note.id}`]:{x:120,y:-50}},groupOrder:['B','A']};
  const saved=await store.command('canvas_put',{layout,expected:null}) as CanvasState;
  assert(saved.revision);
  assert.deepEqual((await store.command('canvas_get') as CanvasState).layout,layout);
  const reopened=new WebStore(files,'test');await reopened.initialize();
  assert.deepEqual(await reopened.command('canvas_get'),saved);
  await assert.rejects(store.command('canvas_put',{layout:emptyCanvasLayout(),expected:null}),/外部更新/);
  assert.equal(files.data.get(noteFile),original);
  const before=files.data.get('.tistnote/canvas.json');
  files.fail=(path,text)=>path==='.tistnote/canvas.json'&&text!==null;
  await assert.rejects(store.command('canvas_put',{layout:emptyCanvasLayout(),expected:saved.revision}));
  assert.equal(files.data.get('.tistnote/canvas.json'),before);files.fail=null;
  files.data.set('.tistnote/canvas.json','broken');
  await assert.rejects(store.command('canvas_put',{layout,expected:saved.revision}),/原文件已保留/);
  assert.equal(files.data.get('.tistnote/canvas.json'),'broken');assert.equal(files.data.get(noteFile),original);
});

test('web Markdown roundtrip preserves multiline reasons, metadata and stable entry IDs',async()=>{
  const note=fixture();note.reviewTestMinute=true;note.lastReviewedAt=new Date().toISOString();note.tags=['电影'];
  const parsed=await parseMarkdown(markdown(note));
  assert.deepEqual(parsed.note,{...note,reviewIntervalMonths:3,source:null});
  assert.equal(parsed.approximate,false);
  const raw=markdown(note).replace(/  <!-- tistnote-entry:[^\n]+ -->\n/g,'');
  const first=await parseMarkdown(raw),second=await parseMarkdown(raw);
  assert(first.approximate);assert.equal(first.note.entries[0].id,second.note.entries[0].id);
  assert.notEqual(first.note.entries[0].id,note.entries[0].id);
  await assert.rejects(parseMarkdown(markdown(note).replace('<!-- tistnote:entries -->','invalid')));
});
test('web parser reads every committed example note without dropping text',async()=>{
  const paths:string[]=[];
  const walk=(dir:string)=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())walk(p);else if(p.endsWith('.md'))paths.push(p);}};
  walk('example/范例1/notes');
  assert(paths.length>=50);
  for(const path of paths){const parsed=await parseMarkdown(readFileSync(path,'utf8'));const again=await parseMarkdown(markdown(parsed.note));assert.deepEqual(again.note,parsed.note,path);}
});
test('web CRUD, groups, trash, history and review confirmations use compatible files',async()=>{
  const {store,files}=await setup();
  await store.command('group_create',{name:'生活/偏好'});
  const initial=await save(store,fixture(),null,'生活/偏好');
  assert(files.data.has(`notes/生活/偏好/${initial.note.id}.md`));
  await store.command('commit_edit',{id:initial.note.id,expected:initial.revision,label:'更新说明'});
  const reviewed=await store.command('review_note',{id:initial.note.id,expected:initial.revision}) as RecordNote;
  assert.equal(reviewed.note.updatedAt,initial.note.updatedAt);assert(reviewed.note.lastReviewedAt);
  assert((await versions(store,initial.note.id)).some(v=>v.kind==='review'));
  await store.command('group_rename',{name:'生活',new_name:'记录'});
  let record=(await store.list()).notes[0];assert.equal(record.group,'记录/偏好');
  await store.command('trash',{id:record.note.id,restore:false,expected:record.revision});
  const trashed=(await store.list()).trash[0];assert.equal(trashed.group,'记录/偏好');
  await store.command('trash',{id:trashed.note.id,restore:true,expected:trashed.revision});
  record=(await store.list()).notes[0];
  const moved=await store.command('move_note',{id:record.note.id,expected:record.revision,group:''}) as RecordNote;
  assert.equal(moved.group,'');
  await store.command('trash',{id:moved.note.id,restore:false,expected:moved.revision});
  await store.command('purge',{id:moved.note.id});assert.equal((await store.list()).trash.length,0);
  assert.equal((await versions(store,moved.note.id)).length,0);
});
test('web writes reject duplicate titles, stale revisions and corrupt history without overwriting',async()=>{
  const {store,files}=await setup();const record=await save(store,fixture());
  const duplicate={...fixture(),id:uid()};await assert.rejects(save(store,duplicate),/DUPLICATE_TITLE/);
  const path=`notes/${record.note.id}.md`,before=files.data.get(path)!;
  const external=before.replace('# 喜欢与不喜欢','# 外部更新');files.data.set(path,external);
  await assert.rejects(save(store,{...record.note,title:'我的编辑'},record.revision),/CONFLICT/);
  assert.equal(files.data.get(path),external);
  assert([...files.data.keys()].some(path=>path.startsWith('.tistnote/conflicts/')));
  const fresh=(await store.list()).notes[0];files.data.set(`.tistnote/history/${fresh.note.id}/${uid()}.json`,'broken');
  await assert.rejects(save(store,{...fresh.note,title:'另一次编辑'},fresh.revision),/damaged/);
  assert.equal(files.data.get(path),external);
});
test('failed review history writes roll back note bytes and timestamps',async()=>{
  const {store,files}=await setup();const r=await save(store,fixture());const path=`notes/${r.note.id}.md`,original=files.data.get(path);
  files.fail=(path,text)=>path.startsWith(`.tistnote/history/${r.note.id}/`)&&text!==null;
  await assert.rejects(store.command('review_note',{id:r.note.id,expected:r.revision}),/Injected/);
  assert.equal(files.data.get(path),original);
  assert.equal((await store.list()).notes[0].note.lastReviewedAt,null);
});
test('unfinished web journals recover safe partial operations and preserve conflicting external files',async()=>{
  const {store,files}=await setup();const r=await save(store,fixture());const path=`notes/${r.note.id}.md`,before=files.data.get(path)!;
  const after=before.replace('# 喜欢与不喜欢','# 临时更新');const history=`.tistnote/history/${r.note.id}/${uid()}.json`;
  const journal=`.tistnote/web-journal/${uid()}.json`;
  files.data.set(journal,JSON.stringify([{path,before,after},{path:history,before:null,after:'pending'}]));files.data.set(path,after);
  await new WebStore(files,'reopen').initialize();assert.equal(files.data.get(path),before);assert(!files.data.has(journal));
  files.data.set(journal,JSON.stringify([{path,before,after}]));files.data.set(path,'external content');
  await assert.rejects(new WebStore(files,'reopen').initialize(),/CONFLICT/);assert.equal(files.data.get(path),'external content');assert(files.data.has(journal));
});
test('web cancel restores original content, timestamps and group after autosave',async()=>{
  const {store}=await setup();await store.command('group_create',{name:'原组'});const base=await save(store,fixture(),null,'原组');
  const updated=await save(store,{...base.note,title:'已自动保存的更新'},base.revision);
  const moved=await store.command('move_note',{id:base.note.id,expected:updated.revision,group:''}) as RecordNote;
  const cancelled=await store.command('cancel_edit',{note:base.note,expected:moved.revision,group:'原组'}) as RecordNote;
  assert.deepEqual(cancelled.note,base.note);assert.equal(cancelled.group,'原组');
});
test('web mutation refuses to edit a library with duplicate IDs or broken Markdown',async()=>{
  const {store,files}=await setup();const r=await save(store,fixture());
  files.data.set('notes/broken.md','not a note');
  assert((await store.list()).warnings.length);
  await assert.rejects(save(store,{...r.note,title:'不要覆盖'},r.revision),/Unreadable/);
  assert.equal(files.data.get('notes/broken.md'),'not a note');
});
