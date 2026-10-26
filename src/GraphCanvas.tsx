import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { zoomGraph, type GraphPoint } from "./template-graph";
import { tr } from "./i18n";
import { Icon } from "./components";
import type { CanvasBranch, CanvasNode } from "./canvas-graph";

export function GraphCanvas({ branches, nodes, rootLabel, label, emptyLabel, legend, selectedId, onSelect, renderCard, busy = false, className = "", emptyNodeLabel = tr("空") }: {
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
}) {
  const host = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 650 });
  const [view, setView] = useState({ x: 450, y: 325, scale: 0.6 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const signature = JSON.stringify([branches.map(b => [b.id, b.parent]), nodes.map(n => [n.key, n.parent])]);
  const points = useRef(new Map<number, GraphPoint>());
  const gesture = useRef({ center: { x: 0, y: 0 }, distance: 0, start: { x: 0, y: 0 }, moved: false, node: null as string | null });
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
    if (busy || event.button !== 0 || (event.target as HTMLElement).closest("[data-canvas-ui]")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    points.current.set(event.pointerId, { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    const { center, distance } = metrics();
    const node = (event.target as HTMLElement).closest<HTMLElement>("[data-canvas-node]");
    if (points.current.size === 1) {
      gesture.current = { center, distance, start: center, moved: false, node: node?.dataset.canvasNode ?? null };
      clickOrigin.current = node;
      if (!node) onSelect(null);
    } else { gesture.current.moved = true; gesture.current.node = null; gesture.current.center = center; gesture.current.distance = distance; }
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
    if (event.type === "pointerup" && !gestureEnd.moved && gestureEnd.node) onSelect(gestureEnd.node);
  }
  const screen = (p: GraphPoint) => ({ x: p.x * view.scale + view.x, y: p.y * view.scale + view.y });
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
  return <div ref={host} className={`template-canvas ${className} ${dragging ? "is-dragging" : ""}`} tabIndex={0} role="region" aria-label={label} aria-description={tr("方向键移动，+/- 缩放，0 居中，Esc 关闭详情。")} title={tr("拖拽移动，滚轮或双指缩放。")}
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
    {branches.length || nodes.length ? <span className="graph-root" style={{ left: view.x, top: view.y }}>{rootLabel}</span>
      : <p className="graph-empty">{emptyLabel}</p>}
    {branches.map(branch => {
      const p = screen(branch);
      return <span key={branch.id} className="graph-tag" data-graph-branch={branch.id} data-parent={branch.parent ?? "root"} style={{ left: p.x, top: p.y }}>{branch.title}</span>;
    })}
    {nodes.map(node => {
      const p = screen(node);
      return <button key={node.key} disabled={busy} className={`graph-node ${node.filled ? "covered" : ""} ${selectedId === node.id ? "selected" : ""}`} data-canvas-node={node.id} data-graph-node={node.key} data-parent={node.parent ?? "root"}
        style={{ left: p.x, top: p.y }} aria-label={tr("{0} · {1}", node.title, node.due ? tr("需要回顾") : node.filled ? tr("有品") : emptyNodeLabel)} aria-description={node.description} aria-haspopup={renderCard ? "dialog" : undefined}
        onPointerEnter={() => { if (!points.current.size) setHovered(node.key); }} onPointerLeave={() => setHovered(null)}
        onFocus={() => {
          setHovered(node.key);
          if (p.x < 32 || p.x > size.width - 32 || p.y < 32 || p.y > size.height - 32) setView(v => ({ ...v, x: size.width / 2 - node.x * v.scale, y: size.height / 2 - node.y * v.scale }));
        }} onBlur={() => setHovered(null)}
        onClick={event => { if (event.detail === 0) { clickOrigin.current = event.currentTarget; onSelect(node.id); } }}>
        <span className="graph-dot">{node.due && <i className="graph-review-dot" />}</span>
        {hovered === node.key && !dragging && <span className="graph-tooltip" style={{ left: p.x > size.width / 2 ? "auto" : 36, right: p.x > size.width / 2 ? 36 : "auto", maxWidth: Math.min(280, Math.max(100, (p.x > size.width / 2 ? p.x : size.width - p.x) - 36)), top: p.y > size.height - 80 ? "auto" : 4, bottom: p.y > size.height - 80 ? 36 : "auto" }}>{node.title}</span>}
      </button>;
    })}
    <div className="graph-legend" data-canvas-ui="true">{legend}</div>
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
