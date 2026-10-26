import { tr, locale } from "./i18n";
import { language } from "./preferences";
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
    <article className="editor-page note-reading" aria-label={tr("笔记内容")}>
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
        <p className="reading-empty">{tr("还没有填写条目")}</p>
      )}
      <div className="review-summary" aria-label={tr("回顾状态")}>
        <span>
          {needsReview(note, now) ? tr("需要回顾") : tr("下次回顾")} · {due ? (
            <time dateTime={due.toISOString()} title={due.toLocaleString(locale())}>
              {reviewTimeLabel(due.getTime(), now, needsReview(note, now))}
            </time>
          ) : tr("日期未知")}
        </span>
        <span>{tr("上次回顾 ·")}{note.lastReviewedAt ? (
            <time dateTime={note.lastReviewedAt} title={new Date(note.lastReviewedAt).toLocaleString(locale())}>
              {reviewTimeLabel(Date.parse(note.lastReviewedAt), now)}
            </time>
          ) : tr("尚未确认")}
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
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
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
      className={`modal ${wide ? "wide" : ""} ${className}`}
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
          aria-label={tr("关闭对话框")}
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
    <Modal title={tr("编辑模板")} onClose={onClose}>
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
        <label>{tr("主题")}<input
            required
            value={t.title}
            onChange={(e) => setT({ ...t, title: e.target.value })}
          />
        </label>
        <label>{tr("说明")}<textarea
            value={t.description}
            onChange={(e) => setT({ ...t, description: e.target.value })}
          />
        </label>
        <label>{tr("填写提示")}<textarea
            value={t.hint}
            onChange={(e) => setT({ ...t, hint: e.target.value })}
          />
        </label>
        <label>{tr("标签")}<input
            value={tags}
            placeholder={tr("用逗号分隔")}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>{tr("列表模式")}<select
              value={String(t.ranked)}
              onChange={(e) =>
                setT({ ...t, ranked: e.target.value === "true" })
              }
            >
              <option value="true">{tr("有排名")}</option>
              <option value="false">{tr("无排名")}</option>
            </select>
          </label>
          <label>{tr("建议条目数")}<input
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
        <p className="muted">{tr("模板只保留主题与结构，不包含你的列表答案。")}</p>
        {error && (
          <p role="alert" className="error">
            {tr(error)}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>{tr("取消")}</button>
          <button className="primary" disabled={busy}>{tr("保存模板")}</button>
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
  new Date(s).toLocaleString(locale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
export const versionName = (v: Version) =>
  (v.label ? (["edit", "milestone"].includes(v.kind) ? v.label : tr(v.label)) : "") ||
  ({
    initial: tr("初始版本"),
    auto: tr("自动版本"),
    edit: tr("笔记更新"),
    review: tr("回顾确认"),
    milestone: tr("审美里程碑"),
    external: tr("外部修改"),
    recovery: tr("重新打开时留存"),
    restore: tr("恢复历史版本"),
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
    <Modal title={tr("审美与偏好的变化")} onClose={onClose} wide>
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
                  {v.kind === "review" ? tr("确认当前品单") : i === 0
                    ? tr("从这里开始")
                    : differences.length
                      ? differences.slice(0, 2).join("；")
                      : tr("标记此刻的选择")}
                </span>
              </button>
            );
          })}
        </div>
        <div className="comparison">
          {!b ? (
            <p className="muted">{tr("填写主题或条目后，会留下第一个版本。")}</p>
          ) : (
            <>
              <div className="form-row">
                <label>{tr("从")}<select
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
                <label>{tr("到")}<select value={to} onChange={(e) => setTo(+e.target.value)}>
                    {versions.map((v, i) => (
                      <option key={v.id} value={i}>
                        {dateTime(v.at)} · {versionName(v)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {b.kind === "edit" && b.label && (
                <section className="change-log" aria-label={tr("更新日志")}>
                  <h3>{tr("更新日志")}</h3>
                  <p className="preserve">{b.label}</p>
                </section>
              )}
              <div className="diff-list">
                {diffNotes(a.note, b.note).length ? (
                  diffNotes(a.note, b.note).map((change, i) => (
                    <p key={i}>{change}</p>
                  ))
                ) : (
                  <p className="muted">{b.kind === "review" ? tr("已回顾确认当前品单，内容未更新。") : tr("两个版本的内容相同。")}</p>
                )}
              </div>
              <details>
                <summary>{tr("查看所选版本全文")}</summary>
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
              {error && <p className="error">{tr(error)}</p>}
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
              >{tr("恢复所选版本")}</button>
              <p className="muted">{tr("恢复前会保留当前内容，既有历史不会被改写。")}</p>
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
  const uiLanguage = language();
  const [o, setO] = useState<ShareOptions>({
    selected: validEntries(note).map((e) => e.id),
    reasons: true,
    description: false,
    tags: false,
    date: false,
    invitation,
    message: tr("想知道你的答案：你会把哪些放进这份列表？"),
    signature: "",
    format: "long",
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
  }, [note, o, uiLanguage]);
  const act = async (copy: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (copy) {
        await copyPng(pages[page]);
        setStatus(tr("已复制到剪切板"));
      } else {
        const path = await exportPngs(pages);
        if (path) setStatus(tr("图片已保存：{0}", path));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={invitation ? tr("求品") : tr("展品")}
      onClose={onClose}
      wide
    >
      <div className="share-layout">
        <div className="share-controls form-stack">
          <label>{tr("署名（选填）")}<input
              aria-label={tr("署名（选填）")}
              autoComplete="off"
              maxLength={40}
              placeholder={tr("你的名字或昵称，留空匿名")}
              value={o.signature}
              onChange={(event) => change({ signature: event.target.value })}
            />
          </label>
          <label>{tr("图片形式")}<select aria-label={tr("图片形式")} value={o.format}
              onChange={event => { setPage(0); change({ format: event.target.value as ShareOptions["format"] }); }}>
              <option value="long">{tr("一张长图")}</option>
              <option value="pages">{tr("分页图片")}</option>
            </select>
          </label>
          {invitation ? (
            <label>{tr("邀请语")}<textarea
                rows={4}
                value={o.message}
                onChange={(e) => change({ message: e.target.value })}
              />
            </label>
          ) : (
            <>
              <fieldset>
                <legend>{tr("展品内容")}</legend>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={o.reasons}
                    onChange={(e) => change({ reasons: e.target.checked })}
                  />{tr("条目理由")}</label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={o.tags}
                    onChange={(e) => change({ tags: e.target.checked })}
                  />{tr("标签")}</label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={o.date}
                    onChange={(e) => change({ date: e.target.checked })}
                  />{tr("修改日期")}</label>
              </fieldset>
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={o.description}
              onChange={(e) => change({ description: e.target.checked })}
            />{tr("主题说明")}</label>
          {!invitation && (
            <fieldset>
              <legend>{tr("选择条目")}</legend>
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
                  ? tr("取消全选")
                  : tr("全选")}
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
              ? tr("这张邀请不会包含你的条目与理由。")
              : o.format === "long" ? tr("只导出预览中的内容，长列表生成一张长图。") : tr("只导出预览中的内容，长列表自动分页。")}
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
            {o.format === "long" ? tr("保存图片") : tr("保存全部图片{0}", pages.length > 1 ? tr("（{0} 张）", pages.length) : "")}
          </button>
          <button
            disabled={
              busy ||
              rendering ||
              !pages.length ||
              (!invitation && !o.selected.length)
            }
            onClick={() => void act(true)}
          >{tr("复制到剪切板")}</button>
          {error && (
            <p className="error" role="alert">
              {tr(error)}
            </p>
          )}
          {status && (
            <p role="status" className="success">
              {tr(status)}
            </p>
          )}
        </div>
        <div className="share-preview">
          {o.format === "pages" && <div className="preview-nav">
            <button disabled={!page} onClick={() => setPage(page - 1)}>{tr("上一页")}</button>
            <span>
              {page + 1} / {pages.length || 1}
            </span>
            <button
              disabled={page >= pages.length - 1}
              onClick={() => setPage(page + 1)}
            >{tr("下一页")}</button>
          </div>}
          <div className="image-scroll">
            {pages[page] && (
              <img
                className="share-image"
                src={pages[page]}
                alt={tr("{0}的{1}{2}", note.title, invitation ? tr("求品") : tr("展品"), o.format === "long" ? tr("长图") : tr("图片，第 {0} 页", page + 1))}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
