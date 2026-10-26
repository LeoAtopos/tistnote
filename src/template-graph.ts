import type { Template } from "./model";

export interface GraphPoint { x: number; y: number }
export function templateGraph(templates: Template[], untagged: string) {
  const groups = new Map<string, Template[]>();
  for (const template of templates) {
    for (const tag of new Set(template.tags.length ? template.tags : [untagged])) {
      const members = groups.get(tag) ?? [];
      members.push(template);
      groups.set(tag, members);
    }
  }
  const sorted = [...groups].sort(([a], [b]) => a.localeCompare(b));
  const step = Math.PI * 2 / (templates.length ? sorted.reduce((sum, [, items]) => sum + items.length + 2, 0) : 1);
  let angle = -Math.PI / 2;
  return sorted.map(([tag, items]) => {
    const middle = angle + step * (items.length + 1) / 2;
    const point = { x: Math.cos(middle) * 320, y: Math.sin(middle) * 240 };
    const nodes = items.map((template, i) => {
      const a = angle + step * (i + 1);
      return { template, x: Math.cos(a) * 620, y: Math.sin(a) * 430 };
    });
    angle += step * (items.length + 2);
    return { tag, ...point, nodes };
  });
}

export const graphZoom = (scale: number) => Math.max(0.35, Math.min(2.5, scale));
export function zoomGraph(view: GraphPoint & { scale: number }, anchor: GraphPoint, factor: number) {
  const scale = graphZoom(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}
