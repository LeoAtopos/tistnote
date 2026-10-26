import { tr } from "./i18n";
import { language } from "./preferences";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { androidRequest, isAndroid } from "./android-bridge";
import { noteActivity } from "./activity";
import { readCanvasState, validateCanvasLayout } from "./canvas-layout";
import { isIOSBrowser } from "./browser-platform";
export type { BrowserLibrary } from "./indexed-files";
import {
  contentKey,
  assertUniqueTitle,
  noteTitle,
  validTitle,
  groupName,
  inGroup,
  uid,
  type Note,
  type RecordNote,
  type Template,
  type Vault,
  type Version,
} from "./model";
export const desktop = isTauri();
export const android = isAndroid;
export const preview =
  !desktop &&
  !android &&
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has("preview");
export const web = !desktop && !android && !preview;
export const browserLocal = web && isIOSBrowser(navigator);
export const localFiles = desktop || android || (web && (browserLocal ? !!window.indexedDB && !!navigator.locks : typeof window.showDirectoryPicker === "function"));
const browserVault = () => import("./browser-vault");
const androidVault = () => import("./android-vault");
export const listBrowserLibraries = async () => (await browserVault()).listInternalLibraries();
export const selectBrowserLibrary = async (id: string) => (await browserVault()).selectInternalLibrary(id);
export const createBrowserLibrary = async (name: string) => (await browserVault()).newInternalLibrary(name);
interface PreviewState {
  vault: Vault;
  history: Record<string, Version[]>;
  canvasRaw?: string;
}
const key = "tistnote-development-preview-v1";
let memory: PreviewState | null = null;
function read(): PreviewState {
  if (memory) return memory;
  const value = localStorage.getItem(key);
  if (value) memory = JSON.parse(value);
  else
    memory = {
      vault: {
        path: "浏览器预览 · 数据仅保存在此浏览器",
        notes: [],
        trash: [],
        templates: [],
        warnings: [],
        groups: [],
      },
      history: {},
    };
  memory!.vault.groups ??= [];
  for (const r of [...memory!.vault.notes, ...memory!.vault.trash])
    r.group ??= "";
  return memory!;
}
function commit() {
  localStorage.setItem(key, JSON.stringify(memory));
}
function snapshot(id: string, kind: string, label = "") {
  const s = read();
  const n = s.vault.notes.find((r) => r.note.id === id)?.note;
  if (!n) return;
  const h = (s.history[id] ??= []);
  if (
    kind !== "milestone" &&
    kind !== "restore" &&
    kind !== "edit" &&
    kind !== "review" &&
    h.length &&
    contentKey(h.at(-1)!.note) === contentKey(n)
  )
    return;
  if (!h.length && !validTitle(n) && !n.entries.length && kind !== "edit" && kind !== "review") return;
  h.push({
    id: uid(),
    at: new Date().toISOString(),
    kind,
    label,
    note: structuredClone(n),
  });
  try {
    commit();
  } catch (e) {
    h.pop();
    throw e;
  }
}
async function mock(
  type: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const s = read();
  const id = data.id as string;
  switch (type) {
    case "canvas_get": return readCanvasState(s.canvasRaw ?? null);
    case "canvas_put": {
      const current = await readCanvasState(s.canvasRaw ?? null);
      validateCanvasLayout(data.layout);
      if (current.revision !== (data.expected ?? null)) throw Error(tr("画布布局已在外部更新，请刷新画布后重试。"));
      const before = s.canvasRaw;
      s.canvasRaw = JSON.stringify(data.layout, null, 2);
      try { commit(); } catch (error) { s.canvasRaw = before; throw error; }
      return readCanvasState(s.canvasRaw);
    }
    case "activity":
      return [...s.vault.notes, ...s.vault.trash].flatMap((r) =>
        noteActivity(r.note, s.history[r.note.id] ?? []),
      );
    case "list":
      if (data.recover)
        s.vault.notes.forEach((r) => snapshot(r.note.id, "recovery"));
      return structuredClone(s.vault);
    case "save": {
      const note = structuredClone(data.note as Note);
      const months = note.reviewIntervalMonths ?? 3;
      if (!Number.isInteger(months) || months < 1 || months > 1200)
        throw Error(tr("回顾周期需为 1 至 1200 个月"));
      const i = s.vault.notes.findIndex((r) => r.note.id === note.id);
      if (i >= 0 && s.vault.notes[i].revision !== data.expected)
        throw Error(tr("CONFLICT:笔记已变化"));
      if (
        i < 0 ||
        noteTitle(s.vault.notes[i].note.title) !== noteTitle(note.title)
      )
        assertUniqueTitle(note, s.vault.notes);
      if (!note.title.trim()) note.title = tr("未命名笔记");
      const group =
        i >= 0 ? (s.vault.notes[i].group ?? "") : String(data.group ?? "");
      if (group && !s.vault.groups.includes(group))
        throw Error(tr("目标分组不存在，请刷新后重试"));
      note.updatedAt = new Date().toISOString();
      const r = { note, revision: uid(), group };
      if (i < 0) s.vault.notes.push(r);
      else s.vault.notes[i] = r;
      commit();
      if (!s.history[note.id]?.length) snapshot(note.id, "initial");
      return structuredClone(r);
    }
    case "snapshot":
      snapshot(id, data.kind as string, data.label as string);
      return null;
    case "commit_edit": {
      const label = String(data.label ?? "").trim();
      const record = s.vault.notes.find((r) => r.note.id === id);
      if (!record) throw Error(tr("笔记不存在"));
      if (record.revision !== data.expected)
        throw Error(tr("CONFLICT:提交前检测到外部修改，请先处理冲突"));
      snapshot(id, "edit", label);
      return null;
    }
    case "cancel_edit": {
      const baseline = structuredClone(data.note as Note);
      const index = s.vault.notes.findIndex((r) => r.note.id === baseline.id);
      if (index < 0) throw Error(tr("笔记不存在"));
      const current = s.vault.notes[index];
      if (current.revision !== data.expected)
        throw Error(tr("CONFLICT:取消编辑前检测到外部修改，请先处理冲突"));
      assertUniqueTitle(baseline, s.vault.notes);
      const group = String(data.group ?? "");
      if (group && !s.vault.groups.includes(group)) throw Error(tr("原分组不存在，请先恢复分组或继续编辑"));
      const record = { note: baseline, revision: uid(), group };
      s.vault.notes[index] = record;
      try {
        commit();
      } catch (e) {
        s.vault.notes[index] = current;
        throw e;
      }
      return structuredClone(record);
    }
    case "review_note": {
      const index = s.vault.notes.findIndex((r) => r.note.id === id);
      if (index < 0) throw Error(tr("笔记不存在"));
      const original = s.vault.notes[index];
      if (original.revision !== data.expected)
        throw Error(tr("CONFLICT:回顾确认前检测到外部修改，请先刷新笔记"));
      const record = structuredClone(original);
      record.note.lastReviewedAt = new Date().toISOString();
      record.revision = uid();
      s.vault.notes[index] = record;
      try {
        snapshot(id, "review");
      } catch (e) {
        s.vault.notes[index] = original;
        throw e;
      }
      return structuredClone(record);
    }
    case "versions":
      return structuredClone(s.history[id] ?? []);
    case "restore": {
      const v = s.history[id].find((v) => v.id === data.version)!;
      assertUniqueTitle(v.note, s.vault.notes);
      snapshot(id, "auto");
      const restored = {
        ...v.note,
        lastReviewedAt: s.vault.notes.find((r) => r.note.id === id)?.note.lastReviewedAt,
      };
      const r = await mock("save", { note: restored, expected: data.expected });
      snapshot(id, "restore", tr("恢复历史版本"));
      return r;
    }
    case "trash": {
      const from = data.restore ? s.vault.trash : s.vault.notes;
      const to = data.restore ? s.vault.notes : s.vault.trash;
      const i = from.findIndex((r) => r.note.id === id);
      if (i < 0) throw Error(tr("笔记不存在"));
      if (data.restore) assertUniqueTitle(from[i].note, s.vault.notes);
      if (
        data.restore &&
        from[i].group &&
        !s.vault.groups.includes(from[i].group!)
      )
        from[i].group = "";
      if (!data.restore) snapshot(id, "auto");
      to.push(from.splice(i, 1)[0]);
      commit();
      return null;
    }
    case "purge":
      s.vault.trash = s.vault.trash.filter((r) => r.note.id !== id);
      delete s.history[id];
      commit();
      return null;
    case "group_create": {
      const name = groupName(String(data.name ?? ""));
      if (s.vault.groups.some((g) => g.toLowerCase() === name.toLowerCase()))
        throw Error(tr("分组名称已存在"));
      let parent = "";
      for (const part of name.split("/")) {
        const next = parent ? `${parent}/${part}` : part;
        const existing = s.vault.groups.find(
          (g) => g.toLowerCase() === next.toLowerCase(),
        );
        parent = existing ?? next;
        if (!existing) s.vault.groups.push(parent);
      }
      s.vault.groups.sort((a, b) => a.localeCompare(b, "zh-CN"));
      commit();
      return null;
    }
    case "group_rename": {
      const name = groupName(String(data.name ?? ""));
      let next = groupName(String(data.new_name ?? ""));
      if (!s.vault.groups.includes(name))
        throw Error(tr("分组不存在，请刷新后重试"));
      if (name === next) return null;
      if (next.toLowerCase().startsWith(`${name.toLowerCase()}/`))
        throw Error(tr("不能把分组移动到它自己的子分组中"));
      if (s.vault.groups.some((g) => g.toLowerCase() === next.toLowerCase()))
        throw Error(tr("分组名称已存在"));
      const parent = next.includes("/")
        ? next.slice(0, next.lastIndexOf("/"))
        : "";
      if (parent) {
        const actual = s.vault.groups.find(
          (g) => g.toLowerCase() === parent.toLowerCase(),
        );
        if (!actual) throw Error(tr("请先创建目标的父分组"));
        next = actual + next.slice(parent.length);
      }
      s.vault.groups = s.vault.groups.map((g) =>
        inGroup(g, name) ? next + g.slice(name.length) : g,
      );
      for (const r of s.vault.notes)
        if (inGroup(r.group, name))
          r.group = next + r.group!.slice(name.length);
      commit();
      return null;
    }
    case "group_delete": {
      const name = groupName(String(data.name ?? ""));
      if (!s.vault.groups.includes(name))
        throw Error(tr("分组不存在，请刷新后重试"));
      if (
        s.vault.notes.some((r) => inGroup(r.group, name)) ||
        s.vault.groups.some((g) => g.startsWith(`${name}/`))
      )
        throw Error(tr("分组不是空的，请先移出笔记并删除子分组。"));
      s.vault.groups = s.vault.groups.filter((g) => g !== name);
      commit();
      return null;
    }
    case "move_note": {
      const r = s.vault.notes.find((r) => r.note.id === id);
      if (!r) throw Error(tr("笔记不存在"));
      if (r.revision !== data.expected)
        throw Error(tr("CONFLICT:笔记已变化，请先刷新后再移动"));
      assertUniqueTitle(r.note, s.vault.notes);
      const group = String(data.group ?? "");
      if (group && !s.vault.groups.includes(group))
        throw Error(tr("目标分组不存在，请刷新后重试"));
      r.group = group;
      commit();
      return structuredClone(r);
    }
    case "template_put": {
      const t = data.template as Template;
      s.vault.templates = [
        ...s.vault.templates.filter((x) => x.id !== t.id),
        t,
      ];
      commit();
      return null;
    }
    case "template_delete":
      s.vault.templates = s.vault.templates.filter((x) => x.id !== id);
      commit();
      return null;
    default:
      throw Error(tr("此操作需要 Windows 桌面版"));
  }
}
export async function command<T>(
  type: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  if (desktop)
    return invoke<T>("vault_command", { request: { type, ...data } });
  if (android) return (await androidVault()).command<T>(type,data);
  if (preview) return mock(type, data) as Promise<T>;
  if (web) return (await browserVault()).command<T>(type,data);
  throw Error(tr("请使用品记 Windows 桌面版打开本地资料库。"));
}
export async function startup(): Promise<Vault | null> {
  if (desktop) return invoke("startup");
  if (android) return (await androidVault()).startup();
  if (preview && localStorage.getItem(key))
    return command("list", { recover: true });
  if (web) return (await browserVault()).startup();
  return null;
}
export async function pickVault(restore = false): Promise<Vault | null> {
  if (desktop) return invoke("pick_vault", { restore, language: language() });
  if (android) return (await androidVault()).pickVault(restore);
  if (preview) {
    read();
    commit();
    return structuredClone(read().vault);
  }
  if (web) return (await browserVault()).pickVault(restore);
  throw Error(tr("请使用 Windows 桌面版选择资料库。"));
}
export const backupVault = async () => desktop ? invoke<string | null>("backup_vault", { language: language() }) : android ? (await androidVault()).backupVault() : (await browserVault()).backupVault();
export const importNote = async () => desktop ? invoke<RecordNote | null>("import_note", { language: language() }) : android ? (await androidVault()).importNote() : (await browserVault()).importNote();
export async function exportPngs(pages: string[]): Promise<string | null> {
  if (desktop) return invoke("export_pngs", { pages, language: language() });
  if (android) return androidRequest<string | null>("exportImages", { pages });
  for (let i = 0; i < pages.length; i++) {
    const a = document.createElement("a");
    a.href = pages[i];
    a.download = tr("品记-{0}.png", String(i + 1).padStart(3, "0"));
    a.click();
  }
  return tr("浏览器下载目录");
}
export async function copyPng(data: string) {
  if (desktop) return invoke("copy_png", { data });
  if (android) return androidRequest<void>("copyImage", { data });
  const blob = await (await fetch(data)).blob();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
