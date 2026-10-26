import { tr, formatCount } from "./i18n";
import { language } from "./preferences";
export interface Entry {
  id: string;
  name: string;
  reason: string;
}
export interface Note {
  id: string;
  title: string;
  description: string;
  tags: string[];
  ranked: boolean;
  entries: Entry[];
  createdAt: string;
  updatedAt: string;
  reviewIntervalMonths?: number;
  reviewTestMinute?: boolean;
  lastReviewedAt?: string | null;
  source?: string | null;
}
export interface Template {
  id: string;
  title: string;
  description: string;
  tags: string[];
  ranked: boolean;
  hint: string;
  suggestedCount: number;
  builtin?: boolean;
}
export interface RecordNote {
  note: Note;
  revision: string;
  warning?: string | null;
  group?: string;
}
export interface Version {
  id: string;
  at: string;
  kind: string;
  label: string;
  note: Note;
}
export interface ActivityEvent {
  noteId: string;
  title: string;
  at: string;
  kind: "created" | "modified" | "reviewed";
}
export interface Vault {
  path: string;
  notes: RecordNote[];
  trash: RecordNote[];
  templates: Template[];
  warnings: string[];
  groups: string[];
}
export const uid = () => crypto.randomUUID();
export const cleanTags = (s: string | string[]) => [
  ...new Set(
    (Array.isArray(s) ? s : s.split(/[,，、\n]/))
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];
export const newNote = (t?: Template, records: RecordNote[] = []): Note => {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: copyTitle(t?.title ?? tr("未命名笔记"), records, 1),
    description: t?.description ?? "",
    tags: [...(t?.tags ?? [])],
    ranked: t?.ranked ?? true,
    entries: [],
    createdAt: now,
    updatedAt: now,
    reviewIntervalMonths: 3,
    lastReviewedAt: null,
    source: t?.id,
  };
};
export const contentKey = (n: Note) =>
  JSON.stringify([
    n.title, n.description, n.tags, n.ranked, n.entries,
    n.reviewIntervalMonths ?? 3,
    n.reviewTestMinute ?? false,
  ]);
export function reviewDueAt(note: Note): Date | null {
  const months = note.reviewIntervalMonths ?? 3;
  if (!Number.isInteger(months) || months < 1 || months > 1200) return null;
  const times = [note.createdAt, note.updatedAt, note.lastReviewedAt]
    .filter((value): value is string => !!value)
    .map(Date.parse)
    .filter(Number.isFinite);
  if (!times.length) return null;
  if (note.reviewTestMinute) return new Date(Math.max(...times) + 60_000);
  const due = new Date(Math.max(...times));
  const day = due.getDate();
  due.setDate(1);
  due.setMonth(due.getMonth() + months);
  const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
  due.setDate(Math.min(day, lastDay));
  return due;
}
export const needsReview = (note: Note, now = Date.now()) => {
  const due = reviewDueAt(note);
  return !!due && due.getTime() <= now;
};
export function reviewTimeLabel(at: number, now: number, overdue = false): string {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return tr("日期未知");
  const elapsed = now - at;
  const distance = Math.abs(elapsed);
  if (language() === "en") {
    if (distance < 1000) return overdue ? "Due now" : elapsed >= 0 ? "Just now" : "Due soon";
    if (!overdue && elapsed >= 0 && distance < 60_000) return "Just now";
    const units: [number, Intl.RelativeTimeFormatUnit][] = [
      [365 * 86_400_000, "year"], [30 * 86_400_000, "month"], [86_400_000, "day"],
      [3_600_000, "hour"], [60_000, "minute"], [1000, "second"],
    ];
    const [size, unit] = units.find(([size]) => distance >= size)!;
    const amount = unit === "month" ? Math.round(distance / size) : Math.floor(distance / size);
    return overdue ? `Overdue by ${amount} ${unit}${amount === 1 ? "" : "s"}`
      : new Intl.RelativeTimeFormat("en", { numeric: "always", style: "short" }).format(elapsed >= 0 ? -amount : amount, unit);
  }
  if (distance < 1000) return overdue ? tr("刚到期") : elapsed >= 0 ? tr("刚刚") : tr("即将到期");
  if (!overdue && elapsed >= 0 && distance < 60_000) return tr("刚刚");
  const units: [number, string][] = [
    [365 * 86_400_000, tr("年")], [30 * 86_400_000, tr("个月")],
    [86_400_000, tr("天")], [3_600_000, tr("小时")], [60_000, tr("分钟")], [1000, tr("秒")],
  ];
  const [size, unit] = units.find(([size]) => distance >= size)!;
  const amount = unit === tr("个月") ? Math.round(distance / size) : Math.floor(distance / size);
  const duration = `${amount}${unit}`;
  return overdue ? tr("已过{0}", duration) : `${duration}${elapsed >= 0 ? tr("前") : tr("后")}`;
}
export const validTitle = (n: Note) =>
  !!n.title.trim() && !/^(?:未命名笔记|Untitled note)(?:（[1-9]\d*）| \([1-9]\d*\))?$/.test(n.title.trim());
export const validEntries = (n: Note) => n.entries.filter((e) => e.name.trim());
export const noteTitle = (title: string) => title.trim() || tr("未命名笔记");
export function groupName(value: string) {
  const name = value.trim();
  if (!name) throw Error(tr("请填写分组名称"));
  if (
    name
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.length > 255 ||
          part !== part.trim() ||
          part.endsWith(".") ||
          /[\\<>:"|?*\p{Cc}]/u.test(part) ||
          /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(part),
      )
  )
    throw Error(
      tr("分组名称不能包含路径跳转、Windows 保留名称或非法字符；子分组请用 / 分隔。"),
    );
  return name;
}
export const inGroup = (group: string | undefined, parent: string) =>
  (group ?? "") === parent ||
  (!!parent && (group ?? "").startsWith(`${parent}/`));
export type TreeItem = { type: "note" | "group"; id: string };
export function groupMovePath(source: string, parent: string) {
  groupName(source);
  if (parent) groupName(parent);
  if (inGroup(parent.toLowerCase(), source.toLowerCase()))
    throw Error(tr("不能把文件夹移到自身或子文件夹中"));
  return parent
    ? `${parent}/${source.split("/").at(-1)}`
    : source.split("/").at(-1)!;
}
export interface NoteFolder {
  path: string;
  name: string;
  folders: NoteFolder[];
  notes: RecordNote[];
}
export function noteTree(
  groups: string[],
  records: RecordNote[],
  filtered = false,
): NoteFolder {
  const root: NoteFolder = { path: "", name: "", folders: [], notes: [] };
  const folders = new Map<string, NoteFolder>([["", root]]);
  function folder(path: string): NoteFolder {
    const existing = folders.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf("/");
    const parent = folder(slash < 0 ? "" : path.slice(0, slash));
    const next: NoteFolder = {
      path,
      name: path.slice(slash + 1),
      folders: [],
      notes: [],
    };
    parent.folders.push(next);
    folders.set(path, next);
    return next;
  }
  groups.forEach(folder);
  records.forEach((r) => folder(r.group ?? "").notes.push(r));
  function arrange(node: NoteFolder): boolean {
    node.folders = node.folders.filter((child) => arrange(child) || !filtered);
    node.folders.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    return !!(node.notes.length || node.folders.length);
  }
  arrange(root);
  return root;
}
export function assertUniqueTitle(n: Note, records: RecordNote[]) {
  const title = noteTitle(n.title);
  if (
    records.some((r) => r.note.id !== n.id && noteTitle(r.note.title) === title)
  )
    throw Error(
      tr("DUPLICATE_TITLE:已存在标题为“{0}”的笔记，请使用其他标题。", title),
    );
}
export function copyTitle(
  base: string,
  records: RecordNote[],
  firstNumber = 2,
) {
  base = noteTitle(base);
  const titles = new Set(records.map((r) => noteTitle(r.note.title)));
  let title = base;
  for (let i = firstNumber; titles.has(title); i++) title = language() === "en" ? `${base} (${i})` : `${base}（${i}）`;
  return title;
}
export const matches = (
  n: {
    title: string;
    description: string;
    tags: string[];
    entries?: Entry[];
    hint?: string;
  },
  query: string,
  tags: string[],
) =>
  (!tags.length || tags.some((t) => n.tags.includes(t))) &&
  [
    n.title,
    n.description,
    n.hint ?? "",
    ...n.tags,
    ...(n.entries ?? []).flatMap((e) => [e.name, e.reason]),
  ]
    .join("\n")
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
export function notesByTemplate(templates: Template[], records: RecordNote[]) {
  const populated = records
    .filter(({ note }) => validTitle(note) && validEntries(note).length)
    .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));
  const linked = new Map<string, RecordNote>();
  for (const template of templates) {
    const record = populated.find(
      ({ note }) =>
        note.source === template.id ||
        noteTitle(note.title) === noteTitle(template.title) ||
        (template.builtin && tr(noteTitle(note.title)) === tr(noteTitle(template.title))),
    );
    if (record) linked.set(template.id, record);
  }
  return linked;
}
export function coveredTemplates(templates: Template[], records: RecordNote[]) {
  return new Set(notesByTemplate(templates, records).keys());
}
export function asTemplate(n: Note): Template {
  return {
    id: uid(),
    title: n.title,
    description: n.description,
    tags: [...n.tags],
    ranked: n.ranked,
    hint: "",
    suggestedCount: validEntries(n).length || 5,
  };
}
export function diffNotes(a: Note, b: Note): string[] {
  const changes: string[] = [];
  if (a.title !== b.title) changes.push(tr("主题：{0} → {1}", a.title, b.title));
  if (a.description !== b.description)
    changes.push(
      tr("说明：{0} → {1}", a.description || tr("（空）"), b.description || tr("（空）")),
    );
  if (JSON.stringify(a.tags) !== JSON.stringify(b.tags))
    changes.push(
      tr("标签：{0} → {1}", a.tags.join("、") || tr("无"), b.tags.join("、") || tr("无")),
    );
  if (a.ranked !== b.ranked)
    changes.push(tr("列表模式：{0}", b.ranked ? tr("有排名") : tr("无排名")));
  if ((a.reviewIntervalMonths ?? 3) !== (b.reviewIntervalMonths ?? 3)
    || !!a.reviewTestMinute !== !!b.reviewTestMinute) {
    const cycle = (n: Note) => n.reviewTestMinute ? tr("1 分钟（测试）")
      : language() === "zh" ? tr("{0} 个月", n.reviewIntervalMonths ?? 3) : formatCount(n.reviewIntervalMonths ?? 3, "months");
    changes.push(tr("回顾周期：{0} → {1}", cycle(a), cycle(b)));
  }
  const before = new Map(a.entries.map((e, i) => [e.id, { e, i }]));
  const after = new Map(b.entries.map((e, i) => [e.id, { e, i }]));
  a.entries.forEach((e) => {
    if (!after.has(e.id)) changes.push(tr("移除：{0}", e.name || tr("空白条目")));
  });
  b.entries.forEach((e, i) => {
    const old = before.get(e.id);
    if (!old) {
      changes.push(tr("新增：{0}", e.name || tr("空白条目")));
      return;
    }
    if (old.e.name !== e.name) changes.push(tr("改名：{0} → {1}", old.e.name, e.name));
    if (old.e.reason !== e.reason)
      changes.push(
        tr("「{0}」理由：{1} → {2}", e.name, old.e.reason || tr("（空）"), e.reason || tr("（空）")),
      );
    if (old.i !== i)
      changes.push(
        tr("「{0}」{1}：{2} → {3}", e.name, b.ranked ? tr("排名") : tr("位置"), old.i + 1, i + 1),
      );
  });
  return changes;
}
export function randomTemplate(
  list: Template[],
  previous?: string,
  random = Math.random,
): Template | undefined {
  const pool = list.length > 1 ? list.filter((t) => t.id !== previous) : list;
  return pool[Math.floor(random() * pool.length)];
}
