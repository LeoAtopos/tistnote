import { assertUniqueTitle, contentKey, groupName, inGroup, uid, validEntries, validTitle, type Note, type RecordNote, type Template, type Vault, type Version } from "./model";
import { noteActivity } from "./activity";
import { markdown, parseMarkdown, revision, validateNote } from "./markdown";
import { readCanvasState, validateCanvasLayout } from "./canvas-layout";

export interface FilePort {
  read(path: string): Promise<string | null>;
  write(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  walk(path: string): Promise<{ files: string[]; directories: string[] }>;
  remove(path: string): Promise<void>;
}
interface Change { path: string; before: string | null; after: string | null }
interface Located extends RecordNote { file: string; raw: string }
const historyDir = (id: string) => `.tistnote/history/${checkedId(id)}`;
const checkedId = (id: string) => {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) throw Error("Invalid record ID");
  return id;
};
const notePath = (trash: boolean, group: string, name: string) => `${trash ? ".tistnote/trash" : "notes"}/${group ? `${group}/` : ""}${name}`;
export class WebStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly files: FilePort, readonly name: string) {}
  async initialize() {
    const raw = await this.files.read(".tistnote/manifest.json");
    if (raw !== null && JSON.parse(raw).schema !== 1) throw Error("Unsupported library version");
    for (const dir of ["notes", ".tistnote", ".tistnote/history", ".tistnote/trash", ".tistnote/templates", ".tistnote/conflicts", ".tistnote/web-journal"])
      await this.files.mkdir(dir);
    if (raw === null) await this.files.write(".tistnote/manifest.json", '{"schema":1}');
    await this.recover();
  }
  private async apply(change: Change, backwards = false) {
    const expected = backwards ? change.after : change.before;
    if (await this.files.read(change.path) !== expected) throw Error(`CONFLICT:File changed externally: ${change.path}`);
    const text = backwards ? change.before : change.after;
    if (text === null) await this.files.remove(change.path);
    else await this.files.write(change.path, text);
  }
  private async recover() {
    for (const path of (await this.files.walk(".tistnote/web-journal")).files) {
      if (!path.endsWith(".json")) continue;
      const changes: Change[] = JSON.parse((await this.files.read(path))!);
      const paths = new Set<string>();
      if (!Array.isArray(changes) || !changes.length) throw Error(`Invalid recovery journal: ${path}`);
      for (const c of changes) {
        if (!c || typeof c.path !== "string" || !/^(notes\/|\.tistnote\/(history|trash|templates|conflicts)\/|\.tistnote\/canvas\.json$)/.test(c.path)
          || paths.has(c.path) || ![c.before,c.after].every(value => value === null || typeof value === "string"))
          throw Error(`Invalid recovery journal: ${path}`);
        groupName(c.path); paths.add(c.path);
      }
      const current = await Promise.all(changes.map(c => this.files.read(c.path)));
      if (!changes.every((c,i) => current[i] === c.after) && !changes.every((c,i) => current[i] === c.before)) {
        if (changes.some((c,i) => current[i] !== c.before && current[i] !== c.after))
          throw Error(`CONFLICT:An interrupted operation conflicts with external updates. Originals are in ${path}. Use a backup or resolve this journal before reopening.`);
        for (const c of [...changes].reverse()) if (await this.files.read(c.path) === c.after) await this.apply(c, true);
      }
      await this.files.remove(path);
    }
  }
  private async transaction(changes: Change[]) {
    changes = changes.filter(c => c.before !== c.after);
    if (!changes.length) return;
    for (const c of changes) if (await this.files.read(c.path) !== c.before) throw Error(`CONFLICT:File changed externally: ${c.path}`);
    const journal = `.tistnote/web-journal/${uid()}.json`;
    await this.files.write(journal, JSON.stringify(changes));
    const done: Change[] = [];
    try {
      for (const c of changes) { await this.apply(c); done.push(c); }
    } catch (error) {
      try {
        for (const c of done.reverse()) await this.apply(c, true);
        await this.files.remove(journal);
      } catch {
        throw Error(`CONFLICT:${String(error)}. Recovery copies remain in ${journal}. Do not edit this library until recovery is complete.`);
      }
      throw error;
    }
    // A completed journal is harmless and can be cleaned on the next open if cleanup fails.
    try { await this.files.remove(journal); } catch { /* All note writes already committed. */ }
  }
  private async load(): Promise<{ vault: Vault; active: Located[]; deleted: Located[]; invalid: boolean }> {
    const vault: Vault = { path: this.name, notes: [], trash: [], templates: [], warnings: [], groups: [] };
    const active: Located[] = [], deleted: Located[] = [], ids = new Set<string>();
    let invalid = false;
    for (const trash of [false,true]) {
      const base = trash ? ".tistnote/trash" : "notes";
      const tree = await this.files.walk(base);
      if (!trash) vault.groups = tree.directories.map(path => path.slice(base.length + 1)).sort();
      for (const file of tree.files.filter(path => path.endsWith(".md"))) {
        try {
          const raw = (await this.files.read(file))!;
          const parsed = await parseMarkdown(raw);
          if (ids.has(parsed.note.id)) throw Error("Duplicate note ID");
          ids.add(parsed.note.id);
          const relative = file.slice(base.length + 1);
          const record: Located = { note: parsed.note, revision: await revision(raw), group: relative.includes("/") ? relative.slice(0, relative.lastIndexOf("/")) : "", file, raw,
            warning: parsed.approximate ? "Some entry IDs are missing. Version comparisons may show additions or removals." : null };
          (trash ? deleted : active).push(record);
          const { file: _, raw: __, ...publicRecord } = record;
          (trash ? vault.trash : vault.notes).push(publicRecord);
        } catch (error) { invalid = true; vault.warnings.push(`${file}: ${String(error)}`); }
      }
    }
    const titles = new Set<string>();
    for (const {note} of active) {
      if (titles.has(note.title.trim())) vault.warnings.push(`Duplicate title: “${note.title}”. Rename the notes. Original files are preserved.`);
      titles.add(note.title.trim());
    }
    for (const path of (await this.files.walk(".tistnote/templates")).files.filter(path => path.endsWith(".json"))) {
      try {
        const template = JSON.parse((await this.files.read(path))!) as Template;
        this.validateTemplate(template);
        vault.templates.push(template);
      } catch (error) { vault.warnings.push(`${path}: ${String(error)}`); }
    }
    return { vault, active, deleted, invalid };
  }
  async list() { return (await this.load()).vault; }
  private validateTemplate(t: Template) {
    checkedId(t.id);
    if (typeof t.title !== "string" || !t.title.trim() || typeof t.description !== "string" || typeof t.hint !== "string"
      || typeof t.ranked !== "boolean" || !Array.isArray(t.tags) || t.tags.some(tag => typeof tag !== "string")
      || !Number.isInteger(t.suggestedCount) || t.suggestedCount < 1) throw Error("Invalid template metadata");
  }
  private async versions(id: string): Promise<Version[]> {
    const versions: Version[] = [];
    for (const file of (await this.files.walk(historyDir(id))).files.filter(path => path.endsWith(".json"))) {
      try {
        const v = JSON.parse((await this.files.read(file))!) as Version;
        checkedId(v.id); validateNote(v.note);
        if (v.note.id !== id || !Number.isFinite(Date.parse(v.at)) || typeof v.kind !== "string" || typeof v.label !== "string") throw Error("Invalid history metadata");
        versions.push(v);
      } catch (error) { throw Error(`History file is damaged; no note was changed: ${file}: ${String(error)}`); }
    }
    return versions.sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  private async snapshotChange(note: Note, kind: string, label = "", forced = false): Promise<Change[]> {
    const old = await this.versions(note.id);
    if (!forced && (old.length ? contentKey(old.at(-1)!.note) === contentKey(note) : !validTitle(note) && !validEntries(note).length)) return [];
    const version: Version = { id: uid(), at: new Date().toISOString(), kind, label: label.trim(), note: structuredClone(note) };
    return [{ path: `${historyDir(note.id)}/${version.id}.json`, before: null, after: JSON.stringify(version,null,2) }];
  }
  command(type: string, data: Record<string, unknown> = {}): Promise<unknown> {
    const operation = this.queue.then(() => this.execute(type,data));
    this.queue = operation.catch(() => {});
    return operation;
  }
  private async execute(type: string, data: Record<string, unknown>): Promise<unknown> {
    await this.recover();
    if (type === "canvas_get" || type === "canvas_put") {
      const path = ".tistnote/canvas.json", raw = await this.files.read(path);
      const current = await readCanvasState(raw);
      if (type === "canvas_get") return current;
      validateCanvasLayout(data.layout);
      if (current.revision !== (data.expected ?? null)) throw Error("画布布局已在外部更新，请刷新画布后重试。");
      const after = JSON.stringify(data.layout, null, 2);
      await this.transaction([{ path, before: raw, after }]);
      return readCanvasState(after);
    }
    const state = await this.load();
    const id = data.id as string;
    if (type === "list") {
      if (data.recover) for (const r of state.active) {
        try { await this.transaction(await this.snapshotChange(r.note,"recovery")); }
        catch (e) { state.vault.warnings.push(String(e)); }
      }
      return state.vault;
    }
    if (type === "versions") return this.versions(id);
    if (type === "activity") {
      const events = [];
      for (const r of [...state.active,...state.deleted]) events.push(...noteActivity(r.note,await this.versions(r.note.id)));
      return events;
    }
    if (state.invalid) throw Error("Unreadable or duplicate note files must be resolved before editing this library.");
    const find = (noteId = id, trash = false) => {
      const r = (trash ? state.deleted : state.active).find(r => r.note.id === noteId);
      if (!r) throw Error("Note not found");
      return r;
    };
    const expected = (r: Located) => { if (r.revision !== data.expected) throw Error("CONFLICT:The note has changed. Refresh it first."); };
    const existsGroup = (group: string) => { if (group && !state.vault.groups.includes(group)) throw Error("Destination group not found. Refresh and try again."); };
    const raw = async (r: Located) => r.raw;
    switch (type) {
      case "save": {
        const note = structuredClone(data.note as Note); validateNote(note);
        const old = state.active.find(r => r.note.id === note.id);
        if (old ? old.revision !== data.expected : data.expected != null) {
          await this.files.write(`.tistnote/conflicts/${note.id}-${uid()}.md`, markdown(note));
          throw Error("CONFLICT:The file changed externally. Your edits are saved separately in .tistnote/conflicts.");
        }
        if (!old && state.deleted.some(r => r.note.id === note.id)) throw Error("Note ID already exists in trash");
        assertUniqueTitle(note,state.vault.notes);
        const group = old?.group ?? String(data.group ?? ""); existsGroup(group);
        note.updatedAt = new Date().toISOString();
        const file = old?.file ?? notePath(false,group,`${note.id}.md`);
        const text = markdown(note);
        const history = await this.versions(note.id);
        const changes = history.length ? [] : await this.snapshotChange(note,"initial");
        await this.transaction([{path:file,before:old ? await raw(old) : null,after:text},...changes]);
        return {note,revision:await revision(text),group};
      }
      case "snapshot": {
        if (!["auto","milestone","external","recovery"].includes(String(data.kind))) throw Error("Unknown version type");
        await this.transaction(await this.snapshotChange(find().note,String(data.kind),String(data.label ?? ""),data.kind === "milestone"));
        return null;
      }
      case "commit_edit": {
        const r = find(); expected(r);
        await this.transaction(await this.snapshotChange(r.note,"edit",String(data.label ?? ""),true)); return null;
      }
      case "review_note": {
        const r = find(); expected(r); const note = structuredClone(r.note);
        note.lastReviewedAt = new Date().toISOString();
        const text = markdown(note);
        await this.transaction([{path:r.file,before:await raw(r),after:text},...await this.snapshotChange(note,"review","",true)]);
        return {note,revision:await revision(text),group:r.group};
      }
      case "cancel_edit": {
        const note = structuredClone(data.note as Note); validateNote(note);
        const r = find(note.id); expected(r); assertUniqueTitle(note,state.vault.notes);
        const group = String(data.group ?? ""); existsGroup(group);
        const file = notePath(false,group,r.file.split("/").at(-1)!); const text = markdown(note);
        await this.transaction(file === r.file ? [{path:file,before:await raw(r),after:text}]
          : [{path:file,before:null,after:text},{path:r.file,before:await raw(r),after:null}]);
        return {note,revision:await revision(text),group};
      }
      case "restore": {
        const r = find(); expected(r);
        const v = (await this.versions(id)).find(v => v.id === data.version);
        if (!v) throw Error("Version not found");
        const note = {...structuredClone(v.note),lastReviewedAt:r.note.lastReviewedAt,updatedAt:new Date().toISOString()};
        assertUniqueTitle(note,state.vault.notes);
        const text = markdown(note);
        const history = [...await this.snapshotChange(r.note,"auto","Before restoring"),...await this.snapshotChange(note,"restore","",true)];
        await this.transaction([{path:r.file,before:await raw(r),after:text},...history]);
        return {note,revision:await revision(text),group:r.group};
      }
      case "move_note": case "trash": {
        const restore = type === "trash" && !!data.restore;
        const r = find(id,restore); expected(r);
        if (type === "trash" && !restore && state.deleted.some(r => r.note.id === id)) throw Error("Note ID already exists in trash");
        if (restore) assertUniqueTitle(r.note,state.vault.notes);
        const group = type === "move_note" ? String(data.group ?? "") : restore && r.group && !state.vault.groups.includes(r.group) ? "" : r.group ?? "";
        if (type === "move_note") existsGroup(group);
        const target = notePath(type === "trash" && !restore,group,r.file.split("/").at(-1)!);
        if (target === r.file) return {note:r.note,revision:r.revision,group};
        const text = await raw(r);
        await this.transaction([{path:target,before:null,after:text},{path:r.file,before:text,after:null},
          ...type === "trash" && !restore ? await this.snapshotChange(r.note,"auto","Before moving to trash") : []]);
        return {note:r.note,revision:r.revision,group};
      }
      case "purge": {
        const r = find(id,true); await this.versions(id);
        const history = (await this.files.walk(historyDir(id))).files;
        const changes = [{path:r.file,before:await raw(r),after:null},...await Promise.all(history.map(async path => ({path,before:await this.files.read(path),after:null})))];
        await this.transaction(changes); return null;
      }
      case "group_create": {
        const name = groupName(String(data.name ?? ""));
        if (state.vault.groups.some(g => g.toLowerCase() === name.toLowerCase())) throw Error("Group name already exists");
        await this.files.mkdir(`notes/${name}`); return null;
      }
      case "group_delete": {
        const name = groupName(String(data.name ?? "")); existsGroup(name);
        if (state.active.some(r => inGroup(r.group,name)) || state.vault.groups.some(g => g.startsWith(`${name}/`))) throw Error("This group is not empty. Move its notes and remove its subgroups first.");
        await this.files.remove(`notes/${name}`); return null;
      }
      case "group_rename": {
        const name = groupName(String(data.name ?? "")), next = groupName(String(data.new_name ?? "")); existsGroup(name);
        if (name === next) return null;
        if (next.toLowerCase().startsWith(`${name.toLowerCase()}/`)) throw Error("A group cannot be moved into itself or one of its children.");
        if (state.vault.groups.some(g => g.toLowerCase() === next.toLowerCase())) throw Error("Group name already exists");
        const parent = next.includes("/") ? next.slice(0,next.lastIndexOf("/")) : ""; existsGroup(parent);
        const base = `notes/${name}`, target = `notes/${next}`, tree = await this.files.walk(base);
        const changes: Change[] = [];
        for (const path of tree.files) {
          const text = await this.files.read(path);
          changes.push({path:target+path.slice(base.length),before:null,after:text},{path,before:text,after:null});
        }
        await this.files.mkdir(target);
        for (const dir of tree.directories) await this.files.mkdir(target+dir.slice(base.length));
        await this.transaction(changes);
        for (const dir of [...tree.directories,base].sort((a,b) => b.length-a.length)) await this.files.remove(dir);
        return null;
      }
      case "template_put": {
        const t = structuredClone(data.template as Template); this.validateTemplate(t);
        const path = `.tistnote/templates/${t.id}.json`;
        const existing = await this.files.read(path);
        if (existing !== null) this.validateTemplate(JSON.parse(existing));
        await this.transaction([{path,before:existing,after:JSON.stringify(t,null,2)}]); return null;
      }
      case "template_delete": {
        const path = `.tistnote/templates/${checkedId(id)}.json`;
        await this.transaction([{path,before:await this.files.read(path),after:null}]); return null;
      }
      default: throw Error("This action requires the Windows desktop app.");
    }
  }
}
