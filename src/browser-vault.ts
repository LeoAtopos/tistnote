import { tr } from "./i18n";
import { groupName, uid, type RecordNote, type Vault } from "./model";
import { parseMarkdown } from "./markdown";
import { WebStore, type FilePort } from "./web-store";
import { isIOSBrowser } from "./browser-platform";
import { activeBrowserLibrary, browserLibraries, createBrowserLibrary, IndexedFiles, openBrowserDatabase, rememberBrowserLibrary, type BrowserLibrary } from "./indexed-files";
import { archiveLimit, packLibrary, unpackLibrary } from "./library-archive";

type Directory = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
};
type FilePickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: string; id?: string; startIn?: FileSystemHandle }) => Promise<Directory>;
  showOpenFilePicker?: (options: object) => Promise<FileSystemFileHandle[]>;
};
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: string; id?: string; startIn?: FileSystemHandle }) => Promise<Directory>;
  }
}
const host = () => window as FilePickerWindow;
const notFound = (error: unknown) => error instanceof DOMException && error.name === "NotFoundError";
const internal = isIOSBrowser(navigator);
export const supported = () => typeof window !== "undefined" && (internal || typeof host().showDirectoryPicker === "function") && !!navigator.locks && !!window.indexedDB;
export class BrowserFiles implements FilePort {
  constructor(readonly root: FileSystemDirectoryHandle) {}
  private parts(path: string) { groupName(path); return path.split("/"); }
  private async directory(parts: string[], create = false) {
    let dir = this.root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part,{create});
    return dir;
  }
  async mkdir(path: string) { await this.directory(this.parts(path),true); }
  async read(path: string): Promise<string | null> {
    const parts = this.parts(path), name = parts.pop()!;
    try {
      const handle = await (await this.directory(parts)).getFileHandle(name);
      return new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(await (await handle.getFile()).arrayBuffer());
    } catch (error) { if (notFound(error)) return null; throw error; }
  }
  async write(path: string, text: string) {
    const parts = this.parts(path), name = parts.pop()!;
    const dir = await this.directory(parts,true);
    let existed = true;
    try { await dir.getFileHandle(name); } catch (error) { if (notFound(error)) existed = false; else throw error; }
    const file = await dir.getFileHandle(name,{create:true});
    let writable: FileSystemWritableFileStream | undefined;
    try {
      writable = await file.createWritable();
      await writable.write(text); await writable.close();
    } catch (error) {
      try { await writable?.abort(); } catch { /* Original content is kept by createWritable. */ }
      if (!existed) try { if (!(await file.getFile()).size) await dir.removeEntry(name); } catch { /* Keep any externally updated data. */ }
      throw error;
    }
  }
  async remove(path: string) {
    const parts = this.parts(path), name = parts.pop()!;
    try { await (await this.directory(parts)).removeEntry(name); }
    catch (error) { if (!notFound(error)) throw error; }
  }
  async walk(path: string) {
    const files: string[] = [], directories: string[] = [];
    let root: FileSystemDirectoryHandle;
    try { root = await this.directory(this.parts(path)); }
    catch (error) { if (notFound(error)) return {files,directories}; throw error; }
    const visit = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, handle] of (dir as Directory).entries()) {
        const child = `${prefix}/${name}`;
        if (handle.kind === "directory") { directories.push(child); await visit(handle as FileSystemDirectoryHandle,child); }
        else files.push(child);
      }
    };
    await visit(root,path);
    return { files:files.sort(), directories:directories.sort() };
  }
}
let current: WebStore | null = null, currentDirectory: Directory | null = null;
let localLibrary: BrowserLibrary | null = null;
let dbTask: Promise<IDBDatabase> | null = null;
const database = () => dbTask ??= openBrowserDatabase().catch(error => { dbTask = null; throw error; });
let releaseSession: (() => void) | null = null;
let startupTask: Promise<Vault | null> | null = null;
async function session() {
  if (releaseSession) return;
  await new Promise<void>((resolve,reject) => {
    void navigator.locks.request("tistnote-local-library",{ifAvailable:true},async lock => {
      if (!lock) { reject(Error(tr("请先关闭其他已打开资料库的品记网页标签。"))); return; }
      await new Promise<void>(release => { releaseSession = release; resolve(); });
    }).catch(reject);
  });
}
async function openInternal(library: BrowserLibrary, restored = false): Promise<Vault> {
  await session();
  const db = await database(), files = new IndexedFiles(db, library.id), store = new WebStore(files, library.name);
  if (restored && await files.read(".tistnote/manifest.json") === null) throw Error(tr("此文件夹不是完整的品记资料库备份"));
  await store.initialize();
  const vault = await store.command("list", {recover:true}) as Vault;
  if (restored) {
    if (vault.warnings.length) throw Error(vault.warnings.join("\n"));
    for (const record of [...vault.notes,...vault.trash]) await store.command("versions", {id:record.note.id});
    await store.command("canvas_get");
  }
  await rememberBrowserLibrary(db, library);
  current = store; currentDirectory = null; localLibrary = library;
  try { await navigator.storage?.persist?.(); } catch { /* A persistence request is optional; the UI always explains storage eviction. */ }
  return vault;
}
export async function listInternalLibraries() { return browserLibraries(await database()); }
export async function selectInternalLibrary(id: string) {
  const library = (await listInternalLibraries()).find(item => item.id === id);
  if (!library) throw Error(tr("浏览器资料库记录无法读取，已有数据已保留。"));
  return openInternal(library);
}
export async function newInternalLibrary(name: string, entries?: Parameters<typeof createBrowserLibrary>[2]) {
  await session();
  const db = await database(), library = await createBrowserLibrary(db, name, entries);
  try { return await openInternal(library, !!entries); }
  catch (error) {
    try { await new IndexedFiles(db,library.id).discard(); } catch { /* Keep any incomplete new library for recovery; the active library is unchanged. */ }
    throw error;
  }
}
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve,reject) => {
    const input=document.createElement("input");input.type="file";input.accept=accept;input.hidden=true;
    const finish=(file:File|null)=>{input.remove();resolve(file);};
    input.onchange=()=>finish(input.files?.[0]??null);input.addEventListener("cancel",()=>finish(null),{once:true});
    document.body.append(input);
    try{input.click();}catch(error){input.remove();reject(error);}
  });
}
function downloadZip(bytes: Uint8Array, name: string) {
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/zip"}));
  const link=document.createElement("a");link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
async function cacheHandle(write?: Directory): Promise<Directory | null> {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open("tistnote-file-handles",1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("handles",write ? "readwrite" : "readonly");
      const operation = write ? tx.objectStore("handles").put(write,"library") : tx.objectStore("handles").get("library");
      tx.oncomplete = () => { const result = write ?? operation.result ?? null; db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
async function open(directory: Directory): Promise<Vault> {
  await session();
  const files = new BrowserFiles(directory);
  const manifest = await files.read(".tistnote/manifest.json");
  if (manifest === null) {
    for await (const _ of directory.entries()) throw Error(tr("请选择空文件夹，或包含 .tistnote/manifest.json 的品记资料库。"));
  }
  const store = new WebStore(files,directory.name);
  await store.initialize();
  const vault = await store.command("list",{recover:true}) as Vault;
  current = store; currentDirectory = directory;
  try { await cacheHandle(directory); } catch { vault.warnings.push(tr("无法记住资料库位置，下次打开时请重新选择。")); }
  return vault;
}
export async function startup(): Promise<Vault | null> {
  if (!supported()) return null;
  if (current) return current.list();
  if (!startupTask) startupTask = (async () => {
    if (internal) {
      const library = await activeBrowserLibrary(await database());
      return library ? openInternal(library) : null;
    }
    const directory = await cacheHandle();
    if (!directory || await directory.queryPermission({mode:"readwrite"}) !== "granted") return null;
    return open(directory);
  })().finally(() => { startupTask = null; });
  return startupTask;
}
export async function pickVault(restore = false): Promise<Vault | null> {
  if (!supported()) throw Error(tr(internal ? "无法使用浏览器本地存储，请更新 iOS/iPadOS 并检查网站存储权限。" : "请使用最新版桌面 Chrome 或 Edge，或在设置中安装本地版本。"));
  try {
    if (internal) {
      if (!restore) return await startup() ?? await newInternalLibrary(tr("浏览器资料库"));
      const file=await pickFile(".zip,application/zip,application/x-zip-compressed");
      if(!file)return null;
      if(file.size>archiveLimit)throw Error(tr("浏览器备份最多 64 MiB、10000 项，单文件最多 16 MiB。"));
      const entries=unpackLibrary(new Uint8Array(await file.arrayBuffer()));
      return await newInternalLibrary(tr("{0}（恢复）",file.name.replace(/\.zip$/i,"").slice(0,80)),entries);
    }
    const directory = await host().showDirectoryPicker!({mode:"readwrite",id:restore ? "tistnote-backup" : "tistnote-library"});
    if (!restore) return await open(directory);
    const backup = new WebStore(new BrowserFiles(directory),directory.name);
    const manifest = await backup.files.read(".tistnote/manifest.json");
    if (manifest === null || JSON.parse(manifest).schema !== 1) throw Error(tr("此文件夹不是完整的品记资料库备份"));
    const check = await backup.list();
    if (check.warnings.length) throw Error(check.warnings.join("\n"));
    for (const record of [...check.notes,...check.trash]) await backup.command("versions",{id:record.note.id});
    const parent = await host().showDirectoryPicker!({mode:"readwrite",id:"tistnote-restore-destination"});
    const destination = await cloneDirectory(directory,parent,"Tistnote-restored");
    return open(destination);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}
export async function command<T>(type: string, data: Record<string,unknown> = {}): Promise<T> {
  if (!current) throw Error(tr("请先打开本地资料库"));
  return current.command(type,data) as Promise<T>;
}
async function cloneDirectory(source: Directory, parent: Directory, prefix: string): Promise<Directory> {
  if (await source.resolve(parent) !== null) throw Error(tr("请将备份保存在资料库以外的文件夹"));
  const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g,"-")}-${uid().slice(0,8)}`;
  const destination = await parent.getDirectoryHandle(name,{create:true}) as Directory;
  const copy = async (from: Directory, to: Directory) => {
    for await (const [name, handle] of from.entries()) {
      if (name === "vault.lock" && from.name === ".tistnote") continue;
      if (handle.kind === "directory") await copy(handle as Directory,await to.getDirectoryHandle(name,{create:true}) as Directory);
      else {
        const stream = await (await to.getFileHandle(name,{create:true})).createWritable();
        try { await stream.write(await (handle as FileSystemFileHandle).getFile()); await stream.close(); }
        catch (error) { try { await stream.abort(); } catch {} throw error; }
      }
    }
  };
  try { await copy(source,destination); }
  catch (error) { throw Error(`Copy incomplete. Originals are unchanged; partial backup is in ${name}: ${String(error)}`); }
  return destination;
}
export async function backupVault(): Promise<string | null> {
  if (internal) {
    if(!current||!localLibrary)throw Error(tr("请先打开本地资料库"));
    await current.command("list");
    const name=`Tistnote-backup-${new Date().toISOString().replace(/[:.]/g,"-")}.zip`;
    downloadZip(packLibrary(await new IndexedFiles(await database(),localLibrary.id).entries()),name);
    return name;
  }
  if (!currentDirectory || !current) throw Error(tr("请先打开本地资料库"));
  try {
    const parent = await host().showDirectoryPicker!({mode:"readwrite",id:"tistnote-backup-destination"});
    await current.command("list");
    return (await cloneDirectory(currentDirectory,parent,"Tistnote-backup")).name;
  } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return null; throw error; }
}
export async function importNote(): Promise<RecordNote | null> {
  if (!current) throw Error(tr("请先打开本地资料库"));
  try {
    const file = internal ? await pickFile(".md,text/markdown,text/plain") : await (await host().showOpenFilePicker!({multiple:false,types:[{description:"Tistnote Markdown",accept:{"text/markdown":[".md"]}}]}))[0].getFile();
    if(!file)return null;
    if(internal&&file.size>16*1024*1024)throw Error(tr("浏览器备份最多 64 MiB、10000 项，单文件最多 16 MiB。"));
    const bytes = await file.arrayBuffer();
    const note = (await parseMarkdown(new TextDecoder("utf-8",{fatal:true}).decode(bytes))).note;
    note.id = uid(); note.entries.forEach(e => { e.id = uid(); });
    note.createdAt = note.updatedAt = new Date().toISOString();
    note.lastReviewedAt = null;
    return await current.command("save",{note,expected:null,group:""}) as RecordNote;
  } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return null; throw error; }
}
