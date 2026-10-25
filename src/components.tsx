import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import {
  asTemplate,
  cleanTags,
  diffNotes,
  uid,
  validEntries,
  reviewDueAt,
  reviewTimeLabel,
  needsReview,
  type Note,
  type Template,
  type Version,
} from "./model";
import { copyPng, exportPngs } from "./api";
import { renderShare, type ShareOptions } from "./share";

export function Icon({
  name,
}: {
  name:
    | "plus"
    | "list"
    | "grid"
    | "trash"
    | "settings"
    | "arrow"
    | "close"
    | "search"
    | "folder"
    | "file"
    | "collapse"
    | "history"
    | "more";
}) {
  const paths = {
    plus: "M12 5v14M5 12h14",
    history: "M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2",
    list: "M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01",
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7",
    settings: "M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M9 16v4",
    arrow: "m9 5 7 7-7 7",
    close: "m6 6 12 12M6 18 18 6",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    folder: "M3 7V5h6l2 2h10v13H3V7Z",
    file: "M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6",
    more: "M6 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2M12 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2M18 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2",
    collapse: "M4 4h12v12H4V4ZM8 20h12V8M7 10h6",
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function NoteReader({ note, now = Date.now() }: { note: Note; now?: number }) {
  const List = note.ranked ? "ol" : "ul";
  const due = reviewDueAt(note);
  return (
    <article className="editor-page note-reading" aria-label="笔记内容">
      <h1 className="reading-title">{note.title}</h1>
      {note.description.trim() && (
        <p className="reading-description">{note.description}</p>
      )}
      {validEntries(note).length ? (
        <List className="reading-entries">
          {note.entries.map((entry, index) =>
            entry.name.trim() ? (
              <li key={entry.id} value={note.ranked ? index + 1 : undefined}>
                <h2>{entry.name}</h2>
                {entry.reason.trim() && <p>{entry.reason}</p>}
              </li>
            ) : null,
          )}
        </List>
      ) : (
        <p className="reading-empty">还没有填写条目</p>
      )}
      <div className="review-summary" aria-label="回顾状态">
        <span>
          {needsReview(note, now) ? "需要回顾" : "下次回顾"} · {due ? (
            <time dateTime={due.toISOString()} title={due.toLocaleString("zh-CN")}>
              {reviewTimeLabel(due.getTime(), now, needsReview(note, now))}
            </time>
          ) : "日期未知"}
        </span>
        <span>
          上次回顾 · {note.lastReviewedAt ? (
            <time dateTime={note.lastReviewedAt} title={new Date(note.lastReviewedAt).toLocaleString("zh-CN")}>
              {reviewTimeLabel(Date.parse(note.lastReviewedAt), now)}
            </time>
          ) : "尚未确认"}
        </span>
      </div>
    </article>
  );
}
export function AutoTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };
  useLayoutEffect(resize, [props.value]);
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return (
    <textarea
      {...props}
      ref={ref}
      style={{ ...props.style, overflow: "hidden", resize: "none" }}
    />
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current!;
    const old = document.activeElement as HTMLElement;
    el.showModal();
    return () => {
      el.close();
      old?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      aria-label={title}
    >
      <header className="modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="关闭对话框"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function TemplateEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: Template;
  onSave: (t: Template) => Promise<void>;
  onClose: () => void;
}) {
  const [t, setT] = useState(initial),
    [tags, setTags] = useState(initial.tags.join("，")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="编辑模板" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave({ ...t, tags: cleanTags(tags), builtin: false });
            onClose();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          主题
          <input
            required
            value={t.title}
            onChange={(e) => setT({ ...t, title: e.target.value })}
          />
        </label>
        <label>
          说明
          <textarea
            value={t.description}
            onChange={(e) => setT({ ...t, description: e.target.value })}
          />
        </label>
        <label>
          填写提示
          <textarea
            value={t.hint}
            onChange={(e) => setT({ ...t, hint: e.target.value })}
          />
        </label>
        <label>
          标签
          <input
            value={tags}
            placeholder="用逗号分隔"
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            列表模式
            <select
              value={String(t.ranked)}
              onChange={(e) =>
                setT({ ...t, ranked: e.target.value === "true" })
              }
            >
              <option value="true">有排名</option>
              <option value="false">无排名</option>
            </select>
          </label>
          <label>
            建议条目数
            <input
              type="number"
              min="1"
              max="999"
              required
              value={t.suggestedCount}
              onChange={(e) =>
                setT({ ...t, suggestedCount: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <p className="muted">模板只保留主题与结构，不包含你的列表答案。</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            保存模板
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function emptyTemplate(): Template {
  return {
    ...asTemplate({
      id: uid(),
      title: "",
      description: "",
      tags: [],
      ranked: true,
      entries: [],
      createdAt: "",
      updatedAt: "",
    }),
    suggestedCount: 5,
  };
}

export const dateTime = (s: string) =>
  new Date(s).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
export const versionName = (v: Version) =>
  v.label ||
  ({
    initial: "初始版本",
    auto: "自动版本",
    edit: "笔记更新",
    review: "回顾确认",
    milestone: "审美里程碑",
    external: "外部修改",
    recovery: "重新打开时留存",
    restore: "恢复历史版本",
  }[v.kind] ??
    v.kind);
export function History({
  versions,
  onRestore,
  onClose,
}: {
  versions: Version[];
  onRestore: (v: Version) => Promise<void>;
  onClose: () => void;
}) {
  const [to, setTo] = useState(versions.length - 1),
    [from, setFrom] = useState(Math.max(0, versions.length - 2)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const a = versions[from],
    b = versions[to];
  return (
    <Modal title="审美与偏好的变化" onClose={onClose} wide>
      <div className="history-layout">
        <div className="timeline">
          {[...versions].reverse().map((v, index) => {
            const i = versions.length - 1 - index;
            const differences = i
              ? diffNotes(versions[i - 1].note, v.note)
              : [];
            return (
              <button
                key={v.id}
                className={`version-card ${to === i ? "selected" : ""}`}
                onClick={() => {
                  setTo(i);
                  setFrom(Math.max(0, i - 1));
                }}
              >
                <strong>{versionName(v)}</strong>
                <span>{dateTime(v.at)}</span>
                <span>
                  {v.kind === "review" ? "确认当前品单" : i === 0
                    ? "从这里开始"
                    : differences.length
                      ? differences.slice(0, 2).join("；")
                      : "标记此刻的选择"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="comparison">
          {!b ? (
            <p className="muted">填写主题或条目后，会留下第一个版本。</p>
          ) : (
            <>
              <div className="form-row">
                <label>
                  从
                  <select
                    value={from}
                    onChange={(e) => setFrom(+e.target.value)}
                  >
                    {versions.map((v, i) => (
                      <option key={v.id} value={i}>
                        {dateTime(v.at)} · {versionName(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  到
                  <select value={to} onChange={(e) => setTo(+e.target.value)}>
                    {versions.map((v, i) => (
                      <option key={v.id} value={i}>
                        {dateTime(v.at)} · {versionName(v)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {b.kind === "edit" && b.label && (
                <section className="change-log" aria-label="更新日志">
                  <h3>更新日志</h3>
                  <p className="preserve">{b.label}</p>
                </section>
              )}
              <div className="diff-list">
                {diffNotes(a.note, b.note).length ? (
                  diffNotes(a.note, b.note).map((change, i) => (
                    <p key={i}>{change}</p>
                  ))
                ) : (
                  <p className="muted">{b.kind === "review" ? "已回顾确认当前品单，内容未更新。" : "两个版本的内容相同。"}</p>
                )}
              </div>
              <details>
                <summary>查看所选版本全文</summary>
                <h3>{b.note.title}</h3>
                <p className="preserve">{b.note.description}</p>
                {b.note.entries.map((e, i) => (
                  <div className="version-entry" key={e.id}>
                    <strong>
                      {b.note.ranked ? `${i + 1}. ` : ""}
                      {e.name}
                    </strong>
                    <p className="preserve">{e.reason}</p>
                  </div>
                ))}
              </details>
              {error && <p className="error">{error}</p>}
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onRestore(b);
                    onClose();
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                恢复所选版本
              </button>
              <p className="muted">
                恢复前会保留当前内容，既有历史不会被改写。
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function ShareDialog({
  note,
  invitation,
  onClose,
}: {
  note: Note;
  invitation: boolean;
  onClose: () => void;
}) {
  const [o, setO] = useState<ShareOptions>({
    selected: validEntries(note).map((e) => e.id),
    reasons: true,
    description: false,
    tags: false,
    date: false,
    invitation,
    message: "想知道你的答案：你会把哪些放进这份列表？",
  });
  const [pages, setPages] = useState<string[]>([]),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [rendering, setRendering] = useState(true);
  const change = (patch: Partial<ShareOptions>) => {
    setRendering(true);
    setO({ ...o, ...patch });
    setStatus("");
  };
  useEffect(() => {
    let live = true;
    setRendering(true);
    setError("");
    renderShare(note, o)
      .then((p) => {
        if (live) {
          setPages(p);
          setPage((i) => Math.min(i, p.length - 1));
        }
      })
      .catch((e) => {
        if (live) {
          setError(String(e));
          setPages([]);
        }
      })
      .finally(() => {
        if (live) setRendering(false);
      });
    return () => {
      live = false;
    };
  }, [note, o]);
  const act = async (copy: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (copy) {
        await copyPng(pages[page]);
        setStatus("当前页已复制");
      } else {
        const path = await exportPngs(pages);
        if (path) setStatus(`图片已保存：${path}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={invitation ? "邀请对方分享" : "分享我的选择"}
      onClose={onClose}
      wide
    >
      <div className="share-layout">
        <div className="share-controls form-stack">
          {invitation ? (
            <label>
              邀请语
              <textarea
                rows={4}
                value={o.message}
                onChange={(e) => change({ message: e.target.value })}
              />
            </label>
          ) : (
            <>
              <fieldset>
                <legend>分享内容</legend>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={o.reasons}
                    onChange={(e) => change({ reasons: e.target.checked })}
                  />
                  条目理由
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={o.tags}
                    onChange={(e) => change({ tags: e.target.checked })}
                  />
                  标签
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={o.date}
                    onChange={(e) => change({ date: e.target.checked })}
                  />
                  修改日期
                </label>
              </fieldset>
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={o.description}
              onChange={(e) => change({ description: e.target.checked })}
            />
            主题说明
          </label>
          {!invitation && (
            <fieldset>
              <legend>选择条目</legend>
              <button
                className="text-button"
                onClick={() =>
                  change({
                    selected:
                      o.selected.length === validEntries(note).length
                        ? []
                        : validEntries(note).map((e) => e.id),
                  })
                }
              >
                {o.selected.length === validEntries(note).length
                  ? "取消全选"
                  : "全选"}
              </button>
              <div className="share-selection">
                {validEntries(note).map((e, i) => (
                  <label className="check" key={e.id}>
                    <input
                      type="checkbox"
                      checked={o.selected.includes(e.id)}
                      onChange={(event) =>
                        change({
                          selected: event.target.checked
                            ? [...o.selected, e.id]
                            : o.selected.filter((id) => id !== e.id),
                        })
                      }
                    />
                    <span>
                      {note.ranked ? `${i + 1}. ` : ""}
                      {e.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <p className="muted">
            {invitation
              ? "这张邀请不会包含你的条目与理由。"
              : "只导出预览中的内容，长列表自动分页。"}
          </p>
          <button
            className="primary"
            disabled={
              busy ||
              rendering ||
              !pages.length ||
              (!invitation && !o.selected.length)
            }
            onClick={() => void act(false)}
          >
            保存全部图片{pages.length > 1 ? `（${pages.length} 张）` : ""}
          </button>
          <button
            disabled={
              busy ||
              rendering ||
              !pages.length ||
              (!invitation && !o.selected.length)
            }
            onClick={() => void act(true)}
          >
            复制当前页
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {status && (
            <p role="status" className="success">
              {status}
            </p>
          )}
        </div>
        <div className="share-preview">
          <div className="preview-nav">
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            <span>
              {page + 1} / {pages.length || 1}
            </span>
            <button
              disabled={page >= pages.length - 1}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
          <div className="image-scroll">
            {pages[page] && (
              <img
                className="share-image"
                src={pages[page]}
                alt={`${note.title}的${invitation ? "求分享" : "分享"}图片，第 ${page + 1} 页`}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
