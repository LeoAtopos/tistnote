import { tr, formatCount } from "./i18n";
import { language, theme, setPreferences, usePreferences } from "./preferences";
import { androidRequest } from "./android-bridge";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "./api";
import {
  asTemplate,
  cleanTags,
  contentKey,
  copyTitle,
  notesByTemplate,
  groupName,
  groupMovePath,
  inGroup,
  matches,
  newNote,
  needsReview,
  randomTemplate,
  uid,
  validEntries,
  validTitle,
  type Note,
  type RecordNote,
  type Template,
  type Vault,
  type Version,
  type TreeItem,
  type ActivityEvent,
} from "./model";
import { localizedBuiltinTemplates } from "./templates";
import { NoteTree } from "./NoteTree";
import { ActivityPage } from "./ActivityPage";
import { TemplateCanvas } from "./TemplateCanvas";
import { NoteCanvas } from "./NoteCanvas";
import { canvasKeys, emptyCanvasLayout, remapCanvasGroup, reorderCanvas, translateCanvas, type CanvasArrangement, type CanvasState, type NoteGraph } from "./canvas-layout";
import { Introduction, introductionSeenKey } from "./Introduction";
import {
  AutoTextarea,
  dateTime,
  emptyTemplate,
  History,
  Icon,
  Modal,
  NoteReader,
  ShareDialog,
  TemplateEditor,
} from "./components";

type View = "notes" | "templates" | "activity" | "trash";
const browserTipDismissedKey = "tistnote-browser-tip-dismissed-v1";
type Dialog =
  | "settings"
  | "share"
  | "invite"
  | "history"
  | "commit"
  | "milestone"
  | "help"
  | "groups"
  | "new-folder"
  | "install"
  | null;
export default function App() {
  const preferences = usePreferences();
  const [browserTipVisible, setBrowserTipVisible] = useState(() => {
    try { return localStorage.getItem(browserTipDismissedKey) !== "1"; }
    catch { return true; }
  });
  function dismissBrowserTip() {
    setBrowserTipVisible(false);
    try { localStorage.setItem(browserTipDismissedKey, "1"); }
    catch { /* Keep the tip dismissed for this visit if storage is unavailable. */ }
  }
  const uiLanguage = language();
  const [preferenceError, setPreferenceError] = useState("");
  const resolvedTheme = theme();
  useEffect(() => {
    if (api.android) void androidRequest("theme", { dark: resolvedTheme === "dark" }).catch(error => setPreferenceError(String(error)));
  }, [resolvedTheme]);
  useEffect(() => {
    if (!api.desktop) return;
    const window = getCurrentWindow();
    void Promise.all([
      window.setTheme(preferences.theme === "system" ? null : preferences.theme),
      window.setTitle(uiLanguage === "zh" ? "品记 tistnote" : "Tistnote"),
    ]).catch(error => setPreferenceError(String(error)));
  }, [preferences.theme, uiLanguage]);
  const [vault, setVault] = useState<Vault | null>(null),
    [note, setNote] = useState<Note | null>(null),
    [view, setView] = useState<View>("notes");
  const [query, setQuery] = useState(""),
    [group, setGroup] = useState<string | null>(null),
    [groupInput, setGroupInput] = useState(""),
    [editingGroup, setEditingGroup] = useState<string | null>(null),
    [groupError, setGroupError] = useState(""),
    [filter, setFilter] = useState<string[]>([]),
    [sort, setSort] = useState("updated"),
    [dialog, setDialog] = useState<Dialog>(null);
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false);
  const [template, setTemplate] = useState<Template | null>(null),
    [picked, setPicked] = useState<Template | null>(null),
    [versions, setVersions] = useState<Version[]>([]),
    [milestone, setMilestone] = useState("");
  const [changeLog, setChangeLog] = useState(""),
    [changeLogError, setChangeLogError] = useState("");
  const [introductionOpen, setIntroductionOpen] = useState(false);
  const [templateView, setTemplateView] = useState<"canvas" | "cards">("canvas");
  const [noteView, setNoteView] = useState<"list" | "canvas">("list");
  const [canvasState, setCanvasState] = useState<CanvasState>({ layout: emptyCanvasLayout(), revision: null });
  const [canvasSession, setCanvasSession] = useState(0);
  const [canvasReady, setCanvasReady] = useState(false);
  useEffect(() => {
    if (!canvasSession) return;
    let cancelled = false;
    setCanvasReady(false);
    api.command<CanvasState>("canvas_get").then(state => { if (!cancelled) { setCanvasState(state); setCanvasReady(true); } })
      .catch(error => { if (!cancelled) setError(tr(String(error).replace(/^Error: /, ""))); });
    return () => { cancelled = true; };
  }, [canvasSession]);
  const [templateTools, setTemplateTools] = useState(false);
  const introductionSeen = useRef(false);
  function introduceIfNeeded() {
    if (introductionSeen.current) return;
    introductionSeen.current = true;
    try {
      if (localStorage.getItem(introductionSeenKey) === "1") return;
    } catch { /* The introduction still works when preferences cannot be read. */ }
    setIntroductionOpen(true);
  }
  function closeIntroduction() {
    setIntroductionOpen(false);
    introductionSeen.current = true;
    try { localStorage.setItem(introductionSeenKey, "1"); }
    catch { setError(tr("无法保存介绍阅读状态，下次启动可能再次显示介绍。")); }
  }
  const [more, setMore] = useState(false),
    [tradeOpen, setTradeOpen] = useState(false),
    [editing, setEditing] = useState(false),
    [compact, setCompact] = useState(true),
    [duplicateTitle, setDuplicateTitle] = useState(""),
    [listVisible, setListVisible] = useState(true),
    [tagText, setTagText] = useState(""),
    [revisionTick, setRevisionTick] = useState(0);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [reviewNow, setReviewNow] = useState(Date.now());
  const minuteReviewEnabled = vault?.notes.some((r) => r.note.reviewTestMinute) ?? false;
  useEffect(() => {
    const timer = setInterval(() => setReviewNow(Date.now()), minuteReviewEnabled ? 1000 : 60_000);
    return () => clearInterval(timer);
  }, [minuteReviewEnabled]);
  const [listPanel, setListPanel] = useState<"search" | "options" | null>(null);
  const listTools = useRef<HTMLDivElement>(null);
  const [treeMenu, setTreeMenu] = useState<{
    x: number; y: number; group: string; anchor: HTMLElement;
  } | null>(null);
  const treeMenuRef = useRef<HTMLDivElement>(null);
  const [newFolderParent, setNewFolderParent] = useState("");
  useLayoutEffect(() => {
    if (!treeMenu) return;
    const menu = treeMenuRef.current!;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(treeMenu.x, innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(treeMenu.y, innerHeight - bounds.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = () => setTreeMenu(null);
    const outside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) dismiss();
    };
    const keyboard = (event: globalThis.KeyboardEvent) => {
      const buttons = [...menu.querySelectorAll<HTMLButtonElement>("button")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (["Escape", "Tab"].includes(event.key)) {
        dismiss();
        treeMenu.anchor.focus();
        if (event.key === "Escape") event.preventDefault();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("blur", dismiss);
    };
  }, [treeMenu]);
  useEffect(() => setTreeMenu(null), [view, dialog, busy, introductionOpen]);
  const tradeTools = useRef<HTMLDivElement>(null);
  useEffect(() => setTradeOpen(false), [dialog, note?.id, editing, view]);
  useLayoutEffect(() => {
    if (!tradeOpen) return;
    const position = () => {
      const menu = tradeTools.current?.querySelector<HTMLElement>('[data-trade-menu]');
      if (!menu) return;
      menu.style.left = "auto";
      menu.style.right = "0";
      if (menu.getBoundingClientRect().left < 8) {
        menu.style.left = "0";
        menu.style.right = "auto";
      }
    };
    position();
    tradeTools.current?.querySelector<HTMLElement>('[data-trade-menu] button')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!tradeTools.current?.contains(event.target as Node)) setTradeOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTradeOpen(false);
      tradeTools.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", position);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", position);
    };
  }, [tradeOpen]);
  useEffect(() => {
    if (!listPanel) return;
    const dismiss = (event: PointerEvent) => {
      if (!listTools.current?.contains(event.target as Node))
        setListPanel(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setListPanel(null);
      listTools.current
        ?.querySelector<HTMLButtonElement>(`[data-panel="${listPanel}"]`)
        ?.focus();
    };
    if (listPanel === "search")
      listTools.current?.querySelector<HTMLInputElement>("input")?.focus();
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [listPanel]);
  useEffect(() => setListPanel(null), [view, dialog]);
  const [confirmation, setConfirmation] = useState<{
    text: string;
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    resolve: (answer: boolean) => void;
  } | null>(null);
  const doc = useRef<Note | null>(null),
    saved = useRef<RecordNote | null>(null),
    editStart = useRef<RecordNote | null>(null),
    cancelPending = useRef(false),
    chain = useRef<Promise<unknown>>(Promise.resolve()),
    undo = useRef<Note[]>([]),
    redo = useRef<Note[]>([]),
    drag = useRef<string | null>(null),
    conflictRef = useRef(false);
  const latest = useRef({ close: async () => {}, focus: async () => {} });
  const busyRef = useRef(false);
  const confirm = (
    text: string,
    labels: { title?: string; confirmLabel?: string; cancelLabel?: string } = {},
  ) => new Promise<boolean>((resolve) => setConfirmation({ text, resolve, ...labels }));
  const fail = (e: unknown) => {
    const message = String(e).replace(/^Error: /, "");
    if (message.startsWith("DUPLICATE_TITLE:")) {
      setDuplicateTitle(message.slice("DUPLICATE_TITLE:".length));
      return;
    }
    setError(message);
    if (message.startsWith("CONFLICT:")) {
      conflictRef.current = true;
      setConflict(true);
      setStatus(tr("存在冲突"));
    } else setStatus((s) => (s === tr("保存失败") ? s : tr("操作未完成")));
  };
  const run = async (
    task: () => Promise<void>,
    onError: (e: unknown) => void = fail,
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };
  function select(r: RecordNote | null, editMode = false) {
    saved.current = r;
    doc.current = r ? structuredClone(r.note) : null;
    setNote(doc.current);
    setEditing(editMode);
    editStart.current = editMode ? structuredClone(r) : null;
    setChangeLog("");
    setChangeLogError("");
    setTagText(r?.note.tags.join("，") ?? "");
    undo.current = [];
    redo.current = [];
    setRevisionTick((n) => n + 1);
    setStatus(r ? tr("已保存") : "");
    setMore(false);
    setConflict(false);
    conflictRef.current = false;
  }
  function install(v: Vault) {
    setCanvasReady(false);
    setCanvasSession(s => s + 1);
    setVault(v);
    select(
      v.notes
        .slice()
        .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))[0] ??
        null,
    );
    setView("notes");
    setListVisible(true);
    setFilter([]);
    setQuery("");
    setGroup(null);
    setClosedGroups(new Set());
    if (v.notes.length) introduceIfNeeded();
  }
  function edit(change: (n: Note) => void) {
    if (!editing || !doc.current || conflictRef.current || busyRef.current)
      return;
    undo.current.push(structuredClone(doc.current));
    if (undo.current.length > 150) undo.current.shift();
    redo.current = [];
    const next = structuredClone(doc.current);
    change(next);
    doc.current = next;
    setNote(next);
    setStatus(tr("待保存"));
    setRevisionTick((n) => n + 1);
  }
  function travel(back: boolean) {
    if (!editing || !doc.current || conflictRef.current || busyRef.current)
      return;
    const from = back ? undo : redo,
      to = back ? redo : undo;
    const next = from.current.pop();
    if (!next) return;
    to.current.push(structuredClone(doc.current));
    doc.current = next;
    setNote(next);
    setTagText(next.tags.join("，"));
    setStatus(tr("待保存"));
    setRevisionTick((n) => n + 1);
  }
  async function save() {
    if (cancelPending.current) return;
    const work = chain.current
      .catch(() => {})
      .then(async () => {
        if (cancelPending.current) return;
        if (!doc.current || !saved.current) return;
        if (conflictRef.current) throw Error(tr("CONFLICT:请先处理外部修改冲突"));
        if (contentKey(doc.current) === contentKey(saved.current.note)) {
          setStatus(tr("已保存"));
          return;
        }
        const sent = structuredClone(doc.current);
        setStatus(tr("正在保存…"));
        try {
          const r = await api.command<RecordNote>("save", {
            note: sent,
            expected: saved.current.revision,
          });
          if (doc.current?.id === sent.id) {
            saved.current = r;
            if (contentKey(doc.current) === contentKey(sent)) {
              doc.current = r.note;
              setNote(doc.current);
              setStatus(tr("已保存"));
            } else setStatus(tr("待保存"));
          }
          setVault((v) =>
            v
              ? {
                  ...v,
                  notes: v.notes.map((x) => (x.note.id === r.note.id ? r : x)),
                }
              : v,
          );
        } catch (e) {
          setStatus(tr("保存失败"));
          const msg = String(e);
          if (msg.includes("CONFLICT:")) {
            conflictRef.current = true;
            setConflict(true);
          }
          throw e;
        }
      });
    chain.current = work;
    return work;
  }
  async function checkpoint() {
    if (cancelPending.current) return;
    await save();
    if (cancelPending.current) return;
    if (doc.current)
      await api.command("snapshot", {
        id: doc.current.id,
        kind: "auto",
        label: "",
      });
  }
  async function cancelEditing() {
    const start = editStart.current;
    if (!start || !doc.current) return;
    cancelPending.current = true;
    try {
      await chain.current.catch(() => {});
      const changed = contentKey(doc.current) !== contentKey(start.note)
        || (saved.current?.group ?? "") !== (start.group ?? "");
      if (changed && !await confirm(
        tr("本次编辑已发生更新，退出编辑将丢失本次更新。是否放弃更新？"),
        { title: tr("取消编辑"), confirmLabel: tr("放弃更新"), cancelLabel: tr("继续编辑") },
      )) return;
      const current = saved.current!;
      const record = JSON.stringify(current.note) !== JSON.stringify(start.note)
        || (current.group ?? "") !== (start.group ?? "")
        ? await api.command<RecordNote>("cancel_edit", {
            note: start.note,
            group: start.group ?? "",
            expected: current.revision,
          })
        : current;
      select(record);
      setGroup(record.group ?? "");
      setNotice("");
      setVault((v) => v ? {
        ...v, notes: v.notes.map((r) => r.note.id === record.note.id ? record : r),
      } : v);
    } finally {
      cancelPending.current = false;
      setRevisionTick((n) => n + 1);
    }
  }
  async function reload() {
    const v = await api.command<Vault>("list");
    setVault(v);
    return v;
  }
  async function openNote(id: string) {
    await checkpoint();
    const v = await reload();
    const r = v.notes.find((r) => r.note.id === id);
    if (!r) throw Error(tr("笔记无法读取，请检查资料库提示。"));
    await api.command("snapshot", { id, kind: "external", label: "" });
    select(r);
    setView("notes");
    setListVisible(false);
    setGroup(r.group ?? "");
    introduceIfNeeded();
  }
  async function create(t?: Template, targetGroup = group ?? "") {
    await checkpoint();
    const n = newNote(t, (await reload()).notes);
    const r = await api.command<RecordNote>("save", {
      note: n,
      expected: null,
      group: targetGroup,
    });
    setVault((v) => (v ? { ...v, notes: [...v.notes, r] } : v));
    select(r, true);
    setGroup(targetGroup);
    setView("notes");
    setPicked(null);
    setFilter([]);
    setQuery("");
    setListVisible(false);
    introduceIfNeeded();
  }
  async function openDialog(next: Dialog) {
    await checkpoint();
    if ((next === "share" || next === "invite") && doc.current) {
      if (!validTitle(doc.current))
        throw Error(tr("先为这份列表写一个主题，再生成品交图片。"));
      if (next === "share" && !validEntries(doc.current).length)
        throw Error(tr("先填写至少一个条目，或使用“求品”邀请别人回答。"));
    }
    if (next === "history" && doc.current)
      setVersions(
        await api.command<Version[]>("versions", { id: doc.current.id }),
      );
    if (next === "groups") {
      setGroupInput("");
      setEditingGroup(null);
      setGroupError("");
    }
    setDialog(next);
    setMore(false);
  }
  async function switchView(v: View) {
    await checkpoint();
    await reload();
    if (v === "activity") await loadActivity();
    setView(v);
    setEditing(false);
    setQuery("");
    setFilter([]);
    setPicked(null);
    setMore(false);
    setListVisible(true);
  }
  async function loadActivity() {
    setActivity(await api.command<ActivityEvent[]>("activity"));
  }
  async function externalRefresh() {
    if (!saved.current || conflictRef.current) return;
    await save();
    const v = await reload();
    const r = v.notes.find((r) => r.note.id === saved.current?.note.id);
    if (!r) {
      throw Error(
        tr("CONFLICT:当前笔记已在外部移动、删除或损坏。你仍可将当前内容另存为新笔记。"),
      );
    }
    if (r.revision !== saved.current.revision) {
      await api.command("snapshot", {
        id: r.note.id,
        kind: "external",
        label: "",
      });
      select(r);
      setNotice(tr("已加载外部修改，并记录到历史。"));
    } else saved.current = r;
    if (group && !v.groups.includes(group)) setGroup(null);
  }
  latest.current = {
    close: async () => {
      busyRef.current = true;
      setBusy(true);
      try {
        await checkpoint();
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    focus: async () => {
      setReviewNow(Date.now());
      if (!busyRef.current && dialog !== "commit") await externalRefresh();
    },
  };
  useEffect(() => {
    let live = true;
    if (api.web || api.android) introduceIfNeeded();
    api
      .startup()
      .then((v) => {
        if (live && v) install(v);
      })
      .catch((e) => {
        if (live) fail(e);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!api.android) return;
    const close = () => void latest.current.close().then(() => androidRequest("finish")).catch(fail);
    const pause = () => { if (!busyRef.current) void latest.current.close().catch(fail); };
    window.addEventListener("tistnote-android-close", close);
    window.addEventListener("tistnote-android-pause", pause);
    return () => {
      window.removeEventListener("tistnote-android-close", close);
      window.removeEventListener("tistnote-android-pause", pause);
    };
  }, []);
  useEffect(() => {
    if (!note || conflict) return;
    const auto = setTimeout(() => void save().catch(fail), 450);
    const version = setTimeout(() => void checkpoint().catch(fail), 60_000);
    return () => {
      clearTimeout(auto);
      clearTimeout(version);
    };
  }, [revisionTick, note?.id, conflict]);
  useEffect(() => {
    const focus = () => void latest.current.focus().catch(fail);
    window.addEventListener("focus", focus);
    const before = (e: BeforeUnloadEvent) => {
      if (
        doc.current &&
        saved.current &&
        contentKey(doc.current) !== contentKey(saved.current.note)
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", before);
    let unlisten: (() => void) | undefined;
    let disposed = false;
    if (api.desktop)
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          event.preventDefault();
          try {
            await latest.current.close();
            await getCurrentWindow().destroy();
          } catch (e) {
            fail(e);
          }
        })
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        });
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("focus", focus);
      window.removeEventListener("beforeunload", before);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  const templates = useMemo(
    () => [...localizedBuiltinTemplates(), ...(vault?.templates ?? [])],
    [vault?.templates, uiLanguage],
  );
  const covered = useMemo(
    () => notesByTemplate(templates, vault?.notes ?? []),
    [templates, vault?.notes],
  );
  const coveragePercent = templates.length
    ? Math.round((covered.size * 1000) / templates.length) / 10
    : 0;
  const groups = vault?.groups ?? [];
  const source =
    view === "templates"
      ? templates
      : ((view === "trash" ? vault?.trash : vault?.notes)?.map((r) => r.note) ??
        []);
  const tags = [...new Set(source.flatMap((n) => n.tags))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  const list =
    (view === "trash" ? vault?.trash : vault?.notes)
      ?.filter((r) => matches(r.note, query, filter))
      .sort((a, b) =>
        sort === "title"
          ? a.note.title.localeCompare(b.note.title, "zh-CN")
          : sort === "created"
            ? b.note.createdAt.localeCompare(a.note.createdAt)
            : b.note.updatedAt.localeCompare(a.note.updatedAt),
      ) ?? [];
  const templateList = templates.filter((t) => matches(t, query, filter));
  async function openTemplate(t: Template) {
    const existing = covered.get(t.id);
    if (!existing) return create(t);
    await openNote(existing.note.id);
    setQuery("");
    setFilter([]);
    setPicked(null);
  }
  const move = (from: number, to: number) =>
    edit((n) => {
      if (to < 0 || to >= n.entries.length) return;
      const [entry] = n.entries.splice(from, 1);
      n.entries.splice(to, 0, entry);
    });
  const addEntry = (after?: number) => {
    const id = uid();
    edit((n) => {
      n.entries.splice(after === undefined ? n.entries.length : after + 1, 0, {
        id,
        name: "",
        reason: "",
      });
    });
    requestAnimationFrame(() =>
      document.getElementById(`entry-${id}`)?.focus(),
    );
  };
  const keyboard = (e: KeyboardEvent) => {
    if (
      !editing ||
      view !== "notes" ||
      dialog ||
      template ||
      confirmation ||
      duplicateTitle ||
      introductionOpen ||
      busy ||
      conflict
    )
      return;
    if (e.target instanceof HTMLElement && !e.target.closest(".editor")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      travel(!e.shiftKey);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      travel(false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void run(checkpoint);
    }
  };
  const saveTemplate = async (t: Template) => {
    await api.command("template_put", { template: t });
    await reload();
    setPicked(null);
    setNotice(tr("模板已保存"));
  };
  async function resolveConflict(copy: boolean) {
    await chain.current.catch(() => {});
    if (copy && doc.current) {
      const n = structuredClone(doc.current);
      n.id = uid();
      const v = await reload();
      n.title = copyTitle(tr("{0}（我的副本）", n.title), v.notes);
      n.createdAt = new Date().toISOString();
      n.entries = n.entries.map((e) => ({ ...e, id: uid() }));
      const r = await api.command<RecordNote>("save", {
        note: n,
        expected: null,
        group: v.notes.find((r) => r.note.id === doc.current?.id)?.group ?? "",
      });
      await reload();
      select(r);
    } else {
      const v = await reload();
      const r = v.notes.find((r) => r.note.id === doc.current?.id);
      if (!r) throw Error(tr("外部文件无法读取，请选择另存为新笔记。"));
      await api.command("snapshot", {
        id: r.note.id,
        kind: "external",
        label: "",
      });
      select(r);
    }
    setError("");
  }
  async function refreshGroups() {
    const v = await reload();
    const current = v.notes.find((r) => r.note.id === doc.current?.id);
    if (current && saved.current && current.revision !== saved.current.revision)
      throw Error(
        tr("CONFLICT:笔记已在外部修改，文件夹操作已完成，请先处理内容冲突。"),
      );
    if (current) saved.current = current;
    return v;
  }
  async function moveToGroup(target: string) {
    await checkpoint();
    const r = await api.command<RecordNote>("move_note", {
      id: doc.current!.id,
      group: target,
      expected: saved.current!.revision,
    });
    saved.current = r;
    await reload();
    setGroup(r.group ?? "");
    setNotice(tr("已移到{0}", r.group ? `“${r.group}”` : tr("未分组")));
  }
  async function renameGroupAndLayout(name: string, newName: string) {
    const state = await api.command<CanvasState>("canvas_get");
    await api.command("group_rename", { name, new_name: newName });
    const layout = remapCanvasGroup(state.layout, name, newName);
    if (JSON.stringify(layout) !== JSON.stringify(state.layout)) {
      try { setCanvasState(await api.command<CanvasState>("canvas_put", { layout, expected: state.revision })); }
      catch (error) { await refreshGroups(); throw Error(tr("分组已移动，但画布布局未保存：{0}", String(error))); }
    }
  }
  async function moveTreeItem(item: TreeItem, target: string) {
    await checkpoint();
    let movedGroup: string | null = null;
    if (item.type === "note") {
      const record =
        saved.current?.note.id === item.id
          ? saved.current
          : vault?.notes.find((r) => r.note.id === item.id);
      if (!record) throw Error(tr("笔记不存在，请刷新后重试"));
      await api.command("move_note", {
        id: item.id,
        group: target,
        expected: record.revision,
      });
    } else {
      movedGroup = groupMovePath(item.id, target);
      if (movedGroup === item.id) return;
      await renameGroupAndLayout(item.id, movedGroup);
    }
    await refreshGroups();
    if (movedGroup && group !== null && inGroup(group, item.id))
      setGroup(movedGroup + group.slice(item.id.length));
    else if (item.type === "note" && doc.current?.id === item.id)
      setGroup(target);
    setClosedGroups(
      (previous) =>
        new Set(
          [...previous]
            .map((path) =>
              movedGroup && inGroup(path, item.id)
                ? movedGroup + path.slice(item.id.length)
                : path,
            )
            .filter((path) => !inGroup(target, path)),
        ),
    );
    setNotice(tr("已移到{0}", target ? `“${target}”` : tr("根目录")));
  }
  async function arrangeCanvas(change: CanvasArrangement, graph: NoteGraph) {
    await run(async () => {
      let layout = canvasState.layout;
      let expected = canvasState.revision;
      if (change.target?.mode === "into") {
        const item: TreeItem = change.key.startsWith("group:") ? { type: "group", id: change.key.slice(6) } : { type: "note", id: change.key.slice(5) };
        const target = change.target.key === "root" ? "" : change.target.key.slice(6);
        const movedGroup = item.type === "group" ? groupMovePath(item.id, target) : null;
        await moveTreeItem(item, target);
        const latest = await api.command<CanvasState>("canvas_get");
        layout = latest.layout; expected = latest.revision;
        const affected = canvasKeys(graph, change.key);
        if (movedGroup) for (const key of [...affected]) if (key.startsWith("group:")) affected.add("group:" + movedGroup + key.slice(6 + item.id.length));
        layout = { ...layout, positions: Object.fromEntries(Object.entries(layout.positions).filter(([key]) => !affected.has(key))) };
      } else if (change.target) {
        layout = reorderCanvas(layout, graph, change.key, change.target.key, change.target.mode);
      } else layout = translateCanvas(layout, graph, change.key, change.delta);
      try {
        setCanvasState(await api.command<CanvasState>("canvas_put", { layout, expected }));
      } catch (error) {
        setCanvasState(await api.command<CanvasState>("canvas_get"));
        throw error;
      }
    });
  }
  const runGroup = (task: () => Promise<void>) =>
    run(task, (e) => setGroupError(String(e).replace(/^Error: /, "")));

  const renderTemplateCard = (t: Template) => (
    <article className="template-card" key={t.id}>
      <div className="template-tags">
        {t.tags.join(" · ") || tr("未分类")}
        {!t.builtin && <span>{tr("个人模板")}</span>}
      </div>
      <div className="template-title-heading">
        <h2>
          {covered.has(t.id) ? (
            <button
              className="template-note-title"
              disabled={busy}
              onClick={() => void run(() => openTemplate(t))}
            >
              {t.title}
            </button>
          ) : t.title}
        </h2>
        {covered.has(t.id) && (
          <button
            className="template-covered"
            disabled={busy}
            aria-label={tr("查看“{0}”的笔记", t.title)}
            onClick={() => void run(() => openTemplate(t))}
          >{tr("有品")}</button>
        )}
      </div>
      <p>
        {t.hint ||
          t.description ||
          tr("从 {0} 个选择开始，数量由你决定。", t.suggestedCount)}
      </p>
      <div className="template-actions">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void run(() => openTemplate(t))}
        >
          {covered.has(t.id) ? tr("查看笔记") : tr("开始填写")}{" "}
          <Icon name="arrow" />
        </button>
        <details>
          <summary aria-label={tr("{0}的模板操作", t.title)}>{tr("更多")}</summary>
          <div>
            {covered.has(t.id) && (
              <button
                disabled={busy}
                onClick={() => void run(() => create(t))}
              >{tr("另写一份")}</button>
            )}
            <button
              onClick={() =>
                setTemplate({ ...t, id: uid(), builtin: false })
              }
            >{tr("复制编辑")}</button>
            {!t.builtin && (
              <>
                <button onClick={() => setTemplate(t)}>{tr("编辑")}</button>
                <button
                  className="danger"
                  onClick={() =>
                    void run(async () => {
                      if (
                        await confirm(
                          tr("删除个人模板“{0}”？已有笔记不受影响。", t.title),
                        )
                      ) {
                        await api.command("template_delete", {
                          id: t.id,
                        });
                        await reload();
                        setPicked(null);
                      }
                    })
                  }
                >{tr("删除")}</button>
              </>
            )}
          </div>
        </details>
      </div>
    </article>
  );

  const vaultName = vault && !api.preview
    ? api.desktop
      ? vault.path.replace(/[\\/]+$/, "").split(/[\\/]/).pop()
      : vault.path
    : "";
  return (
    <div
      className={`app ${vault && view === "notes" ? "notes-view" : ""}`}
      onKeyDown={keyboard}
    >
      <aside className="rail">
        <button className="brand" aria-label={tr("关于品记")} disabled={busy} onClick={() => setIntroductionOpen(true)}>
          <img src={`${import.meta.env.BASE_URL}app-icon.svg`} alt="" />
          <div>
            <strong>{tr("品记")}</strong>
            <span>tistnote</span>
          </div>
        </button>
        <nav aria-label={tr("主导航")}>
          {(
            [
              ["notes", tr("笔记"), "list"],
              ["templates", tr("模板库"), "grid"],
              ["activity", tr("历史"), "history"],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""} ${id === "templates" ? "template-nav" : ""}`}
              aria-label={id === "templates" ? tr("模板库") : undefined}
              aria-description={
                id === "templates" && vault
                  ? tr("覆盖率 {0}%，有品 {1} / {2} 个模板", coveragePercent, covered.size, templates.length)
                  : undefined
              }
              disabled={!vault || busy}
              onClick={() => void run(() => switchView(id))}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {id === "templates" && vault && (
                <span className="template-coverage-count" aria-hidden="true">
                  {coveragePercent}%
                </span>
              )}
              {id === "notes" && vault && (
                <span className="nav-count">{vault.notes.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <span className="local-status">
            <i />{tr("数据完全本地")}</span>
          <button
            className="nav-item"
            disabled={busy}
            onClick={() => void run(() => openDialog("settings"))}
          >
            <Icon name="settings" />{tr("设置")}</button>
        </div>
      </aside>
      <main className="workspace">
        {browserTipVisible && (api.preview || api.web) && (
          <div className="preview-banner">
            <span>{tr(api.preview
              ? "浏览器开发预览 · 真实 Markdown 资料库请使用桌面版"
              : api.localFiles
                ? "网页版 · 仅访问你授权的文件夹；同一资料库请勿同时在桌面版和网页版中编辑。"
                : "请使用最新版桌面 Chrome 或 Edge，或在设置中安装本地版本。")}</span>
            <button className="icon-button" aria-label={tr("关闭提示")} title={tr("关闭提示")} onClick={dismissBrowserTip}>
              <Icon name="close" />
            </button>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            <span>{tr(error).replace("CONFLICT:", "")}</span>
            <button onClick={() => setError("")}>{tr("收起提示")}</button>
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {tr(notice)}
          </div>
        )}
        {vault?.warnings.map((w, i) => (
          <div className="alert error" key={i}>
            {tr(w)}
          </div>
        ))}
        {conflict && (
          <div className="conflict-box">
            <strong>{tr("检测到外部修改")}</strong>
            <p>{tr("已暂停自动保存。外部文件保持原样，你的编辑可另存为新笔记。")}</p>
            <div className="actions">
              <button
                className="primary"
                onClick={() => void run(() => resolveConflict(true))}
              >{tr("我的编辑另存为新笔记")}</button>
              <button onClick={() => void run(() => resolveConflict(false))}>{tr("加载外部版本")}</button>
            </div>
          </div>
        )}
        {!vault ? (
          <section className="welcome">
            <span className="welcome-mark">{tr("品")}</span>
            <h1>{tr("品察世间，建设自我。")}</h1>
            <p>{tr("喜欢与讨厌，认同与反感。")}<br />{tr("记录审美与偏好，回看自己的变化。")}</p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const v = await api.pickVault();
                  if (v) install(v);
                })
              }
            >{tr("创建或打开本地资料库")}<Icon name="arrow" />
            </button>
            <p className="welcome-foot">{tr(api.android ? "笔记保存在此设备的应用资料库中。" : "笔记保存在你的文件夹中，随时带走。")}</p>
            <div className="welcome-downloads">
              {!api.desktop && <a href="https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-windows-x64-setup.exe" target="_blank" rel="noopener noreferrer">{tr("安装 Windows 版本")}</a>}
              {!api.android && <a href="https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-android.apk" target="_blank" rel="noopener noreferrer">{tr("安装安卓版本")}</a>}
            </div>
          </section>
        ) : view === "notes" ? (
          <div
            className={`notes-layout ${listVisible && vault.notes.length > 0 ? "show-list" : "show-editor"} ${noteView === "canvas" ? listVisible ? "canvas-overview" : "canvas-note-detail" : ""}`}
          >
            <section className="note-browser" tabIndex={-1} onContextMenu={(event) => {
              event.preventDefault();
              if (busy) return;
              const item = (event.target as HTMLElement).closest<HTMLElement>("[data-create-in]");
              const anchor = item ?? event.currentTarget;
              const bounds = anchor.getBoundingClientRect();
              setListPanel(null);
              setTreeMenu({
                x: event.clientX || bounds.left + 16,
                y: event.clientY || bounds.top + 16,
                group: item?.dataset.createIn ?? "",
                anchor,
              });
            }}>
              <div className="note-list-tools" ref={listTools}>
                <div className="section-heading note-list-heading">
                  <h1>{tr("我的笔记")}</h1>
                  <div className="actions">
                    {noteView === "canvas" && <button onClick={() => { setNoteView("list"); setListPanel(null); }}>{tr("列表视图")}</button>}
                    <button
                      className={`icon-button list-search-button ${query || filter.length ? "active" : ""}`}
                      aria-label={tr("搜索与标签筛选")}
                      title={
                        query || filter.length
                          ? tr("搜索与标签筛选（筛选中）")
                          : tr("搜索与标签筛选")
                      }
                      data-panel="search"
                      aria-expanded={listPanel === "search"}
                      aria-controls="note-search-panel"
                      onClick={() =>
                        setListPanel(listPanel === "search" ? null : "search")
                      }
                    >
                      <Icon name="search" />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={tr("笔记列表选项")}
                      title={tr("笔记列表选项")}
                      data-panel="options"
                      aria-expanded={listPanel === "options"}
                      aria-controls="note-list-options"
                      onClick={() =>
                        setListPanel(listPanel === "options" ? null : "options")
                      }
                    >
                      <Icon name="more" />
                    </button>
                    <button
                      className="icon-button primary"
                      aria-label={tr("新建笔记")}
                      title={tr("新建笔记")}
                      disabled={busy}
                      onClick={() => {
                        setListPanel(null);
                        void run(() => create());
                      }}
                    >
                      <Icon name="plus" />
                    </button>
                  </div>
                </div>
                {listPanel === "search" && (
                  <div className="note-search-panel" id="note-search-panel">
                    <Search value={query} set={setQuery} />
                    <TagFilter tags={tags} selected={filter} set={setFilter} />
                    {(query || filter.length > 0) && (
                      <div className="search-results">
                        <span>{list.length}{tr("份匹配笔记")}</span>
                        <button
                          className="text-button"
                          onClick={() => {
                            setQuery("");
                            setFilter([]);
                          }}
                        >{tr("清除筛选")}</button>
                      </div>
                    )}
                  </div>
                )}
                {listPanel === "options" && (
                  <div
                    className="more-menu note-list-options"
                    id="note-list-options"
                    role="region"
                    aria-label={tr("笔记列表选项")}
                  >
                    <p className="muted">{formatCount(list.length, "notes")}</p>
                    <button onClick={() => {
                      setNoteView(noteView === "list" ? "canvas" : "list");
                      setListVisible(true);
                      setListPanel(null);
                    }}>{tr(noteView === "list" ? "画布视图" : "列表视图")}</button>
                    {noteView === "canvas" && <>
                      <button disabled={busy} onClick={() => void run(async () => { setCanvasState(await api.command<CanvasState>("canvas_get")); setCanvasReady(true); setListPanel(null); })}>{tr("刷新画布布局")}</button>
                      <button disabled={busy || !canvasReady} onClick={() => void run(async () => {
                        if (!await confirm(tr("恢复自动布局会清除自定义位置，分组排序保持不变。是否继续？"), { title: tr("恢复自动布局"), confirmLabel: tr("恢复") })) return;
                        setCanvasState(await api.command<CanvasState>("canvas_put", { layout: { ...canvasState.layout, positions: {} }, expected: canvasState.revision }));
                        setListPanel(null);
                      })}>{tr("恢复自动布局")}</button>
                    </>}
                    <label>{tr("排序")}<select
                        aria-label={tr("笔记排序")}
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="updated">{tr("最近修改")}</option>
                        <option value="created">{tr("创建时间")}</option>
                        <option value="title">{tr("按主题")}</option>
                      </select>
                    </label>
                    <button
                      aria-label={compact ? tr("切换为详细展示") : tr("切换为精简展示")}
                      onClick={() => {
                        setCompact(!compact);
                        setListPanel(null);
                      }}
                    >
                      {compact ? tr("切换为详细展示") : tr("切换为精简展示")}
                    </button>
                    {groups.length > 0 && (
                      <button
                        onClick={() => {
                          setClosedGroups(
                            groups.every((path) => closedGroups.has(path))
                              ? new Set()
                              : new Set(groups),
                          );
                          setListPanel(null);
                        }}
                      >
                        {groups.every((path) => closedGroups.has(path))
                          ? tr("展开全部分组")
                          : tr("折叠全部分组")}
                      </button>
                    )}
                    <div className="list-options-divider" />
                    <button
                      aria-label={tr("管理分组")}
                      disabled={busy}
                      onClick={() => {
                        setListPanel(null);
                        void run(() => openDialog("groups"));
                      }}
                    >{tr("管理分组")}</button>
                    <p className="muted creation-folder">{tr("新建位置：")}{group || tr("根目录")}
                    </p>
                    {group && (
                      <button
                        aria-label={tr("选择根目录")}
                        disabled={busy}
                        onClick={() => {
                          setGroup(null);
                          setListPanel(null);
                        }}
                      >{tr("选择根目录")}</button>
                    )}
                  </div>
                )}
              </div>
              {noteView === "canvas" ? <NoteCanvas
                groups={groups} records={list} now={reviewNow} filtered={!!(query.trim() || filter.length)}
                allRecords={vault.notes} layout={canvasState.layout} onArrange={canvasReady ? arrangeCanvas : undefined}
                onFolder={setGroup} busy={busy} onOpen={id => void run(() => openNote(id))}
              /> : <NoteTree
                groups={groups}
                records={list}
                closed={closedGroups}
                setClosed={setClosedGroups}
                currentId={note?.id}
                currentGroup={group}
                compact={compact}
                groupOrder={canvasState.layout.groupOrder}
                now={reviewNow}
                busy={busy}
                query={query}
                tags={filter}
                onFolder={setGroup}
                onOpen={(id) => void run(() => openNote(id))}
                onMove={(item, target) =>
                  void run(() => moveTreeItem(item, target))
                }
              />}
              {!list.length && noteView === "list" && (
                <div className="small-empty">
                  <p>
                    {query || filter.length
                      ? tr("没有找到匹配的笔记")
                      : tr("还没有笔记")}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => void run(() => switchView("templates"))}
                  >{tr("从模板开始")}<Icon name="arrow" />
                  </button>
                </div>
              )}
            </section>
            <section
              className="editor"
              aria-label={editing ? tr("笔记编辑区") : tr("笔记浏览区")}
            >
              {note ? (
                <>
                  <header className="editor-toolbar">
                    <button
                      className="back-button"
                      onClick={() => setListVisible(true)}
                    >{tr(noteView === "canvas" ? "‹ 返回画布" : "‹ 笔记")}</button>
                    {editing && (
                      <>
                        <span
                          className={`save-state ${tr(status).toLowerCase().includes(tr("失败").toLowerCase()) ? "error" : ""}`}
                          role="status"
                        >
                          {tr(status)}
                        </span>
                        {tr(status) === tr("保存失败") && (
                          <button onClick={() => void run(save)}>{tr("重试保存")}</button>
                        )}
                      </>
                    )}
                    <div className="toolbar-actions">
                      <button
                        className="primary"
                        disabled={busy || conflict}
                        onClick={() =>
                          void run(async () => {
                            if (editing) {
                              await save();
                              setChangeLogError("");
                              setDialog("commit");
                            } else {
                              await externalRefresh();
                              editStart.current = structuredClone(saved.current);
                              setChangeLog("");
                              setEditing(true);
                            }
                            setMore(false);
                          })
                        }
                      >
                        {editing ? tr("完成编辑") : tr("编辑")}
                      </button>
                      {editing && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => void run(cancelEditing)}
                          >{tr("取消编辑")}</button>
                          <button
                            onClick={() =>
                              void run(() => openDialog("history"))
                            }
                          >{tr("历史")}</button>
                        </>
                      )}
                      {!editing && (
                        <button
                          title={needsReview(note, reviewNow) ? tr("需要回顾") : undefined}
                          disabled={busy || conflict}
                          onClick={() => void run(async () => {
                            const record = await api.command<RecordNote>(
                              "review_note",
                              { id: doc.current!.id, expected: saved.current!.revision },
                            );
                            select(record);
                            setVault((v) => v ? {
                              ...v,
                              notes: v.notes.map((r) => r.note.id === record.note.id ? record : r),
                            } : v);
                            setReviewNow(Date.now());
                            setNotice(tr("已回顾确认"));
                          })}
                        >{tr("回顾确认")}{needsReview(note, reviewNow) && (
                            <span className="review-dot" aria-hidden="true" />
                          )}
                        </button>
                      )}
                      <div className="more-wrap" ref={tradeTools}>
                        <button
                          aria-expanded={tradeOpen}
                          aria-controls="trade-menu"
                          disabled={busy || conflict}
                          onClick={() => { setMore(false); setTradeOpen(!tradeOpen); }}
                        >{tr("品交")}<span className="trade-chevron"><Icon name="arrow" /></span>
                        </button>
                        {tradeOpen && (
                          <div className="more-menu" id="trade-menu" data-trade-menu role="group" aria-label={tr("品交选项")}>
                            <button onClick={() => {
                              setTradeOpen(false);
                              void run(() => openDialog("share"));
                            }}>{tr("展品")}</button>
                            <button onClick={() => {
                              setTradeOpen(false);
                              void run(() => openDialog("invite"));
                            }}>{tr("求品")}</button>
                          </div>
                        )}
                      </div>
                      <div className="more-wrap">
                        <button
                          aria-label={tr("更多笔记操作")}
                          aria-expanded={more}
                          onClick={() => { setTradeOpen(false); setMore(!more); }}
                        >
                          ···
                        </button>
                        {more && (
                          <div className="more-menu">
                            {!editing ? (
                              <>
                                <button
                                  onClick={() =>
                                    void run(() => openDialog("history"))
                                  }
                                >{tr("历史")}</button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setMilestone("");
                                    setMore(false);
                                    setDialog("milestone");
                                  }}
                                >{tr("保存里程碑")}</button>
                                <button
                                  onClick={() =>
                                    void run(async () => {
                                      await checkpoint();
                                      if (!validTitle(doc.current!))
                                        throw Error(tr("请先填写主题"));
                                      setTemplate(asTemplate(doc.current!));
                                      setMore(false);
                                    })
                                  }
                                >{tr("保存为模板")}</button>
                                <button
                                  onClick={() =>
                                    void run(async () => {
                                      await checkpoint();
                                      const n = structuredClone(doc.current!);
                                      n.id = uid();
                                      n.title = copyTitle(
                                        tr("{0}（副本）", n.title),
                                        vault.notes,
                                      );
                                      n.createdAt = new Date().toISOString();
                                      n.lastReviewedAt = null;
                                      n.entries = n.entries.map((e) => ({
                                        ...e,
                                        id: uid(),
                                      }));
                                      const r = await api.command<RecordNote>(
                                        "save",
                                        {
                                          note: n,
                                          expected: null,
                                          group: saved.current?.group ?? "",
                                        },
                                      );
                                      await reload();
                                      select(r);
                                    })
                                  }
                                >{tr("复制笔记")}</button>
                                <button
                                  className="danger"
                                  onClick={() =>
                                    void run(async () => {
                                      await checkpoint();
                                      await api.command("trash", {
                                        id: doc.current!.id,
                                        restore: false,
                                        expected: saved.current!.revision,
                                      });
                                      const v = await reload();
                                      select(v.notes[0] ?? null);
                                      setListVisible(true);
                                      setNotice(tr("已移入回收站"));
                                    })
                                  }
                                >{tr("移入回收站")}</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </header>
                  <div className="note-content">
                    {editing ? (
                      <fieldset
                        className="editor-page"
                        disabled={busy || conflict}
                      >
                        <input
                          className="note-title"
                          aria-label={tr("笔记主题")}
                          value={note.title}
                          onChange={(e) =>
                            edit((n) => {
                              n.title = e.target.value;
                            })
                          }
                        />
                        <AutoTextarea
                          className="description"
                          aria-label={tr("主题说明")}
                          placeholder={tr("为这份列表加一句说明（可选）")}
                          rows={Math.max(
                            1,
                            Math.min(5, note.description.split("\n").length),
                          )}
                          value={note.description}
                          onChange={(e) =>
                            edit((n) => {
                              n.description = e.target.value;
                            })
                          }
                        />
                        <div className="note-properties">
                          <label className="group-input">
                            <span>{tr("分组")}</span>
                            <select
                              aria-label={tr("笔记所在分组")}
                              value={
                                vault.notes.find((r) => r.note.id === note.id)
                                  ?.group ?? ""
                              }
                              onChange={(e) =>
                                void run(() => moveToGroup(e.target.value))
                              }
                            >
                              <option value="">{tr("未分组")}</option>
                              {groups.map((g) => (
                                <option key={g} value={g}>
                                  {g.replaceAll("/", " / ")}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="tag-input">
                            <span>{tr("标签")}</span>
                            <input
                              aria-label={tr("笔记标签")}
                              placeholder={tr("添加标签，用逗号分隔")}
                              value={tagText}
                              onChange={(e) => {
                                setTagText(e.target.value);
                                edit((n) => {
                                  n.tags = cleanTags(e.target.value);
                                });
                              }}
                              onBlur={() =>
                                setTagText(doc.current?.tags.join("，") ?? "")
                              }
                            />
                          </label>
                          <select
                            aria-label={tr("列表模式")}
                            value={String(note.ranked)}
                            onChange={(e) =>
                              edit((n) => {
                                n.ranked = e.target.value === "true";
                              })
                            }
                          >
                            <option value="true">{tr("有排名")}</option>
                            <option value="false">{tr("无排名")}</option>
                          </select>
                          <label className="review-settings">
                            <span>{tr("回顾周期")}</span>
                            <select
                              aria-label={tr("回顾周期")}
                              value={note.reviewTestMinute ? "test-minute" : note.reviewIntervalMonths ?? 3}
                              onChange={(e) => edit((n) => {
                                n.reviewTestMinute = e.target.value === "test-minute";
                                if (!n.reviewTestMinute) n.reviewIntervalMonths = Number(e.target.value);
                              })}
                            >
                              <option value="test-minute">{tr("1 分钟（测试）")}</option>
                              {[...new Set([1, 2, 3, 6, 12, 24, note.reviewIntervalMonths ?? 3])].sort((a, b) => a - b).map((months) => (
                                <option key={months} value={months}>{formatCount(months, "months")}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="entries">
                          {note.entries.map((entry, index) => (
                            <article
                              className="entry"
                              key={entry.id}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const from = note.entries.findIndex(
                                  (x) => x.id === drag.current,
                                );
                                if (from >= 0) move(from, index);
                                drag.current = null;
                              }}
                            >
                              <button
                                className="rank-handle"
                                draggable
                                aria-label={tr("拖动条目 {0}", index + 1)}
                                title={tr("拖动调整顺序；Alt + 上下方向键也可移动")}
                                onDragStart={(e) => {
                                  drag.current = entry.id;
                                  e.dataTransfer.setData("text/plain", entry.id);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => {
                                  drag.current = null;
                                }}
                                onKeyDown={(e) => {
                                  if (
                                    e.altKey &&
                                    (e.key === "ArrowUp" || e.key === "ArrowDown")
                                  ) {
                                    e.preventDefault();
                                    move(
                                      index,
                                      index + (e.key === "ArrowUp" ? -1 : 1),
                                    );
                                  }
                                }}
                              >
                                {note.ranked
                                  ? String(index + 1).padStart(2, "0")
                                  : "·"}
                              </button>
                              <div className="entry-body">
                                <input
                                  id={`entry-${entry.id}`}
                                  aria-label={tr("条目 {0} 名称", index + 1)}
                                  placeholder={tr("写下你的选择")}
                                  value={entry.name}
                                  onChange={(e) =>
                                    edit((n) => {
                                      n.entries[index].name = e.target.value;
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (
                                      e.key === "Enter" &&
                                      !e.nativeEvent.isComposing
                                    ) {
                                      e.preventDefault();
                                      addEntry(index);
                                    }
                                    if (
                                      e.altKey &&
                                      (e.key === "ArrowUp" ||
                                        e.key === "ArrowDown")
                                    ) {
                                      e.preventDefault();
                                      move(
                                        index,
                                        index + (e.key === "ArrowUp" ? -1 : 1),
                                      );
                                    }
                                  }}
                                />
                                <AutoTextarea
                                  aria-label={tr("条目 {0} 理由", index + 1)}
                                  placeholder={tr("感受与理由（可选）")}
                                  rows={Math.max(
                                    1,
                                    Math.min(10, entry.reason.split("\n").length),
                                  )}
                                  value={entry.reason}
                                  onChange={(e) =>
                                    edit((n) => {
                                      n.entries[index].reason = e.target.value;
                                    })
                                  }
                                />
                                <div className="entry-actions">
                                  <button
                                    disabled={index === 0}
                                    aria-label={tr("上移条目 {0}", index + 1)}
                                    onClick={() => move(index, index - 1)}
                                  >{tr("上移")}</button>
                                  <button
                                    disabled={index === note.entries.length - 1}
                                    aria-label={tr("下移条目 {0}", index + 1)}
                                    onClick={() => move(index, index + 1)}
                                  >{tr("下移")}</button>
                                  <button
                                    aria-label={tr("删除条目 {0}", index + 1)}
                                    onClick={() =>
                                      edit((n) => {
                                        n.entries.splice(index, 1);
                                      })
                                    }
                                  >{tr("删除")}</button>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                        <button
                          className="add-entry"
                          onClick={() => addEntry()}
                          disabled={conflict}
                        >
                          <Icon name="plus" />{tr("添加一个选择")}</button>
                        <footer className="editor-footer">
                          <span>{formatCount(validEntries(note).length, "choices")}</span>
                          <div>
                            <button
                              className="text-button"
                              disabled={!undo.current.length}
                              onClick={() => travel(true)}
                            >{tr("撤销")}</button>
                            <button
                              className="text-button"
                              disabled={!redo.current.length}
                              onClick={() => travel(false)}
                            >{tr("重做")}</button>
                          </div>
                        </footer>
                      </fieldset>
                    ) : (
                      <NoteReader note={note} now={reviewNow} />
                    )}
                  </div>
                </>
              ) : (
                <div className="empty-editor">
                  <span className="empty-symbol">＋</span>
                  <h2>{tr("从一次品察开始。")}</h2>
                  <p>{tr("喜欢与讨厌，都可以成为一份记录。")}</p>
                  <button
                    className="primary"
                    onClick={() => void run(() => create())}
                  >{tr("写一份新笔记")}</button>
                  <button
                    className="text-button"
                    onClick={() => void run(() => switchView("templates"))}
                  >{tr("去模板库找灵感")}</button>
                </div>
              )}
            </section>
          </div>
        ) : view === "activity" ? (
          <ActivityPage
            events={activity}
            notes={vault.notes}
            busy={busy}
            onOpen={(id) => void run(() => openNote(id))}
            onRefresh={() =>
              void run(async () => {
                await checkpoint();
                await reload();
                await loadActivity();
              })
            }
          />
        ) : view === "templates" ? (
          <section className="library template-library">
            <header className="library-header">
              <div>
                <h1>{tr("模板库")}</h1>
                <p className="template-coverage-summary" role="status">{tr("有品")} {covered.size} / {templates.length} {tr("· 覆盖率")}{" "}
                  {coveragePercent}%
                </p>
              </div>
              <div className="actions">
                <button className="icon-button" aria-label={tr("搜索和标签")} aria-expanded={templateTools} onClick={() => setTemplateTools(v => !v)}><Icon name="search" /></button>
                <button onClick={() => { setTemplateView(v => v === "canvas" ? "cards" : "canvas"); setPicked(null); }}>{tr(templateView === "canvas" ? "卡片视图" : "画布视图")}</button>
                <button onClick={() => setTemplate(emptyTemplate())}>{tr("新建模板")}</button>
                <button
                  className="primary"
                  disabled={!templateList.length}
                  onClick={() =>
                    setPicked(randomTemplate(templateList, picked?.id) ?? null)
                  }
                >{tr("随机一品 ↗")}</button>
              </div>
            </header>
            {(templateTools || query || filter.length > 0) && <div className="template-filters">
              <Search value={query} set={(v) => {
                setQuery(v);
                setPicked(null);
              }} />
              <TagFilter tags={tags} selected={filter} set={(v) => {
                setFilter(v);
                setPicked(null);
              }} />
            </div>}
            {templateView === "canvas" ? (
              <TemplateCanvas templates={templateList} covered={covered} selected={picked} onSelect={setPicked} renderCard={renderTemplateCard} />
            ) : (
              <>
                {picked && <div className="random-card">
                  <button className="text-button" onClick={() => setPicked(null)}>{tr("收起提示")}</button>
                  {renderTemplateCard(picked)}
                </div>}
                <div className="template-grid">{templateList.map(renderTemplateCard)}</div>
              </>
            )}
            {!templateList.length && templateView === "cards" && (
              <p className="small-empty">{tr("没有匹配的模板，请试试其他关键词或标签。")}</p>
            )}
          </section>
        ) : (
          <section className="library">
            <header className="library-header">
              <div>
                <h1>{tr("回收站")}</h1>
                <p className="muted">{tr("笔记与历史一起保留，直到你永久删除。")}</p>
              </div>
            </header>
            <SearchFilters
              query={query}
              setQuery={setQuery}
              tags={tags}
              selected={filter}
              setFilter={setFilter}
            />
            <div className="trash-list">
              {list.map((r) => (
                <article key={r.note.id}>
                  <div>
                    <h2>{r.note.title}</h2>
                    <p className="muted">
                      {formatCount(validEntries(r.note).length, "choices")} · {" "}
                      {dateTime(r.note.updatedAt)}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      onClick={() =>
                        void run(async () => {
                          await api.command("trash", {
                            id: r.note.id,
                            restore: true,
                            expected: r.revision,
                          });
                          const v = await reload();
                          const restoredGroup = v.notes.find(
                            (x) => x.note.id === r.note.id,
                          )?.group;
                          setNotice(
                            tr("笔记与历史已恢复到{0}", restoredGroup ? `“${restoredGroup}”` : tr("未分组")),
                          );
                        })
                      }
                    >{tr("恢复")}</button>
                    <button
                      className="danger"
                      onClick={() =>
                        void run(async () => {
                          if (
                            await confirm(
                              tr("永久删除“{0}”及它的全部历史？此操作无法撤销。", r.note.title),
                            )
                          ) {
                            await api.command("purge", { id: r.note.id });
                            await reload();
                          }
                        })
                      }
                    >{tr("永久删除")}</button>
                  </div>
                </article>
              ))}
            </div>
            {!list.length && <p className="small-empty">{tr("回收站是空的。")}</p>}
          </section>
        )}
      </main>
      {treeMenu && (
        <div className="more-menu note-context-menu" ref={treeMenuRef}
          role="menu" aria-label={tr("笔记新建菜单")}
          style={{ left: treeMenu.x, top: treeMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button role="menuitem" onClick={() => {
            setTreeMenu(null);
            void run(() => create(undefined, treeMenu.group));
          }}>{tr("新建笔记")}</button>
          <button role="menuitem" onClick={() => {
            setTreeMenu(null);
            setNewFolderParent(treeMenu.group);
            setGroupInput("");
            setGroupError("");
            void run(() => openDialog("new-folder"));
          }}>{tr("新建分组")}</button>
        </div>
      )}
      {dialog === "new-folder" && vault && (
        <Modal title={tr("新建分组")} onClose={() => { if (!busy) setDialog(null); }}>
          <form className="form-stack" onSubmit={(event) => {
            event.preventDefault();
            void runGroup(async () => {
              setGroupError("");
              const name = groupName([newFolderParent, groupInput.trim()].filter(Boolean).join("/"));
              await checkpoint();
              await api.command("group_create", { name });
              const v = await refreshGroups();
              const created = v.groups.find(path => path.toLowerCase() === name.toLowerCase()) ?? name;
              setGroup(created);
              setClosedGroups(previous => new Set([...previous].filter(path => !inGroup(created, path))));
              setNotice(tr("分组已创建"));
              setDialog(null);
            });
          }}>
            <p className="muted">{tr("新建位置：")}{newFolderParent || tr("根目录")}</p>
            <label className="form-stack">
              <span>{tr("分组名称")}</span>
              <input aria-label={tr("分组名称")} autoFocus value={groupInput}
                disabled={busy} onChange={event => setGroupInput(event.target.value)} />
            </label>
            {groupError && <p className="error" role="alert">{tr(groupError)}</p>}
            <div className="actions">
              <button className="primary" disabled={busy || !groupInput.trim()}>{tr("新建分组")}</button>
              <button type="button" disabled={busy} onClick={() => setDialog(null)}>{tr("取消")}</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "groups" && vault && (
        <Modal
          title={tr("管理分组")}
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          <div className="form-stack">
            <p className="muted">{tr("分组对应资料库中的文件夹。可用 / 建立子分组；只有空分组可以删除。")}</p>
            {groupError && (
              <p className="error" role="alert">
                {tr(groupError)}
              </p>
            )}
            <form
              className="form-stack group-form"
              onSubmit={(e) => {
                e.preventDefault();
                void runGroup(async () => {
                  setGroupError("");
                  const name = groupName(groupInput);
                  await checkpoint();
                  if (editingGroup)
                    await renameGroupAndLayout(editingGroup, name);
                  else await api.command("group_create", { name });
                  const v = await refreshGroups();
                  if (
                    editingGroup &&
                    group !== null &&
                    inGroup(group, editingGroup)
                  )
                    setGroup(
                      v.groups.find(
                        (g) =>
                          g.toLowerCase() ===
                          (
                            name + group.slice(editingGroup.length)
                          ).toLowerCase(),
                      ) ?? null,
                    );
                  setGroupInput("");
                  setEditingGroup(null);
                  setNotice(editingGroup ? tr("分组已重命名") : tr("分组已创建"));
                  if (!editingGroup && group !== null)
                    setGroup(
                      v.groups.find(
                        (g) => g.toLowerCase() === name.toLowerCase(),
                      ) ?? name,
                    );
                });
              }}
            >
              <label>
                <span>{editingGroup ? tr("分组新名称") : tr("新分组名称")}</span>
                <input
                  aria-label={editingGroup ? tr("分组新名称") : tr("新分组名称")}
                  autoComplete="off"
                  value={groupInput}
                  disabled={busy}
                  onChange={(e) => setGroupInput(e.target.value)}
                  placeholder={tr("例如：电影/收藏")}
                />
              </label>
              <div className="actions">
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || !groupInput.trim()}
                >
                  {editingGroup ? tr("保存名称") : tr("新建分组")}
                </button>
                {editingGroup && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditingGroup(null);
                      setGroupInput("");
                      setGroupError("");
                    }}
                  >{tr("取消重命名")}</button>
                )}
              </div>
            </form>
            <div className="group-list">
              {groups.map((g) => (
                <div className="group-row" key={g}>
                  <div>
                    <strong>{g.replaceAll("/", " / ")}</strong>
                    <span className="muted">
                      {formatCount(vault.notes.filter((r) => inGroup(r.group, g)).length, "notes")}</span>
                  </div>
                  <div className="actions">
                    <button
                      aria-label={tr("重命名分组 {0}", g)}
                      disabled={busy}
                      onClick={() => {
                        setEditingGroup(g);
                        setGroupInput(g);
                        setGroupError("");
                      }}
                    >{tr("重命名")}</button>
                    <button
                      aria-label={tr("删除分组 {0}", g)}
                      className="danger"
                      disabled={busy}
                      onClick={() =>
                        void runGroup(async () => {
                          setGroupError("");
                          await checkpoint();
                          await api.command("group_delete", { name: g });
                          await refreshGroups();
                          if (group === g) setGroup(null);
                          if (editingGroup === g) {
                            setEditingGroup(null);
                            setGroupInput("");
                          }
                          setNotice(tr("空分组已删除"));
                        })
                      }
                    >{tr("删除")}</button>
                  </div>
                </div>
              ))}
              {!groups.length && <p className="muted">{tr("还没有分组")}</p>}
            </div>
          </div>
        </Modal>
      )}
      {template && (
        <TemplateEditor
          initial={template}
          onSave={saveTemplate}
          onClose={() => setTemplate(null)}
        />
      )}
      {(dialog === "share" || dialog === "invite") && note && (
        <ShareDialog
          note={note}
          invitation={dialog === "invite"}
          onClose={() => setDialog(null)}
        />
      )}
      {introductionOpen && <Introduction onClose={closeIntroduction} />}
      {dialog === "history" && (
        <History
          versions={versions}
          onClose={() => setDialog(null)}
          onRestore={async (v) => {
            await checkpoint();
            const r = await api.command<RecordNote>("restore", {
              id: doc.current!.id,
              version: v.id,
              expected: saved.current!.revision,
            });
            select(r);
            await reload();
            setNotice(tr("历史版本已恢复"));
          }}
        />
      )}
      {dialog === "commit" && (
        <Modal
          title={tr("更新日志")}
          onClose={() => {
            if (!busyRef.current) setDialog(null);
          }}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              setChangeLogError("");
              void run(
                async () => {
                  await save();
                  await api.command("commit_edit", {
                    id: doc.current!.id,
                    expected: saved.current!.revision,
                    label: changeLog.trim(),
                  });
                  setDialog(null);
                  setEditing(false);
                  editStart.current = null;
                  setChangeLog("");
                },
                (e) => {
                  setChangeLogError(String(e).replace(/^Error: /, ""));
                  fail(e);
                },
              );
            }}
          >
            <label>{tr("更新日志（可选）")}<textarea
                autoFocus
                rows={4}
                placeholder={tr("例如：调整了电影排名，补充重看后的感受。")}
                value={changeLog}
                disabled={busy}
                onChange={(e) => setChangeLog(e.target.value)}
              />
            </label>
            {changeLogError && (
              <p className="error" role="alert">{tr(changeLogError)}</p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog(null)}
              >{tr("继续编辑")}</button>
              <button
                className="primary"
                disabled={busy || conflict}
              >{tr("提交更新")}</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "milestone" && (
        <Modal title={tr("为此刻留个标记")} onClose={() => setDialog(null)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await save();
                await api.command("snapshot", {
                  id: doc.current!.id,
                  kind: "milestone",
                  label: milestone.trim() || tr("审美里程碑"),
                });
                setDialog(null);
                setNotice(tr("里程碑已保存"));
              });
            }}
          >
            <label>{tr("里程碑名称")}<input
                autoFocus
                placeholder={tr("例如：毕业时的十部电影")}
                value={milestone}
                onChange={(e) => setMilestone(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>{tr("保存里程碑")}</button>
          </form>
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal title={vaultName ? tr("本地资料库 · {0}", vaultName) : tr("本地资料库")} onClose={() => setDialog(null)}>
          <div className="form-stack">
            <div className="preference-fields">
              <label>
                {tr("界面语言")}
                <select aria-label={tr("界面语言")} value={preferences.language} onChange={event => {
                  try { setPreferences({ language: event.target.value as typeof preferences.language }); setPreferenceError(""); }
                  catch { setPreferenceError(tr("无法保存界面设置，请检查本地存储权限。")); }
                }}>
                  <option value="system">{tr("跟随系统")}</option>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                {tr("外观")}
                <select aria-label={tr("外观")} value={preferences.theme} onChange={event => {
                  try { setPreferences({ theme: event.target.value as typeof preferences.theme }); setPreferenceError(""); }
                  catch { setPreferenceError(tr("无法保存界面设置，请检查本地存储权限。")); }
                }}>
                  <option value="system">{tr("跟随系统")}</option>
                  <option value="light">{tr("浅色")}</option>
                  <option value="dark">{tr("深色")}</option>
                </select>
              </label>
            </div>
            {preferenceError && <p className="error" role="alert">{tr(preferenceError)}</p>}
            <p className="vault-path">{vault
              ? api.preview ? tr("浏览器预览 · 数据仅保存在此浏览器") : vault.path
              : tr("尚未选择资料库")}</p>
            <div className="settings-grid">
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await checkpoint();
                    const v = await api.pickVault();
                    if (v) {
                      install(v);
                      setDialog(null);
                    }
                  })
                }
              >{tr("创建 / 切换资料库")}</button>
              {!api.android && <button
                disabled={!vault || !api.desktop}
                onClick={() =>
                  void run(async () => {
                    await api.command("reveal");
                  })
                }
              >{tr("在文件管理器中打开")}</button>}
              <button
                disabled={!vault || !api.localFiles || busy}
                onClick={() =>
                  void run(async () => {
                    await checkpoint();
                    const path = await api.backupVault();
                    if (path) setNotice(tr("备份完成：{0}", path));
                  })
                }
              >{tr("完整备份")}</button>
              <button
                disabled={!api.localFiles || busy}
                onClick={() =>
                  void run(async () => {
                    await checkpoint();
                    const v = await api.pickVault(true);
                    if (v) {
                      install(v);
                      setDialog(null);
                      setNotice(tr("备份已恢复到新文件夹"));
                    }
                  })
                }
              >{tr("从备份恢复")}</button>
              <button
                disabled={!vault || !api.localFiles || busy}
                onClick={() =>
                  void run(async () => {
                    await checkpoint();
                    const r = await api.importNote();
                    if (r) {
                      await reload();
                      select(r);
                      setView("notes");
                      setListVisible(false);
                      setDialog(null);
                    }
                  })
                }
              >{tr("导入品记 Markdown")}</button>
              <button onClick={() => setDialog("help")}>{tr("使用帮助")}</button>
              <button disabled={busy} onClick={() => { setDialog(null); setIntroductionOpen(true); }}>{tr("引导页")}</button>
              <button disabled={busy} onClick={() => setDialog("install")}>{tr("安装本地版本")}</button>
              <button
                disabled={!vault || busy}
                onClick={() =>
                  void run(async () => {
                    await switchView("trash");
                    setDialog(null);
                  })
                }
              >
                <Icon name="trash" />{tr("回收站")}</button>
            </div>
            <p className="muted">{tr("笔记、历史与模板都在此文件夹内。完整复制文件夹即可迁移。资料库未加密。")}</p>
            {api.android && <p className="muted">{tr("安卓资料库保存在应用私有目录。卸载应用前请导出完整备份，避免丢失数据。")}</p>}
            <p className="muted">{tr(api.web ? "品记网页版 · 网页资源联网加载，笔记只保存在本地资料库。" : "品记 0.2.0 · 不联网，不上传。")}</p>
          </div>
        </Modal>
      )}
      {dialog === "install" && (
        <Modal title={tr("安装本地版本")} onClose={() => setDialog(null)}>
          <div className="form-stack">
            {!api.desktop && <a className="native-install" href="https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-windows-x64-setup.exe" target="_blank" rel="noopener noreferrer">
              <strong>{tr("安装 Windows 版本")}</strong>
              <span>{tr("Windows 10/11 · x64 · 完整离线安装包")}</span>
            </a>}
            {!api.android && <a className="native-install" href="https://github.com/LeoAtopos/tistnote/releases/download/v0.2.0/tistnote-0.2.0-android.apk" target="_blank" rel="noopener noreferrer">
              <strong>{tr("安装安卓版本")}</strong>
              <span>{tr("Android 8.0 及以上 · 通用 APK")}</span>
            </a>}
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title={tr("使用帮助")} onClose={() => setDialog(null)}>
          <div className="form-stack help">
            <h3>{tr("记录与排序")}</h3>
            <p>{tr("条目名称输入后按 Enter 继续添加。拖动序号、使用上移 / 下移，或按 Alt + 方向键调整顺序。无排名列表的位置只表示展示顺序。")}</p>
            <h3>{tr("保存与历史")}</h3>
            <p>{tr("编辑自动保存。停止编辑 60 秒、离开笔记或关闭应用时保存一个历史版本。“保存里程碑”可以为某个阶段命名。Ctrl + Z 撤销，Ctrl + Shift + Z 或 Ctrl + Y 重做，Ctrl + S 立即保存。")}</p>
            <h3>{tr("品交：展品与求品")}</h3>
            <p>{tr("点击“品交”，选择“展品”展示自己的选择，或选择“求品”邀请别人回答。展品前可选择公开的条目与字段，默认导出一张长图，也可选择分页图片，节选保留原排名。求品图片不包含你的答案。")}</p>
            <h3>{tr("本地文件")}</h3>
            <p>{tr("notes 文件夹内为 Markdown。外部编辑时请保留元数据、列表分隔标记和条目标识。重新进入应用时会检查改动。发生冲突时，待保存内容保存在 .tistnote/conflicts。")}</p>
            <h3>{tr("推广二维码")}</h3>
            <p>{tr("扫描图片中的二维码可打开品记网页版。二维码仅包含网页地址，不包含笔记内容；生成过程不联网。")}</p>
          </div>
        </Modal>
      )}
      {duplicateTitle && (
        <Modal title={tr("标题重复")} onClose={() => setDuplicateTitle("")}>
          <div className="form-stack">
            <p role="alert">{tr("DUPLICATE_TITLE:" + duplicateTitle).slice("DUPLICATE_TITLE:".length)}</p>
            <div className="modal-actions">
              <button className="primary" onClick={() => setDuplicateTitle("")}>{tr("知道了")}</button>
            </div>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={confirmation.title ?? tr("确认操作")}
          onClose={() => {
            confirmation.resolve(false);
            setConfirmation(null);
          }}
        >
          <div className="form-stack">
            <p>{tr(confirmation.text)}</p>
            <div className="modal-actions">
              <button
                onClick={() => {
                  confirmation.resolve(false);
                  setConfirmation(null);
                }}
              >
                {confirmation.cancelLabel ?? tr("取消")}
              </button>
              <button
                className="danger"
                onClick={() => {
                  confirmation.resolve(true);
                  setConfirmation(null);
                }}
              >
                {confirmation.confirmLabel ?? tr("确认删除")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
function SearchFilters({
  query,
  setQuery,
  tags,
  selected,
  setFilter,
}: {
  query: string;
  setQuery: (value: string) => void;
  tags: string[];
  selected: string[];
  setFilter: (value: string[]) => void;
}) {
  const [open, setOpen] = useState<"search" | "tags" | null>(null);
  return (
    <div className="search-filters">
      <div className="filter-buttons">
        <button
          aria-label={tr("展开或收起搜索")}
          aria-expanded={open === "search"}
          className={query ? "selected" : ""}
          onClick={() => setOpen(open === "search" ? null : "search")}
        >
          <Icon name="search" />
          {query ? tr("搜索中") : tr("搜索")}
        </button>
        <button
          aria-label={tr("展开或收起标签筛选")}
          aria-expanded={open === "tags"}
          className={selected.length ? "selected" : ""}
          onClick={() => setOpen(open === "tags" ? null : "tags")}
        >
          {selected.length ? tr("标签（{0}）", selected.length) : tr("标签")}
        </button>
        {(query || selected.length > 0) && (
          <button
            className="clear-filters"
            onClick={() => {
              setQuery("");
              setFilter([]);
            }}
          >{tr("清除")}</button>
        )}
      </div>
      {open === "search" && <Search value={query} set={setQuery} />}
      {open === "tags" &&
        (tags.length ? (
          <TagFilter tags={tags} selected={selected} set={setFilter} />
        ) : (
          <p className="muted">{tr("暂无标签")}</p>
        ))}
    </div>
  );
}
function Search({ value, set }: { value: string; set: (s: string) => void }) {
  return (
    <label className="search">
      <Icon name="search" />
      <input
        aria-label={tr("搜索")}
        placeholder={tr("搜索主题、条目、标签…")}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      {value && (
        <button
          className="icon-button"
          aria-label={tr("清除搜索")}
          onClick={() => set("")}
        >
          <Icon name="close" />
        </button>
      )}
    </label>
  );
}
function TagFilter({
  tags,
  selected,
  set,
}: {
  tags: string[];
  selected: string[];
  set: (v: string[]) => void;
}) {
  return tags.length ? (
    <div className="tag-filter" aria-label={tr("按标签筛选")}>
      <button
        className={!selected.length ? "selected" : ""}
        onClick={() => set([])}
      >{tr("全部")}</button>
      {tags.map((t) => (
        <button
          key={t}
          aria-pressed={selected.includes(t)}
          className={selected.includes(t) ? "selected" : ""}
          onClick={() =>
            set(
              selected.includes(t)
                ? selected.filter((x) => x !== t)
                : [...selected, t],
            )
          }
        >
          {t}
        </button>
      ))}
    </div>
  ) : null;
}
