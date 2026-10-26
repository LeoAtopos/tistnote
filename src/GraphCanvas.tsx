import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { zoomGraph, type GraphPoint } from "./template-graph";
import { tr } from "./i18n";
import { Icon } from "./components";
import type { CanvasBranch, CanvasNode } from "./canvas-graph";
import { canvasKeys, type CanvasArrangement } from "./canvas-layout";

export function GraphCanvas({ branches, nodes, rootLabel, label, emptyLabel, legend, selectedId, onSelect, renderCard, busy = false, className = "", emptyNodeLabel = tr("空"), onArrange, onFolder }: {
  branches: CanvasBranch[];
  nodes: CanvasNode[];
  rootLabel: string;
  label: string;
  emptyLabel: string;
  legend: ReactNode;
  selectedId?: string;
  onSelect: (id: string | null) => void;
  renderCard?: (id: string) => ReactNode;
  busy?: boolean;
  className?: string;
  emptyNodeLabel?: string;
  onArrange?: (change: CanvasArrangement) => Promise<void>;
  onFolder?: (path: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 650 });
  const [view, setView] = useState({ x: 450, y: 325, scale: 0.6 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [itemDrag, setItemDrag] = useState<{ key: string; delta: GraphPoint } | null>(null);
  const [drop, setDrop] = useState<{ key: string; mode: "into" | "before" | "after"; valid: boolean; hint: string } | null>(null);
  const dropRef = useRef(drop);
  const committing = useRef(false);
  const signature = JSON.stringify([branches.map(b => [b.id, b.parent]), nodes.map(n => [n.key, n.parent])]);
  const points = useRef(new Map<number, GraphPoint>());
  const gesture = useRef({ center: { x: 0, y: 0 }, distance: 0, start: { x: 0, y: 0 }, moved: false, node: null as string | null, item: null as string | null, delta: { x: 0, y: 0 } });
  const clickOrigin = useRef<HTMLElement | null>(null);
  const defaultView = () => {
    const all = [...branches, ...nodes];
    const width = Math.max(700, ...all.map(p => Math.abs(p.x) * 2 + 100));
    const height = Math.max(600, ...all.map(p => Math.abs(p.y) * 2 + 100));
    return { x: size.width / 2, y: size.height / 2, scale: size.width < 640 ? 0.55 : Math.max(0.45, Math.min(1, (size.width - 100) / width, (size.height - 100) / height)) };
  };
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setView(defaultView()); setHovered(null); }, [size.width, size.height, signature]);
  useEffect(() => {
    const element = host.current!;
    const wheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest("[data-canvas-ui]")) return;
      event.preventDefault();
      if (points.current.size) return;
      const bounds = element.getBoundingClientRect();
      setView(v => zoomGraph(v, { x: event.clientX - bounds.left, y: event.clientY - bounds.top }, Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.035 : 0.0015))));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    if (selectedId && renderCard) popup.current?.focus({ preventScroll: true });
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId || !renderCard) return;
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("dialog")) return;
      if (!popup.current?.contains(target) && !target.closest("[data-canvas-node]")) onSelect(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [selectedId, onSelect, renderCard]);
  function close() {
    onSelect(null);
    clickOrigin.current?.focus({ preventScroll: true });
  }
  function metrics() {
    const p = [...points.current.values()];
    return { center: { x: p.reduce((sum, v) => sum + v.x, 0) / p.length, y: p.reduce((sum, v) => sum + v.y, 0) / p.length }, distance: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (busy || committing.current || event.button !== 0 || (event.target as HTMLElement).closest("[data-canvas-ui]")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    points.current.set(event.pointerId, { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    const { center, distance } = metrics();
    const node = (event.target as HTMLElement).closest<HTMLElement>("[data-canvas-node]");
    const item = onArrange ? (event.target as HTMLElement).closest<HTMLElement>("[data-canvas-item]") : null;
    if (points.current.size === 1) {
      gesture.current = { center, distance, start: center, moved: false, node: node?.dataset.canvasNode ?? null, item: item?.dataset.canvasItem ?? null, delta: { x: 0, y: 0 } };
      clickOrigin.current = node;
      if (!node) onSelect(null);
    } else {
      gesture.current.moved = true; gesture.current.node = null; gesture.current.item = null;
      gesture.current.center = center; gesture.current.distance = distance;
      setItemDrag(null); setDrop(null); dropRef.current = null;
    }
    setHovered(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!points.current.has(event.pointerId)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    points.current.set(event.pointerId, { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    const { center, distance } = metrics();
    const previous = gesture.current;
    if (!previous.moved && Math.hypot(center.x - previous.start.x, center.y - previous.start.y) < 5) return;
    previous.moved = true;
    setDragging(true);
    onSelect(null);
    if (previous.item && points.current.size === 1 && onArrange) {
      const delta = { x: (center.x - previous.start.x) / view.scale, y: (center.y - previous.start.y) / view.scale };
      previous.delta = delta;
      setItemDrag({ key: previous.item, delta });
      let target: HTMLElement | null = null;
      for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
        const candidate = element.closest<HTMLElement>("[data-canvas-drop]");
        if (candidate && candidate.dataset.canvasDrop !== previous.item) { target = candidate; break; }
      }
      let next: typeof drop = null;
      if (target) {
        const key = target.dataset.canvasDrop!;
        const source = branches.find(b => b.id === previous.item) ?? nodes.find(n => n.key === previous.item);
        const destination = branches.find(b => b.id === key);
        const rectangle = target.getBoundingClientRect();
        const fraction = (event.clientY - rectangle.top) / rectangle.height;
        const mode = previous.item.startsWith("group:") && source && destination && source.parent === destination.parent
          ? fraction < 0.25 ? "before" : fraction > 0.75 ? "after" : "into" : "into";
        const descendant = canvasKeys({ branches, nodes }, previous.item).has(key);
        const valid = !descendant && !!source && (mode !== "into" || source.parent !== (key === "root" ? null : key));
        const title = destination?.title ?? rootLabel;
        next = { key, mode, valid, hint: descendant ? tr("不能移入自身或子分组") : !valid ? tr("已经在这个分组中") : tr(mode === "before" ? "排在“{0}”之前" : mode === "after" ? "排在“{0}”之后" : "移入“{0}”", title) };
      }
      setDrop(next); dropRef.current = next;
      return;
    }
    setView(v => {
      const zoomed = previous.distance && distance ? zoomGraph(v, previous.center, distance / previous.distance) : v;
      return { ...zoomed, x: zoomed.x + center.x - previous.center.x, y: zoomed.y + center.y - previous.center.y };
    });
    gesture.current = { ...previous, center, distance };
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    if (!points.current.has(event.pointerId)) return;
    const gestureEnd = gesture.current;
    points.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (points.current.size) { Object.assign(gesture.current, metrics(), { moved: true }); return; }
    setDragging(false);
    const target = dropRef.current;
    dropRef.current = null;
    if (event.type === "pointerup" && gestureEnd.moved && gestureEnd.item && onArrange && (!target || target.valid)) {
      committing.current = true;
      void onArrange({ key: gestureEnd.item, delta: gestureEnd.delta, target: target ? { key: target.key, mode: target.mode } : undefined })
        .finally(() => { committing.current = false; setItemDrag(null); setDrop(null); });
    } else {
      setItemDrag(null); setDrop(null);
      if (event.type === "pointerup" && !gestureEnd.moved) {
        if (gestureEnd.node) onSelect(gestureEnd.node);
        else if (gestureEnd.item?.startsWith("group:")) onFolder?.(gestureEnd.item.slice(6));
      }
    }
  }
  const affected = itemDrag ? canvasKeys({ branches, nodes }, itemDrag.key) : new Set<string>();
  const screen = (p: GraphPoint & { id?: string; key?: string }) => ({
    x: (p.x + (affected.has(p.key ?? p.id ?? "") ? itemDrag!.delta.x : 0)) * view.scale + view.x,
    y: (p.y + (affected.has(p.key ?? p.id ?? "") ? itemDrag!.delta.y : 0)) * view.scale + view.y,
  });
  const dropClass = (key: string) => drop?.key === key ? ` drop-${drop.mode} ${drop.valid ? "drop-valid" : "drop-invalid"}` : "";
  const moveKeys = (event: React.KeyboardEvent<HTMLElement>, key: string) => {
    if (!onArrange || busy || !event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const branch = branches.find(b => b.id === key);
    const siblings = branch ? branches.filter(b => b.parent === branch.parent) : [];
    const target = siblings[siblings.findIndex(b => b.id === key) + (event.key === "ArrowUp" ? -1 : 1)];
    if (event.shiftKey && branch && ["ArrowUp", "ArrowDown"].includes(event.key)) {
      if (target) void onArrange({ key, delta: { x: 0, y: 0 }, target: { key: target.id, mode: event.key === "ArrowUp" ? "before" : "after" } });
    } else void onArrange({ key, delta: { x: event.key === "ArrowLeft" ? -20 : event.key === "ArrowRight" ? 20 : 0, y: event.key === "ArrowUp" ? -20 : event.key === "ArrowDown" ? 20 : 0 } });
  };
  const selectedNode = nodes.find(n => n.id === selectedId && n.key === clickOrigin.current?.dataset.graphNode)
    ?? nodes.find(n => n.id === selectedId);
  const anchor = selectedNode ? screen(selectedNode) : { x: size.width / 2, y: size.height / 2 };
  const cardWidth = Math.min(360, size.width - 24);
  const cardLeft = Math.max(12, Math.min(size.width - cardWidth - 12, anchor.x + 24));
  const cardTop = Math.max(16, Math.min(size.height - 360, anchor.y - 120));
  const activeBranches = new Set<string>();
  for (const node of nodes.filter(n => n.key === hovered || n.id === selectedId)) {
    let parent = node.parent;
    while (parent && !activeBranches.has(parent)) { activeBranches.add(parent); parent = branches.find(b => b.id === parent)?.parent ?? null; }
  }
  const centerZoom = (factor: number) => setView(v => zoomGraph(v, { x: size.width / 2, y: size.height / 2 }, factor));
  return <div ref={host} className={`template-canvas ${className} ${dragging ? "is-dragging" : ""}`} tabIndex={0} role="region" aria-label={label} aria-description={tr(onArrange ? "方向键平移画布，+/- 缩放，0 居中。聚焦笔记或分组后，Alt 加方向键调整位置，Alt+Shift 加上下键调整同级分组顺序。" : "方向键移动，+/- 缩放，0 居中，Esc 关闭详情。")} title={tr(onArrange ? "拖动笔记或分组调整位置；拖到分组中间移入，拖到同级分组上沿或下沿排序。空白处拖动平移，滚轮或双指缩放。" : "拖拽移动，滚轮或双指缩放。")}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
    onKeyDown={event => {
      if (event.key === "Escape" && selectedId && renderCard) { event.stopPropagation(); close(); return; }
      if (event.target !== event.currentTarget) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.key === "0") setView(defaultView());
        else if (["+", "=", "-"].includes(event.key)) centerZoom(event.key === "-" ? 0.8 : 1.25);
        else setView(v => ({ ...v, x: v.x + (event.key === "ArrowLeft" ? 80 : event.key === "ArrowRight" ? -80 : 0), y: v.y + (event.key === "ArrowUp" ? 80 : event.key === "ArrowDown" ? -80 : 0) }));
      }
    }}>
    <svg className="template-branches" width={size.width} height={size.height} aria-hidden="true">
      {([...branches, ...nodes] as (CanvasBranch | CanvasNode)[]).map(item => {
        const parent = branches.find(b => b.id === item.parent);
        const from = parent ? screen(parent) : { x: view.x, y: view.y };
        const end = screen(item);
        const active = "key" in item ? item.key === hovered || item.id === selectedId : activeBranches.has(item.id);
        return <path key={"key" in item ? item.key : item.id} className={active ? "active" : ""} d={`M ${from.x} ${from.y} Q ${from.x + (end.x - from.x) * 0.8} ${from.y} ${end.x} ${end.y}`} />;
      })}
    </svg>
    {branches.length || nodes.length ? <span className={`graph-root${dropClass("root")}`} data-create-in={onArrange ? "" : undefined} data-canvas-drop={onArrange ? "root" : undefined} style={{ left: view.x, top: view.y }}>{rootLabel}</span>
      : <p className="graph-empty">{emptyLabel}</p>}
    {branches.map(branch => {
      const p = screen(branch);
      return onArrange ? <button key={branch.id} className={`graph-tag graph-group${dropClass(branch.id)}`} data-graph-branch={branch.id} data-canvas-item={branch.id} data-canvas-drop={branch.id} data-create-in={branch.id.slice(6)} data-parent={branch.parent ?? "root"}
        style={{ left: p.x, top: p.y }} disabled={busy} aria-label={tr("分组 {0}", branch.title)} onClick={event => { if (event.detail === 0) onFolder?.(branch.id.slice(6)); }} onKeyDown={event => moveKeys(event, branch.id)}
        onFocus={() => { if (p.x < 90 || p.x > size.width - 90 || p.y < 32 || p.y > size.height - 32) setView(v => ({ ...v, x: size.width / 2 - branch.x * v.scale, y: size.height / 2 - branch.y * v.scale })); }}>{branch.title}</button>
        : <span key={branch.id} className="graph-tag" data-graph-branch={branch.id} data-parent={branch.parent ?? "root"} style={{ left: p.x, top: p.y }}>{branch.title}</span>;
    })}
    {nodes.map(node => {
      const p = screen(node);
      return <button key={node.key} disabled={busy} className={`graph-node ${node.filled ? "covered" : ""} ${selectedId === node.id ? "selected" : ""}`} data-canvas-node={node.id} data-graph-node={node.key} data-parent={node.parent ?? "root"} data-canvas-item={onArrange ? node.key : undefined} data-create-in={onArrange ? node.description ?? "" : undefined}
        style={{ left: p.x, top: p.y }} aria-label={tr("{0} · {1}", node.title, node.due ? tr("需要回顾") : node.filled ? tr("有品") : emptyNodeLabel)} aria-description={node.description} aria-haspopup={renderCard ? "dialog" : undefined}
        onPointerEnter={() => { if (!points.current.size) setHovered(node.key); }} onPointerLeave={() => setHovered(null)}
        onFocus={() => {
          setHovered(node.key);
          if (p.x < 32 || p.x > size.width - 32 || p.y < 32 || p.y > size.height - 32) setView(v => ({ ...v, x: size.width / 2 - node.x * v.scale, y: size.height / 2 - node.y * v.scale }));
        }} onBlur={() => setHovered(null)}
        onClick={event => { if (event.detail === 0) { clickOrigin.current = event.currentTarget; onSelect(node.id); } }} onKeyDown={event => moveKeys(event, node.key)}>
        <span className="graph-dot">{node.due && <i className="graph-review-dot" />}</span>
        {hovered === node.key && !dragging && <span className="graph-tooltip" style={{ left: p.x > size.width / 2 ? "auto" : 36, right: p.x > size.width / 2 ? 36 : "auto", maxWidth: Math.min(280, Math.max(100, (p.x > size.width / 2 ? p.x : size.width - p.x) - 36)), top: p.y > size.height - 80 ? "auto" : 4, bottom: p.y > size.height - 80 ? 36 : "auto" }}>{node.title}</span>}
      </button>;
    })}
    <div className="graph-legend" data-canvas-ui="true">{legend}</div>
    {itemDrag && <p className={`graph-drag-status ${drop && !drop.valid ? "error" : ""}`} role="status">{drop?.hint ?? tr("调整画布位置")}</p>}
    <div className="graph-controls" data-canvas-ui="true">
      <button aria-label={tr("缩小画布")} onClick={() => centerZoom(0.8)} disabled={view.scale <= 0.35}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14" /></svg></button>
      <output aria-label={tr("画布缩放")}>{Math.round(view.scale * 100)}%</output>
      <button aria-label={tr("放大画布")} onClick={() => centerZoom(1.25)} disabled={view.scale >= 2.5}><Icon name="plus" /></button>
      <button onClick={() => { setView(defaultView()); onSelect(null); }}>{tr("居中")}</button>
    </div>
    {selectedNode && renderCard && <div ref={popup} className="graph-popup" data-canvas-ui="true" tabIndex={-1} role="dialog" aria-label={selectedNode.title}
      style={{ width: cardWidth, left: cardLeft, top: cardTop, maxHeight: size.height - cardTop - 72 }}>
      <button className="icon-button graph-popup-close" aria-label={tr("关闭模板详情")} onClick={close}><Icon name="close" /></button>
      {renderCard(selectedNode.id)}
    </div>}
  </div>;
}
