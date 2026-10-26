import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent } from "react";
import type { Template } from "./model";
import { templateGraph, zoomGraph, type GraphPoint } from "./template-graph";
import { tr } from "./i18n";
import { Icon } from "./components";

export function TemplateCanvas({ templates, covered, selected, onSelect, renderCard }: {
  templates: Template[];
  covered: { has(id: string): boolean };
  selected: Template | null;
  onSelect: (template: Template | null) => void;
  renderCard: (template: Template) => ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 650 });
  const [view, setView] = useState({ x: 450, y: 325, scale: 0.6 });
  const [hovered, setHovered] = useState<string | null>(null);
  const nodeKey = (tag: string, id: string) => JSON.stringify([tag, id]);
  const [dragging, setDragging] = useState(false);
  const graph = useMemo(() => templateGraph(templates, tr("未分类")), [templates]);
  const signature = JSON.stringify(graph.map(g => [g.tag, ...g.nodes.map(n => n.template.id)]));
  const points = useRef(new Map<number, GraphPoint>());
  const gesture = useRef({ center: { x: 0, y: 0 }, distance: 0, start: { x: 0, y: 0 }, moved: false, node: null as string | null });
  const clickOrigin = useRef<HTMLElement | null>(null);
  const defaultView = () => ({ x: size.width / 2, y: size.height / 2, scale: size.width < 640 ? 0.55 : Math.max(0.45, Math.min(1, (size.width - 100) / 1260, (size.height - 100) / 880)) });
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
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
    if (selected) popup.current?.focus({ preventScroll: true });
  }, [selected?.id]);
  useEffect(() => {
    if (!selected) return;
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("dialog")) return;
      if (!popup.current?.contains(target) && !target.closest("[data-template-node]")) onSelect(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [selected, onSelect]);
  function close() {
    onSelect(null);
    clickOrigin.current?.focus({ preventScroll: true });
  }
  function metrics() {
    const p = [...points.current.values()];
    return { center: { x: p.reduce((sum, v) => sum + v.x, 0) / p.length, y: p.reduce((sum, v) => sum + v.y, 0) / p.length }, distance: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-canvas-ui]")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    points.current.set(event.pointerId, { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    const { center, distance } = metrics();
    const node = (event.target as HTMLElement).closest<HTMLElement>("[data-template-node]");
    if (points.current.size === 1) {
      gesture.current = { center, distance, start: center, moved: false, node: node?.dataset.templateNode ?? null };
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
    if (event.type === "pointerup" && !gestureEnd.moved && gestureEnd.node) onSelect(templates.find(t => t.id === gestureEnd.node) ?? null);
  }
  const screen = (p: GraphPoint) => ({ x: p.x * view.scale + view.x, y: p.y * view.scale + view.y });
  const allNodes = graph.flatMap(g => g.nodes.map(n => ({ ...n, key: nodeKey(g.tag, n.template.id) })));
  const selectedNode = allNodes.find(n => n.template.id === selected?.id && n.key === clickOrigin.current?.dataset.graphNode)
    ?? allNodes.find(n => n.template.id === selected?.id);
  const anchor = selectedNode ? screen(selectedNode) : { x: size.width / 2, y: size.height / 2 };
  const cardWidth = Math.min(360, size.width - 24);
  const cardLeft = Math.max(12, Math.min(size.width - cardWidth - 12, anchor.x + 24));
  const cardTop = Math.max(16, Math.min(size.height - 360, anchor.y - 120));
  const centerZoom = (factor: number) => setView(v => zoomGraph(v, { x: size.width / 2, y: size.height / 2 }, factor));
  return <div ref={host} className={`template-canvas ${dragging ? "is-dragging" : ""}`} tabIndex={0} role="region" aria-label={tr("模板库画布")} aria-description={tr("方向键移动，+/- 缩放，0 居中，Esc 关闭详情。")} title={tr("拖拽移动，滚轮或双指缩放。")}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
    onKeyDown={event => {
      if (event.key === "Escape" && selected) { event.stopPropagation(); close(); return; }
      if (event.target !== event.currentTarget) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.key === "0") setView(defaultView());
        else if (["+", "=", "-"].includes(event.key)) centerZoom(event.key === "-" ? 0.8 : 1.25);
        else setView(v => ({ ...v, x: v.x + (event.key === "ArrowLeft" ? 80 : event.key === "ArrowRight" ? -80 : 0), y: v.y + (event.key === "ArrowUp" ? 80 : event.key === "ArrowDown" ? -80 : 0) }));
      }
    }}>
    <svg className="template-branches" width={size.width} height={size.height} aria-hidden="true">
      {graph.map(group => {
        const p = screen(group);
        const active = group.nodes.some(n => nodeKey(group.tag, n.template.id) === hovered || n.template.id === selected?.id);
        return <g key={group.tag} className={active ? "active" : ""}>
          <path d={`M ${view.x} ${view.y} Q ${p.x} ${view.y} ${p.x} ${p.y}`} />
          {group.nodes.map(node => {
            const end = screen(node);
            return <path key={node.template.id} className={nodeKey(group.tag, node.template.id) === hovered || node.template.id === selected?.id ? "active" : ""} d={`M ${p.x} ${p.y} Q ${p.x + (end.x - p.x) * 0.8} ${p.y} ${end.x} ${end.y}`} />;
          })}
        </g>;
      })}
    </svg>
    {templates.length > 0 ? <span className="graph-root" style={{ left: view.x, top: view.y }}>{tr("模板库")}</span>
      : <p className="graph-empty">{tr("没有匹配的模板，请试试其他关键词或标签。")}</p>}
    {graph.map(group => {
      const p = screen(group);
      return <div key={group.tag}>
        <span className="graph-tag" style={{ left: p.x, top: p.y }}>{group.tag}</span>
        {group.nodes.map(node => {
          const p = screen(node);
          const complete = covered.has(node.template.id);
          return <button key={node.template.id} className={`graph-node ${complete ? "covered" : ""} ${selected?.id === node.template.id ? "selected" : ""}`} data-template-node={node.template.id} data-graph-node={nodeKey(group.tag, node.template.id)}
            style={{ left: p.x, top: p.y }} aria-label={tr("{0} · {1}", node.template.title, complete ? tr("有品") : tr("模板"))} aria-description={group.tag} aria-haspopup="dialog"
            onPointerEnter={() => { if (!points.current.size) setHovered(nodeKey(group.tag, node.template.id)); }} onPointerLeave={() => setHovered(null)}
            onFocus={() => {
              setHovered(nodeKey(group.tag, node.template.id));
              if (p.x < 32 || p.x > size.width - 32 || p.y < 32 || p.y > size.height - 32) setView(v => ({ ...v, x: size.width / 2 - node.x * v.scale, y: size.height / 2 - node.y * v.scale }));
            }} onBlur={() => setHovered(null)}
            onClick={event => { if (event.detail === 0) { clickOrigin.current = event.currentTarget; onSelect(node.template); } }}>
            <span className="graph-dot" />
            {hovered === nodeKey(group.tag, node.template.id) && !dragging && <span className="graph-tooltip" style={{ left: p.x > size.width / 2 ? "auto" : 36, right: p.x > size.width / 2 ? 36 : "auto", maxWidth: Math.min(280, Math.max(100, (p.x > size.width / 2 ? p.x : size.width - p.x) - 36)), top: p.y > size.height - 80 ? "auto" : 4, bottom: p.y > size.height - 80 ? 36 : "auto" }}>{node.template.title}</span>}
          </button>;
        })}
      </div>;
    })}
    <div className="graph-legend" data-canvas-ui="true"><span><i className="graph-dot" />{tr("模板")}</span><span><i className="graph-dot covered" />{tr("有品")}</span></div>
    <div className="graph-controls" data-canvas-ui="true">
      <button aria-label={tr("缩小画布")} onClick={() => centerZoom(0.8)} disabled={view.scale <= 0.35}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14" /></svg></button>
      <output aria-label={tr("画布缩放")}>{Math.round(view.scale * 100)}%</output>
      <button aria-label={tr("放大画布")} onClick={() => centerZoom(1.25)} disabled={view.scale >= 2.5}><Icon name="plus" /></button>
      <button onClick={() => { setView(defaultView()); onSelect(null); }}>{tr("居中")}</button>
    </div>
    {selected && <div ref={popup} className="graph-popup" data-canvas-ui="true" tabIndex={-1} role="dialog" aria-label={selected.title}
      style={{ width: cardWidth, left: cardLeft, top: cardTop, maxHeight: size.height - cardTop - 72 }}>
      <button className="icon-button graph-popup-close" aria-label={tr("关闭模板详情")} onClick={close}><Icon name="close" /></button>
      {renderCard(selected)}
    </div>}
  </div>;
}
