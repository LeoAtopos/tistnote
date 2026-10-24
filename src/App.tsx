import {
  useEffect,
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
  coveredTemplates,
  groupName,
  groupMovePath,
  inGroup,
  matches,
  newNote,
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
import { builtinTemplates } from "./templates";
import { NoteTree } from "./NoteTree";
import { ActivityPage } from "./ActivityPage";
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
type Dialog =
  | "settings"
  | "share"
  | "invite"
  | "history"
  | "milestone"
  | "help"
  | "groups"
  | null;
export default function App() {
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
  const [more, setMore] = useState(false),
    [editing, setEditing] = useState(false),
    [compact, setCompact] = useState(true),
    [duplicateTitle, setDuplicateTitle] = useState(""),
    [listVisible, setListVisible] = useState(true),
    [tagText, setTagText] = useState(""),
    [revisionTick, setRevisionTick] = useState(0);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [listPanel, setListPanel] = useState<"search" | "options" | null>(null);
  const listTools = useRef<HTMLDivElement>(null);
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
    resolve: (answer: boolean) => void;
  } | null>(null);
  const doc = useRef<Note | null>(null),
    saved = useRef<RecordNote | null>(null),
    chain = useRef<Promise<unknown>>(Promise.resolve()),
    undo = useRef<Note[]>([]),
    redo = useRef<Note[]>([]),
    drag = useRef<string | null>(null),
    conflictRef = useRef(false);
  const latest = useRef({ close: async () => {}, focus: async () => {} });
  const busyRef = useRef(false);
  const confirm = (text: string) =>
    new Promise<boolean>((resolve) => setConfirmation({ text, resolve }));
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
      setStatus("存在冲突");
    } else setStatus((s) => (s === "保存失败" ? s : "操作未完成"));
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
    setTagText(r?.note.tags.join("，") ?? "");
    undo.current = [];
    redo.current = [];
    setRevisionTick((n) => n + 1);
    setStatus(r ? "已保存" : "");
    setMore(false);
    setConflict(false);
    conflictRef.current = false;
  }
  function install(v: Vault) {
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
    setStatus("待保存");
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
    setStatus("待保存");
    setRevisionTick((n) => n + 1);
  }
  async function save() {
    const work = chain.current
      .catch(() => {})
      .then(async () => {
        if (!doc.current || !saved.current) return;
        if (conflictRef.current) throw Error("CONFLICT:请先处理外部修改冲突");
        if (contentKey(doc.current) === contentKey(saved.current.note)) {
          setStatus("已保存");
          return;
        }
        const sent = structuredClone(doc.current);
        setStatus("正在保存…");
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
              setStatus("已保存");
            } else setStatus("待保存");
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
          setStatus("保存失败");
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
    await save();
    if (doc.current)
      await api.command("snapshot", {
        id: doc.current.id,
        kind: "auto",
        label: "",
      });
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
    if (!r) throw Error("笔记无法读取，请检查资料库提示。");
    await api.command("snapshot", { id, kind: "external", label: "" });
    select(r);
    setView("notes");
    setListVisible(false);
    setGroup(r.group ?? "");
  }
  async function create(t?: Template) {
    await checkpoint();
    const n = newNote(t, (await reload()).notes);
    const r = await api.command<RecordNote>("save", {
      note: n,
      expected: null,
      group: group ?? "",
    });
    setVault((v) => (v ? { ...v, notes: [...v.notes, r] } : v));
    select(r, true);
    setView("notes");
    setPicked(null);
    setFilter([]);
    setQuery("");
    setListVisible(false);
  }
  async function openDialog(next: Dialog) {
    await checkpoint();
    if ((next === "share" || next === "invite") && doc.current) {
      if (!validTitle(doc.current))
        throw Error("先为这份列表写一个主题，再生成分享图片。");
      if (next === "share" && !validEntries(doc.current).length)
        throw Error("先填写至少一个条目，或使用“求分享”邀请别人回答。");
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
        "CONFLICT:当前笔记已在外部移动、删除或损坏。你仍可将当前内容另存为新笔记。",
      );
    }
    if (r.revision !== saved.current.revision) {
      await api.command("snapshot", {
        id: r.note.id,
        kind: "external",
        label: "",
      });
      select(r);
      setNotice("已加载外部修改，并记录到历史。");
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
      if (!busyRef.current) await externalRefresh();
    },
  };
  useEffect(() => {
    let live = true;
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
    () => [...builtinTemplates, ...(vault?.templates ?? [])],
    [vault?.templates],
  );
  const covered = useMemo(
    () => coveredTemplates(templates, vault?.notes ?? []),
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
    setNotice("模板已保存");
  };
  async function resolveConflict(copy: boolean) {
    await chain.current.catch(() => {});
    if (copy && doc.current) {
      const n = structuredClone(doc.current);
      n.id = uid();
      const v = await reload();
      n.title = copyTitle(`${n.title}（我的副本）`, v.notes);
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
      if (!r) throw Error("外部文件无法读取，请选择另存为新笔记。");
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
        "CONFLICT:笔记已在外部修改，文件夹操作已完成，请先处理内容冲突。",
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
    setNotice(`已移到${r.group ? `“${r.group}”` : "未分组"}`);
  }
  async function moveTreeItem(item: TreeItem, target: string) {
    await checkpoint();
    let movedGroup: string | null = null;
    if (item.type === "note") {
      const record =
        saved.current?.note.id === item.id
          ? saved.current
          : vault?.notes.find((r) => r.note.id === item.id);
      if (!record) throw Error("笔记不存在，请刷新后重试");
      await api.command("move_note", {
        id: item.id,
        group: target,
        expected: record.revision,
      });
    } else {
      movedGroup = groupMovePath(item.id, target);
      if (movedGroup === item.id) return;
      await api.command("group_rename", {
        name: item.id,
        new_name: movedGroup,
      });
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
    setNotice(`已移到${target ? `“${target}”` : "根目录"}`);
  }
  const runGroup = (task: () => Promise<void>) =>
    run(task, (e) => setGroupError(String(e).replace(/^Error: /, "")));

  return (
    <div className="app" onKeyDown={keyboard}>
      <aside className="rail">
        <div className="brand">
          <img src="/app-icon.svg" alt="" />
          <div>
            <strong>品记</strong>
            <span>tistnote</span>
          </div>
        </div>
        <nav aria-label="主导航">
          {(
            [
              ["notes", "笔记", "list"],
              ["templates", "模板库", "grid"],
              ["activity", "历史", "history"],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""} ${id === "templates" ? "template-nav" : ""}`}
              aria-label={id === "templates" ? "模板库" : undefined}
              aria-description={
                id === "templates" && vault
                  ? `覆盖率 ${coveragePercent}%，有品 ${covered.size} / ${templates.length} 个模板`
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
            <i />
            完全本地
          </span>
          <button
            className="nav-item"
            onClick={() => void run(() => openDialog("settings"))}
          >
            <Icon name="settings" />
            设置
          </button>
        </div>
      </aside>
      <main className="workspace">
        {api.preview && (
          <div className="preview-banner">
            浏览器开发预览 · 真实 Markdown 资料库请使用桌面版
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            <span>{error.replace("CONFLICT:", "")}</span>
            <button onClick={() => setError("")}>收起提示</button>
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}
        {vault?.warnings.map((w, i) => (
          <div className="alert error" key={i}>
            {w}
          </div>
        ))}
        {conflict && (
          <div className="conflict-box">
            <strong>检测到外部修改</strong>
            <p>已暂停自动保存。外部文件保持原样，你的编辑可另存为新笔记。</p>
            <div className="actions">
              <button
                className="primary"
                onClick={() => void run(() => resolveConflict(true))}
              >
                我的编辑另存为新笔记
              </button>
              <button onClick={() => void run(() => resolveConflict(false))}>
                加载外部版本
              </button>
            </div>
          </div>
        )}
        {!vault ? (
          <section className="welcome">
            <span className="welcome-mark">品</span>
            <h1>品察世间，记录好恶。</h1>
            <p>
              喜欢与讨厌，认同与反感。
              <br />
              记录审美与偏好，回看自己的变化。
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const v = await api.pickVault();
                  if (v) install(v);
                })
              }
            >
              创建或打开本地资料库 <Icon name="arrow" />
            </button>
            <p className="welcome-foot">笔记保存在你的文件夹中，随时带走。</p>
          </section>
        ) : view === "notes" ? (
          <div
            className={`notes-layout ${listVisible && vault.notes.length > 0 ? "show-list" : "show-editor"}`}
          >
            <section className="note-browser">
              <div className="note-list-tools" ref={listTools}>
                <div className="section-heading note-list-heading">
                  <h1>我的笔记</h1>
                  <div className="actions">
                    <button
                      className={`icon-button list-search-button ${query || filter.length ? "active" : ""}`}
                      aria-label="搜索与标签筛选"
                      title={
                        query || filter.length
                          ? "搜索与标签筛选（筛选中）"
                          : "搜索与标签筛选"
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
                      aria-label="笔记列表选项"
                      title="笔记列表选项"
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
                      aria-label="新建笔记"
                      title="新建笔记"
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
                        <span>{list.length} 份匹配笔记</span>
                        <button
                          className="text-button"
                          onClick={() => {
                            setQuery("");
                            setFilter([]);
                          }}
                        >
                          清除筛选
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {listPanel === "options" && (
                  <div
                    className="more-menu note-list-options"
                    id="note-list-options"
                    role="region"
                    aria-label="笔记列表选项"
                  >
                    <p className="muted">{list.length} 份笔记</p>
                    <label>
                      排序
                      <select
                        aria-label="笔记排序"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="updated">最近修改</option>
                        <option value="created">创建时间</option>
                        <option value="title">按主题</option>
                      </select>
                    </label>
                    <button
                      aria-label={compact ? "切换为详细展示" : "切换为精简展示"}
                      onClick={() => {
                        setCompact(!compact);
                        setListPanel(null);
                      }}
                    >
                      {compact ? "切换为详细展示" : "切换为精简展示"}
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
                          ? "展开全部分组"
                          : "折叠全部分组"}
                      </button>
                    )}
                    <div className="list-options-divider" />
                    <button
                      aria-label="管理分组"
                      disabled={busy}
                      onClick={() => {
                        setListPanel(null);
                        void run(() => openDialog("groups"));
                      }}
                    >
                      管理分组
                    </button>
                    <p className="muted creation-folder">
                      新建位置：{group || "根目录"}
                    </p>
                    {group && (
                      <button
                        aria-label="选择根目录"
                        disabled={busy}
                        onClick={() => {
                          setGroup(null);
                          setListPanel(null);
                        }}
                      >
                        选择根目录
                      </button>
                    )}
                  </div>
                )}
              </div>
              <NoteTree
                groups={groups}
                records={list}
                closed={closedGroups}
                setClosed={setClosedGroups}
                currentId={note?.id}
                currentGroup={group}
                compact={compact}
                busy={busy}
                query={query}
                tags={filter}
                onFolder={setGroup}
                onOpen={(id) => void run(() => openNote(id))}
                onMove={(item, target) =>
                  void run(() => moveTreeItem(item, target))
                }
              />
              {!list.length && (
                <div className="small-empty">
                  <p>
                    {query || filter.length
                      ? "没有找到匹配的笔记"
                      : "还没有笔记"}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => void run(() => switchView("templates"))}
                  >
                    从模板开始 <Icon name="arrow" />
                  </button>
                </div>
              )}
            </section>
            <section
              className="editor"
              aria-label={editing ? "笔记编辑区" : "笔记浏览区"}
            >
              {note ? (
                <>
                  <header className="editor-toolbar">
                    <button
                      className="back-button"
                      onClick={() => setListVisible(true)}
                    >
                      ‹ 笔记
                    </button>
                    {editing && (
                      <>
                        <span
                          className={`save-state ${status.includes("失败") ? "error" : ""}`}
                          role="status"
                        >
                          {status}
                        </span>
                        {status === "保存失败" && (
                          <button onClick={() => void run(save)}>
                            重试保存
                          </button>
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
                              await checkpoint();
                              setEditing(false);
                            } else {
                              await externalRefresh();
                              setEditing(true);
                            }
                            setMore(false);
                          })
                        }
                      >
                        {editing ? "完成编辑" : "编辑"}
                      </button>
                      {editing && (
                        <>
                          <button
                            onClick={() =>
                              void run(() => openDialog("history"))
                            }
                          >
                            历史
                          </button>
                          <button
                            onClick={() => void run(() => openDialog("invite"))}
                          >
                            求分享
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => void run(() => openDialog("share"))}
                      >
                        分享
                      </button>
                      <div className="more-wrap">
                        <button
                          aria-label="更多笔记操作"
                          aria-expanded={more}
                          onClick={() => setMore(!more)}
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
                                >
                                  历史
                                </button>
                                <button
                                  onClick={() =>
                                    void run(() => openDialog("invite"))
                                  }
                                >
                                  求分享
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setMilestone("");
                                    setMore(false);
                                    setDialog("milestone");
                                  }}
                                >
                                  保存里程碑
                                </button>
                                <button
                                  onClick={() =>
                                    void run(async () => {
                                      await checkpoint();
                                      if (!validTitle(doc.current!))
                                        throw Error("请先填写主题");
                                      setTemplate(asTemplate(doc.current!));
                                      setMore(false);
                                    })
                                  }
                                >
                                  保存为模板
                                </button>
                                <button
                                  onClick={() =>
                                    void run(async () => {
                                      await checkpoint();
                                      const n = structuredClone(doc.current!);
                                      n.id = uid();
                                      n.title = copyTitle(
                                        `${n.title}（副本）`,
                                        vault.notes,
                                      );
                                      n.createdAt = new Date().toISOString();
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
                                >
                                  复制笔记
                                </button>
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
                                      setNotice("已移入回收站");
                                    })
                                  }
                                >
                                  移入回收站
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </header>
                  {editing ? (
                    <fieldset
                      className="editor-page"
                      disabled={busy || conflict}
                    >
                      <input
                        className="note-title"
                        aria-label="笔记主题"
                        value={note.title}
                        onChange={(e) =>
                          edit((n) => {
                            n.title = e.target.value;
                          })
                        }
                      />
                      <AutoTextarea
                        className="description"
                        aria-label="主题说明"
                        placeholder="为这份列表加一句说明（可选）"
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
                          <span>分组</span>
                          <select
                            aria-label="笔记所在分组"
                            value={
                              vault.notes.find((r) => r.note.id === note.id)
                                ?.group ?? ""
                            }
                            onChange={(e) =>
                              void run(() => moveToGroup(e.target.value))
                            }
                          >
                            <option value="">未分组</option>
                            {groups.map((g) => (
                              <option key={g} value={g}>
                                {g.replaceAll("/", " / ")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="tag-input">
                          <span>标签</span>
                          <input
                            aria-label="笔记标签"
                            placeholder="添加标签，用逗号分隔"
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
                          aria-label="列表模式"
                          value={String(note.ranked)}
                          onChange={(e) =>
                            edit((n) => {
                              n.ranked = e.target.value === "true";
                            })
                          }
                        >
                          <option value="true">有排名</option>
                          <option value="false">无排名</option>
                        </select>
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
                              aria-label={`拖动条目 ${index + 1}`}
                              title="拖动调整顺序；Alt + 上下方向键也可移动"
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
                                aria-label={`条目 ${index + 1} 名称`}
                                placeholder="写下你的选择"
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
                                aria-label={`条目 ${index + 1} 理由`}
                                placeholder="感受与理由（可选）"
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
                                  aria-label={`上移条目 ${index + 1}`}
                                  onClick={() => move(index, index - 1)}
                                >
                                  上移
                                </button>
                                <button
                                  disabled={index === note.entries.length - 1}
                                  aria-label={`下移条目 ${index + 1}`}
                                  onClick={() => move(index, index + 1)}
                                >
                                  下移
                                </button>
                                <button
                                  aria-label={`删除条目 ${index + 1}`}
                                  onClick={() =>
                                    edit((n) => {
                                      n.entries.splice(index, 1);
                                    })
                                  }
                                >
                                  删除
                                </button>
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
                        <Icon name="plus" />
                        添加一个选择
                      </button>
                      <footer className="editor-footer">
                        <span>{validEntries(note).length} 个选择</span>
                        <div>
                          <button
                            className="text-button"
                            disabled={!undo.current.length}
                            onClick={() => travel(true)}
                          >
                            撤销
                          </button>
                          <button
                            className="text-button"
                            disabled={!redo.current.length}
                            onClick={() => travel(false)}
                          >
                            重做
                          </button>
                        </div>
                      </footer>
                    </fieldset>
                  ) : (
                    <NoteReader note={note} />
                  )}
                </>
              ) : (
                <div className="empty-editor">
                  <span className="empty-symbol">＋</span>
                  <h2>从一次品察开始。</h2>
                  <p>喜欢与讨厌，都可以成为一份记录。</p>
                  <button
                    className="primary"
                    onClick={() => void run(() => create())}
                  >
                    写一份新笔记
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void run(() => switchView("templates"))}
                  >
                    去模板库找灵感
                  </button>
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
          <section className="library">
            <header className="library-header">
              <div>
                <h1>世间万事，皆可一品</h1>
                <p className="muted">
                  喜欢、不喜欢，或说不清的感受，从一个主题开始记录。
                </p>
                <p className="template-coverage-summary" role="status">
                  有品 {covered.size} / {templates.length} · 覆盖率{" "}
                  {coveragePercent}%
                </p>
              </div>
              <div className="actions">
                <button onClick={() => setTemplate(emptyTemplate())}>
                  新建模板
                </button>
                <button
                  className="primary"
                  disabled={!templateList.length}
                  onClick={() =>
                    setPicked(randomTemplate(templateList, picked?.id) ?? null)
                  }
                >
                  随机一品 ↗
                </button>
              </div>
            </header>
            <SearchFilters
              query={query}
              setQuery={(v) => {
                setQuery(v);
                setPicked(null);
              }}
              tags={tags}
              selected={filter}
              setFilter={(v) => {
                setFilter(v);
                setPicked(null);
              }}
            />
            {picked && (
              <div className="random-card">
                <span className="muted">这次，聊聊这个</span>
                <div className="template-title-heading">
                  <h2>{picked.title}</h2>
                  {covered.has(picked.id) && (
                    <span className="template-covered">有品</span>
                  )}
                </div>
                <p>{picked.hint}</p>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void run(() => create(picked))}
                  >
                    开始填写
                  </button>
                  <button
                    onClick={() =>
                      setPicked(randomTemplate(templateList, picked.id) ?? null)
                    }
                  >
                    换个主题
                  </button>
                </div>
              </div>
            )}
            <div className="template-grid">
              {templateList.map((t) => (
                <article className="template-card" key={t.id}>
                  <div className="template-tags">
                    {t.tags.join(" · ") || "未分类"}
                    {!t.builtin && <span>个人模板</span>}
                  </div>
                  <div className="template-title-heading">
                    <h2>{t.title}</h2>
                    {covered.has(t.id) && (
                      <span className="template-covered">有品</span>
                    )}
                  </div>
                  <p>
                    {t.hint ||
                      t.description ||
                      `从 ${t.suggestedCount} 个选择开始，数量由你决定。`}
                  </p>
                  <div className="template-actions">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void run(() => create(t))}
                    >
                      开始填写 <Icon name="arrow" />
                    </button>
                    <details>
                      <summary aria-label={`${t.title}的模板操作`}>
                        更多
                      </summary>
                      <div>
                        <button
                          onClick={() =>
                            setTemplate({ ...t, id: uid(), builtin: false })
                          }
                        >
                          复制编辑
                        </button>
                        {!t.builtin && (
                          <>
                            <button onClick={() => setTemplate(t)}>编辑</button>
                            <button
                              className="danger"
                              onClick={() =>
                                void run(async () => {
                                  if (
                                    await confirm(
                                      `删除个人模板“${t.title}”？已有笔记不受影响。`,
                                    )
                                  ) {
                                    await api.command("template_delete", {
                                      id: t.id,
                                    });
                                    await reload();
                                  }
                                })
                              }
                            >
                              删除
                            </button>
                          </>
                        )}
                      </div>
                    </details>
                  </div>
                </article>
              ))}
            </div>
            {!templateList.length && (
              <p className="small-empty">
                没有匹配的模板，请试试其他关键词或标签。
              </p>
            )}
          </section>
        ) : (
          <section className="library">
            <header className="library-header">
              <div>
                <h1>回收站</h1>
                <p className="muted">笔记与历史一起保留，直到你永久删除。</p>
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
                      {validEntries(r.note).length} 个选择 ·{" "}
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
                            `笔记与历史已恢复到${restoredGroup ? `“${restoredGroup}”` : "未分组"}`,
                          );
                        })
                      }
                    >
                      恢复
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        void run(async () => {
                          if (
                            await confirm(
                              `永久删除“${r.note.title}”及它的全部历史？此操作无法撤销。`,
                            )
                          ) {
                            await api.command("purge", { id: r.note.id });
                            await reload();
                          }
                        })
                      }
                    >
                      永久删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!list.length && <p className="small-empty">回收站是空的。</p>}
          </section>
        )}
      </main>
      {dialog === "groups" && vault && (
        <Modal
          title="管理分组"
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          <div className="form-stack">
            <p className="muted">
              分组对应资料库中的文件夹。可用 / 建立子分组；只有空分组可以删除。
            </p>
            {groupError && (
              <p className="error" role="alert">
                {groupError}
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
                    await api.command("group_rename", {
                      name: editingGroup,
                      new_name: name,
                    });
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
                  setNotice(editingGroup ? "分组已重命名" : "分组已创建");
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
                <span>{editingGroup ? "分组新名称" : "新分组名称"}</span>
                <input
                  aria-label={editingGroup ? "分组新名称" : "新分组名称"}
                  autoComplete="off"
                  value={groupInput}
                  disabled={busy}
                  onChange={(e) => setGroupInput(e.target.value)}
                  placeholder="例如：电影/收藏"
                />
              </label>
              <div className="actions">
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || !groupInput.trim()}
                >
                  {editingGroup ? "保存名称" : "新建分组"}
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
                  >
                    取消重命名
                  </button>
                )}
              </div>
            </form>
            <div className="group-list">
              {groups.map((g) => (
                <div className="group-row" key={g}>
                  <div>
                    <strong>{g.replaceAll("/", " / ")}</strong>
                    <span className="muted">
                      {vault.notes.filter((r) => inGroup(r.group, g)).length}{" "}
                      份笔记
                    </span>
                  </div>
                  <div className="actions">
                    <button
                      aria-label={`重命名分组 ${g}`}
                      disabled={busy}
                      onClick={() => {
                        setEditingGroup(g);
                        setGroupInput(g);
                        setGroupError("");
                      }}
                    >
                      重命名
                    </button>
                    <button
                      aria-label={`删除分组 ${g}`}
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
                          setNotice("空分组已删除");
                        })
                      }
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {!groups.length && <p className="muted">还没有分组</p>}
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
            setNotice("历史版本已恢复");
          }}
        />
      )}
      {dialog === "milestone" && (
        <Modal title="为此刻留个标记" onClose={() => setDialog(null)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await save();
                await api.command("snapshot", {
                  id: doc.current!.id,
                  kind: "milestone",
                  label: milestone.trim() || "审美里程碑",
                });
                setDialog(null);
                setNotice("里程碑已保存");
              });
            }}
          >
            <label>
              里程碑名称
              <input
                autoFocus
                placeholder="例如：毕业时的十部电影"
                value={milestone}
                onChange={(e) => setMilestone(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              保存里程碑
            </button>
          </form>
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal title="本地资料库" onClose={() => setDialog(null)}>
          <div className="form-stack">
            <p className="vault-path">{vault?.path ?? "尚未选择资料库"}</p>
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
              >
                创建 / 切换资料库
              </button>
              <button
                disabled={!vault || !api.desktop}
                onClick={() =>
                  void run(async () => {
                    await api.command("reveal");
                  })
                }
              >
                在文件管理器中打开
              </button>
              <button
                disabled={!vault || !api.desktop || busy}
                onClick={() =>
                  void run(async () => {
                    await checkpoint();
                    const path = await api.backupVault();
                    if (path) setNotice(`备份完成：${path}`);
                  })
                }
              >
                完整备份
              </button>
              <button
                disabled={!api.desktop || busy}
                onClick={() =>
                  void run(async () => {
                    await checkpoint();
                    const v = await api.pickVault(true);
                    if (v) {
                      install(v);
                      setDialog(null);
                      setNotice("备份已恢复到新文件夹");
                    }
                  })
                }
              >
                从备份恢复
              </button>
              <button
                disabled={!vault || !api.desktop || busy}
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
              >
                导入品记 Markdown
              </button>
              <button onClick={() => setDialog("help")}>使用帮助</button>
              <button
                disabled={!vault || busy}
                onClick={() =>
                  void run(async () => {
                    await switchView("trash");
                    setDialog(null);
                  })
                }
              >
                <Icon name="trash" />
                回收站
              </button>
            </div>
            <p className="muted">
              笔记、历史与模板都在此文件夹内。完整复制文件夹即可迁移。资料库未加密。
            </p>
            <p className="muted">品记 0.1.0 · 不联网，不上传。</p>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="使用帮助" onClose={() => setDialog(null)}>
          <div className="form-stack help">
            <h3>记录与排序</h3>
            <p>
              条目名称输入后按 Enter 继续添加。拖动序号、使用上移 / 下移，或按
              Alt + 方向键调整顺序。无排名列表的位置只表示展示顺序。
            </p>
            <h3>保存与历史</h3>
            <p>
              编辑自动保存。停止编辑 60
              秒、离开笔记或关闭应用时保存一个历史版本。“保存里程碑”可以为某个阶段命名。Ctrl
              + Z 撤销，Ctrl + Shift + Z 或 Ctrl + Y 重做，Ctrl + S 立即保存。
            </p>
            <h3>分享与邀请</h3>
            <p>
              分享前选择公开的条目与字段。长内容自动分页，节选保留原排名。求分享图片只发出主题邀请，不包含你的答案。
            </p>
            <h3>本地文件</h3>
            <p>
              notes 文件夹内为
              Markdown。外部编辑时请保留元数据、列表分隔标记和条目标识。重新进入应用时会检查改动。发生冲突时，待保存内容保存在
              .tistnote/conflicts。
            </p>
            <h3>推广二维码</h3>
            <p>当前使用明确占位，正式下载二维码将在发布时内置。</p>
          </div>
        </Modal>
      )}
      {duplicateTitle && (
        <Modal title="标题重复" onClose={() => setDuplicateTitle("")}>
          <div className="form-stack">
            <p role="alert">{duplicateTitle}</p>
            <div className="modal-actions">
              <button className="primary" onClick={() => setDuplicateTitle("")}>
                知道了
              </button>
            </div>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title="确认操作"
          onClose={() => {
            confirmation.resolve(false);
            setConfirmation(null);
          }}
        >
          <div className="form-stack">
            <p>{confirmation.text}</p>
            <div className="modal-actions">
              <button
                onClick={() => {
                  confirmation.resolve(false);
                  setConfirmation(null);
                }}
              >
                取消
              </button>
              <button
                className="danger"
                onClick={() => {
                  confirmation.resolve(true);
                  setConfirmation(null);
                }}
              >
                确认删除
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
          aria-label="展开或收起搜索"
          aria-expanded={open === "search"}
          className={query ? "selected" : ""}
          onClick={() => setOpen(open === "search" ? null : "search")}
        >
          <Icon name="search" />
          {query ? "搜索中" : "搜索"}
        </button>
        <button
          aria-label="展开或收起标签筛选"
          aria-expanded={open === "tags"}
          className={selected.length ? "selected" : ""}
          onClick={() => setOpen(open === "tags" ? null : "tags")}
        >
          {selected.length ? `标签（${selected.length}）` : "标签"}
        </button>
        {(query || selected.length > 0) && (
          <button
            className="clear-filters"
            onClick={() => {
              setQuery("");
              setFilter([]);
            }}
          >
            清除
          </button>
        )}
      </div>
      {open === "search" && <Search value={query} set={setQuery} />}
      {open === "tags" &&
        (tags.length ? (
          <TagFilter tags={tags} selected={selected} set={setFilter} />
        ) : (
          <p className="muted">暂无标签</p>
        ))}
    </div>
  );
}
function Search({ value, set }: { value: string; set: (s: string) => void }) {
  return (
    <label className="search">
      <Icon name="search" />
      <input
        aria-label="搜索"
        placeholder="搜索主题、条目、标签…"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      {value && (
        <button
          className="icon-button"
          aria-label="清除搜索"
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
    <div className="tag-filter" aria-label="按标签筛选">
      <button
        className={!selected.length ? "selected" : ""}
        onClick={() => set([])}
      >
        全部
      </button>
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
