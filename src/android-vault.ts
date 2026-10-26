import { androidRequest } from "./android-bridge";
import { tr } from "./i18n";
import { uid, type RecordNote, type Vault } from "./model";
import { parseMarkdown } from "./markdown";
import { WebStore, type FilePort } from "./web-store";

interface Library { id: string; name: string }
class AndroidFiles implements FilePort {
  constructor(readonly vault: string) {}
  read(path: string) { return androidRequest<string | null>("read", { vault: this.vault, path }); }
  write(path: string, text: string) { return androidRequest<void>("write", { vault: this.vault, path, text }); }
  mkdir(path: string) { return androidRequest<void>("mkdir", { vault: this.vault, path }); }
  remove(path: string) { return androidRequest<void>("remove", { vault: this.vault, path }); }
  walk(path: string) { return androidRequest<{ files: string[]; directories: string[] }>("walk", { vault: this.vault, path }); }
}
let current: { store: WebStore; library: Library } | null = null;
let starting: Promise<Vault | null> | null = null;
async function open(library: Library, restored = false): Promise<Vault> {
  const files = new AndroidFiles(library.id);
  if (restored && await files.read(".tistnote/manifest.json") === null) throw Error(tr("此文件夹不是完整的品记资料库备份"));
  const store = new WebStore(files, library.name);
  await store.initialize();
  const vault = await store.command("list", { recover: true }) as Vault;
  if (restored) {
    if (vault.warnings.length) throw Error(vault.warnings.join("\n"));
    for (const record of [...vault.notes, ...vault.trash]) await store.command("versions", { id: record.note.id });
  }
  await androidRequest("remember", { vault: library.id });
  current = { store, library };
  return vault;
}
export async function startup(): Promise<Vault | null> {
  if (current) return current.store.list();
  if (!starting) starting = androidRequest<Library | null>("startup").then(library => library ? open(library) : null).finally(() => { starting = null; });
  return starting;
}
export async function pickVault(restore = false): Promise<Vault | null> {
  const library = await androidRequest<Library | null>(restore ? "restore" : "pickLibrary");
  return library ? open(library, restore) : null;
}
export async function command<T>(type: string, data: Record<string, unknown> = {}): Promise<T> {
  if (!current) throw Error(tr("请先打开本地资料库"));
  return current.store.command(type, data) as Promise<T>;
}
export async function backupVault(): Promise<string | null> {
  if (!current) throw Error(tr("请先打开本地资料库"));
  await current.store.command("list");
  return androidRequest("backup", { vault: current.library.id });
}
export async function importNote(): Promise<RecordNote | null> {
  if (!current) throw Error(tr("请先打开本地资料库"));
  const text = await androidRequest<string | null>("import");
  if (text === null) return null;
  const note = (await parseMarkdown(text)).note;
  note.id = uid(); note.entries.forEach(entry => { entry.id = uid(); });
  note.createdAt = note.updatedAt = new Date().toISOString(); note.lastReviewedAt = null;
  return current.store.command("save", { note, expected: null, group: "" }) as Promise<RecordNote>;
}
