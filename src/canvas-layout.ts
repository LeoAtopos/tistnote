import { groupName, inGroup } from "./model";
import { revision } from "./markdown";
import type { CanvasBranch, CanvasNode } from "./canvas-graph";
import type { GraphPoint } from "./template-graph";

export interface CanvasLayout { schema: 1; positions: Record<string, GraphPoint>; groupOrder: string[] }
export interface CanvasState { layout: CanvasLayout; revision: string | null }
export interface CanvasArrangement {
  key: string;
  delta: GraphPoint;
  target?: { key: string; mode: "into" | "before" | "after" };
}
export interface NoteGraph { branches: CanvasBranch[]; nodes: CanvasNode[] }
export const emptyCanvasLayout = (): CanvasLayout => ({ schema: 1, positions: {}, groupOrder: [] });
export function validateCanvasLayout(value: unknown): asserts value is CanvasLayout {
  const layout = value as CanvasLayout;
  if (!layout || layout.schema !== 1 || !layout.positions || typeof layout.positions !== "object" || Array.isArray(layout.positions)
    || Object.keys(layout).some(key => !["schema", "positions", "groupOrder"].includes(key))
    || !Array.isArray(layout.groupOrder) || Object.keys(layout.positions).length > 10000 || layout.groupOrder.length > 10000)
    throw Error("画布布局无效，原文件已保留。");
  for (const [key, point] of Object.entries(layout.positions)) {
    const validKey = key.startsWith("note:") ? /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(key.slice(5))
      : key.startsWith("group:") && !!key.slice(6) && groupName(key.slice(6)) === key.slice(6);
    if (!validKey || !point || Object.keys(point).some(key => !["x", "y"].includes(key)) || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1_000_000 || Math.abs(point.y) > 1_000_000)
      throw Error("画布布局无效，原文件已保留。");
  }
  const seen = new Set<string>();
  for (const path of layout.groupOrder) {
    if (typeof path !== "string" || !path || groupName(path) !== path || seen.has(path)) throw Error("画布布局无效，原文件已保留。");
    seen.add(path);
  }
  if (new TextEncoder().encode(JSON.stringify(layout)).length > 2_000_000) throw Error("画布布局过大，未保存。");
}
export async function readCanvasState(raw: string | null): Promise<CanvasState> {
  if (raw === null) return { layout: emptyCanvasLayout(), revision: null };
  try {
    if (new TextEncoder().encode(raw).length > 2_000_000) throw Error();
    const layout: unknown = JSON.parse(raw); validateCanvasLayout(layout);
    return { layout, revision: await revision(raw) };
  } catch { throw Error("画布布局无法读取，原文件已保留。"); }
}
export function canvasKeys(graph: NoteGraph, key: string) {
  const keys = new Set([key]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of [...graph.branches, ...graph.nodes]) {
      const id = "key" in item ? String(item.key) : item.id;
      if (item.parent && keys.has(item.parent) && !keys.has(id)) { keys.add(id); changed = true; }
    }
  }
  return keys;
}
export function applyCanvasPositions(graph: NoteGraph, layout: CanvasLayout): NoteGraph {
  return { branches: graph.branches.map(b => ({ ...b, ...layout.positions[b.id] })), nodes: graph.nodes.map(n => ({ ...n, ...layout.positions[n.key] })) };
}
export function translateCanvas(layout: CanvasLayout, graph: NoteGraph, key: string, delta: GraphPoint): CanvasLayout {
  const keys = canvasKeys(graph, key), next = structuredClone(layout);
  for (const item of [...graph.branches, ...graph.nodes]) {
    const id = "key" in item ? String(item.key) : item.id;
    if (keys.has(id)) next.positions[id] = { x: item.x + delta.x, y: item.y + delta.y };
  }
  validateCanvasLayout(next);
  return next;
}
export function reorderCanvas(layout: CanvasLayout, graph: NoteGraph, source: string, target: string, mode: "before" | "after") {
  const from = graph.branches.find(b => b.id === source), to = graph.branches.find(b => b.id === target);
  if (!from || !to || source === target || from.parent !== to.parent) throw Error("只能调整同级分组的排序。");
  const siblings = graph.branches.filter(b => b.parent === from.parent);
  const reordered = siblings.filter(b => b.id !== source);
  reordered.splice(reordered.findIndex(b => b.id === target) + (mode === "after" ? 1 : 0), 0, from);
  let next = structuredClone(layout);
  for (const [i, branch] of reordered.entries()) next = translateCanvas(next, graph, branch.id, { x: siblings[i].x - branch.x, y: siblings[i].y - branch.y });
  const paths = new Set(siblings.map(b => b.id.slice(6)));
  next.groupOrder = [...layout.groupOrder.filter(path => !paths.has(path)), ...reordered.map(b => b.id.slice(6))];
  return next;
}
export function remapCanvasGroup(layout: CanvasLayout, source: string, target: string) {
  const next = structuredClone(layout);
  const rename = (path: string) => inGroup(path, source) ? target + path.slice(source.length) : path;
  next.groupOrder = [...new Set(next.groupOrder.map(rename))];
  next.positions = Object.fromEntries(Object.entries(next.positions).map(([key, value]) => [key.startsWith("group:") ? `group:${rename(key.slice(6))}` : key, value]));
  return next;
}
