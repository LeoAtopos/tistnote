import { tr, locale } from "./i18n";
import {
  useEffect,
  useState,
  type DragEvent,
  type Dispatch,
  type SetStateAction,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon } from "./components";
import {
  noteTree,
  groupMovePath,
  validEntries,
  needsReview,
  type NoteFolder,
  type RecordNote,
  type TreeItem,
} from "./model";

export function NoteTree({
  groups,
  records,
  currentId,
  currentGroup,
  compact,
  now,
  busy,
  query,
  tags,
  closed,
  setClosed,
  onFolder,
  onOpen,
  onMove,
}: {
  groups: string[];
  records: RecordNote[];
  currentId?: string;
  currentGroup: string | null;
  compact: boolean;
  now: number;
  busy: boolean;
  query: string;
  tags: string[];
  closed: Set<string>;
  setClosed: Dispatch<SetStateAction<Set<string>>>;
  onFolder: (path: string | null) => void;
  onOpen: (id: string) => void;
  onMove: (item: TreeItem, target: string) => void;
}) {
  const [dragging, setDragging] = useState<TreeItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const finishDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };
  const canDrop = (target: string) => {
    if (!dragging || busy) return false;
    if (dragging.type === "note") {
      const record = records.find((r) => r.note.id === dragging.id);
      return !!record && (record.group ?? "") !== target;
    }
    try {
      return groupMovePath(dragging.id, target) !== dragging.id;
    } catch {
      return false;
    }
  };
  const dragHandlers = (item: TreeItem) => ({
    draggable: !busy,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      if (busy) {
        event.preventDefault();
        return;
      }
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "application/x-tistnote-tree",
        JSON.stringify(item),
      );
      setDragging(item);
    },
    onDragEnd: finishDrag,
  });
  const dropHandlers = (target: string) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!dragging) return;
      event.stopPropagation();
      const allowed = canDrop(target);
      event.dataTransfer.dropEffect = allowed ? "move" : "none";
      if (allowed) event.preventDefault();
      setDropTarget(allowed ? target : null);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setDropTarget((previous) => (previous === target ? null : previous));
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      if (canDrop(target)) onMove(dragging, target);
      finishDrag();
    },
  });
  const selectedGroup =
    records.find((r) => r.note.id === currentId)?.group ?? "";
  const root = noteTree(groups, records, !!(query.trim() || tags.length));
  useEffect(() => {
    setClosed(
      (previous) =>
        new Set(
          [...previous].filter(
            (path) =>
              selectedGroup !== path && !selectedGroup.startsWith(`${path}/`),
          ),
        ),
    );
  }, [currentId, selectedGroup, setClosed]);
  useEffect(() => {
    if (query.trim() || tags.length) setClosed(new Set());
  }, [query, tags, setClosed]);
  const toggle = (path: string) =>
    setClosed((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const keyboard = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const keys = [
      "ArrowDown",
      "ArrowUp",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
    ];
    if (!keys.includes(event.key)) return;
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[role="treeitem"]',
    );
    if (!target) return;
    event.preventDefault();
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="treeitem"]',
      ),
    ];
    const index = items.indexOf(target);
    if (event.key === "ArrowDown")
      items[Math.min(index + 1, items.length - 1)]?.focus();
    if (event.key === "ArrowUp") items[Math.max(index - 1, 0)]?.focus();
    if (event.key === "Home") items[0]?.focus();
    if (event.key === "End") items.at(-1)?.focus();
    const path = target.dataset.folder;
    if (event.key === "ArrowRight" && path) {
      if (closed.has(path)) toggle(path);
      else
        target.parentElement
          ?.querySelector<HTMLButtonElement>('[role="group"] [role="treeitem"]')
          ?.focus();
    }
    if (event.key === "ArrowLeft") {
      if (path && !closed.has(path)) toggle(path);
      else
        target
          .closest('[role="group"]')
          ?.parentElement?.querySelector<HTMLButtonElement>(
            ':scope > [role="treeitem"]',
          )
          ?.focus();
    }
  };
  const branch = (folder: NoteFolder, level: number): ReactNode => (
    <>
      {folder.folders.map((child) => {
        const expanded = !closed.has(child.path);
        return (
          <li key={child.path} role="none" className="tree-folder">
            <button
              type="button"
              role="treeitem"
              tabIndex={-1}
              aria-label={tr("分组 {0}", child.path)}
              aria-level={level}
              aria-expanded={expanded}
              data-folder={child.path}
              data-create-in={child.path}
              className={`tree-folder-button ${currentGroup === child.path ? "active" : ""} ${dropTarget === child.path ? "tree-drop-target" : ""}`}
              disabled={busy}
              {...dragHandlers({ type: "group", id: child.path })}
              {...dropHandlers(child.path)}
              onClick={() => {
                onFolder(child.path);
                toggle(child.path);
              }}
            >
              <span className={`tree-chevron ${expanded ? "expanded" : ""}`}>
                <Icon name="arrow" />
              </span>
              <Icon name="folder" />
              <span className="tree-name">{child.name}</span>
            </button>
            {expanded && (
              <ul className="tree-children" role="group">
                {branch(child, level + 1)}
              </ul>
            )}
          </li>
        );
      })}
      {folder.notes.map(({ note }) => (
        <li key={note.id} role="none">
          <button
            type="button"
            role="treeitem"
            tabIndex={-1}
            aria-level={level}
            aria-selected={currentId === note.id}
            data-create-in={folder.path}
            className={`note-card tree-note ${currentId === note.id ? "selected" : ""}`}
            disabled={busy}
            {...dragHandlers({ type: "note", id: note.id })}
            {...dropHandlers(folder.path)}
            onClick={() => onOpen(note.id)}
          >
            <div className="note-card-heading">
              <Icon name="file" />
              <h2>{note.title}</h2>
              {needsReview(note, now) && (
                <span className="review-dot" role="img" aria-label={tr("需要回顾")} title={tr("需要回顾")} />
              )}
              {compact && !validEntries(note).length && (
                <span className="empty-mark">{tr("（空）")}</span>
              )}
            </div>
            {!compact && (
              <>
                <p>
                  {validEntries(note)
                    .slice(0, 2)
                    .map((entry) => entry.name)
                    .join(" · ") || tr("还没有填写条目")}
                </p>
                <div className="note-card-foot">
                  <span>{note.tags[0] ?? tr("未分类")}</span>
                  <time>
                    {new Date(note.updatedAt).toLocaleDateString(locale(), {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </time>
                </div>
              </>
            )}
          </button>
        </li>
      ))}
    </>
  );
  return (
    <div
      className={`note-list file-tree ${compact ? "compact" : ""} ${dragging ? "tree-dragging" : ""}`}
    >
      <ul
        role="tree"
        aria-label={tr("笔记文件树")}
        tabIndex={0}
        onKeyDown={keyboard}
        onFocus={(event) => {
          if (event.target === event.currentTarget)
            (
              event.currentTarget.querySelector<HTMLButtonElement>(
                '[aria-selected="true"]',
              ) ??
              event.currentTarget.querySelector<HTMLButtonElement>(
                '[role="treeitem"]',
              )
            )?.focus();
        }}
      >
        {branch(root, 1)}
      </ul>
      {dragging && (
        <div
          className={`tree-drop-root ${dropTarget === "" ? "tree-drop-target" : ""}`}
          role="region"
          aria-label={tr("根目录拖放区")}
          {...dropHandlers("")}
        >
          <Icon name="folder" />{tr("移到根目录")}</div>
      )}
    </div>
  );
}
