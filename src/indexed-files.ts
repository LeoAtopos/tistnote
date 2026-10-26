import { groupName, uid } from "./model";
import { tr } from "./i18n";
import type { FilePort } from "./web-store";

export interface BrowserLibrary { id: string; name: string; createdAt: string }
interface Row { library: string; path: string; data: Uint8Array | null }
export type LibraryEntries = Map<string, Uint8Array | null>;
const checked = (path: string) => { if (groupName(path) !== path) throw Error(tr("资料库路径无效")); return path; };
function storageError(error: DOMException | null) {
  return Error(tr(error?.name === "QuotaExceededError" ? "浏览器存储空间不足，未能保存。请释放空间，并及时导出备份。" : "无法读写浏览器本地资料库，请检查存储权限；已有数据不会被重置。"));
}
function transaction<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, job: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(storageError(tx.error));
    tx.onerror = () => {};
    try { const request = job(tx); if (request) request.onsuccess = () => { result = request.result; }; }
    catch (error) { tx.abort(); reject(error instanceof DOMException ? storageError(error) : error); }
  });
}
export async function openBrowserDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("tistnote-browser-libraries-v1", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("files", { keyPath: ["library", "path"] });
      request.result.createObjectStore("libraries", { keyPath: "id" });
      request.result.createObjectStore("settings");
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => reject(Error(tr("请关闭其他品记网页后重试，资料库未被修改。")));
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}
export async function browserLibraries(db: IDBDatabase): Promise<BrowserLibrary[]> {
  return (await transaction<BrowserLibrary[]>(db, ["libraries"], "readonly", tx => tx.objectStore("libraries").getAll())).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
}
export async function activeBrowserLibrary(db: IDBDatabase): Promise<BrowserLibrary | null> {
  const id = await transaction<string | undefined>(db, ["settings"], "readonly", tx => tx.objectStore("settings").get("active"));
  if (!id) return null;
  const library = await transaction<BrowserLibrary | undefined>(db, ["libraries"], "readonly", tx => tx.objectStore("libraries").get(id));
  if (!library) throw Error(tr("浏览器资料库记录无法读取，已有数据已保留。"));
  return library;
}
export async function rememberBrowserLibrary(db: IDBDatabase, library: BrowserLibrary) {
  await transaction(db, ["settings"], "readwrite", tx => tx.objectStore("settings").put(library.id, "active"));
}
export async function createBrowserLibrary(db: IDBDatabase, name: string, entries: LibraryEntries = new Map()): Promise<BrowserLibrary> {
  name = name.trim();
  if (!name || name.length > 100) throw Error(tr("资料库名称需为 1–100 个字符"));
  for (const path of entries.keys()) checked(path.endsWith("/") ? path.slice(0,-1) : path);
  const library = { id: uid(), name, createdAt: new Date().toISOString() };
  await transaction(db, ["libraries", "files"], "readwrite", tx => {
    tx.objectStore("libraries").add(library);
    for (const [path, data] of entries) tx.objectStore("files").add({ library: library.id, path, data });
  });
  return library;
}
export class IndexedFiles implements FilePort {
  constructor(readonly db: IDBDatabase, readonly library: string) {}
  private range() { return IDBKeyRange.bound([this.library, ""], [this.library, "\uffff"]); }
  private row(path: string) { return transaction<Row | undefined>(this.db, ["files"], "readonly", tx => tx.objectStore("files").get([this.library, path])); }
  private async keys() { return (await transaction<IDBValidKey[]>(this.db, ["files"], "readonly", tx => tx.objectStore("files").getAllKeys(this.range()))).map(key => (key as string[])[1]); }
  async read(path: string): Promise<string | null> {
    const row = await this.row(checked(path));
    if (!row) return null;
    if (row.data === null) throw Error(tr("资料库路径无效"));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(row.data);
  }
  async mkdir(path: string) {
    const parts = checked(path).split("/"), paths = parts.map((_,i) => parts.slice(0,i+1).join("/"));
    for (const part of paths) if (await this.row(part)) throw Error(tr("资料库路径已被文件占用"));
    await transaction(this.db, ["files"], "readwrite", tx => { for (const path of paths) tx.objectStore("files").put({library:this.library,path:path+"/",data:null}); });
  }
  async write(path: string, text: string) {
    checked(path);
    if (await this.row(path+"/")) throw Error(tr("资料库路径已被分组占用"));
    const slash = path.lastIndexOf("/"); if (slash >= 0) await this.mkdir(path.slice(0,slash));
    await transaction(this.db, ["files"], "readwrite", tx => tx.objectStore("files").put({library:this.library,path,data:new TextEncoder().encode(text)}));
  }
  async walk(path: string) {
    const prefix = checked(path)+"/", keys = (await this.keys()).filter(key => key.startsWith(prefix) && key !== prefix);
    return { files: keys.filter(key => !key.endsWith("/")).sort(), directories: keys.filter(key => key.endsWith("/")).map(key => key.slice(0,-1)).sort() };
  }
  async remove(path: string) {
    checked(path);
    const keys = await this.keys();
    if (keys.some(key => key.startsWith(path+"/") && key !== path+"/")) throw Error(tr("分组不是空的，无法删除"));
    await transaction(this.db, ["files"], "readwrite", tx => { tx.objectStore("files").delete([this.library,path]); tx.objectStore("files").delete([this.library,path+"/"]); });
  }
  async entries(): Promise<LibraryEntries> {
    const rows = await transaction<Row[]>(this.db, ["files"], "readonly", tx => tx.objectStore("files").getAll(this.range()));
    return new Map(rows.map(row => [row.path, row.data]));
  }
  async discard() {
    const keys = await this.keys();
    await transaction(this.db, ["libraries", "files"], "readwrite", tx => {
      for (const path of keys) tx.objectStore("files").delete([this.library,path]);
      tx.objectStore("libraries").delete(this.library);
    });
  }
}
