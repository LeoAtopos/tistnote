import { useMemo, type ReactNode } from "react";
import type { Template } from "./model";
import { templateGraph } from "./template-graph";
import { tr } from "./i18n";
import { GraphCanvas } from "./GraphCanvas";

export function TemplateCanvas({ templates, covered, selected, onSelect, renderCard }: {
  templates: Template[];
  covered: { has(id: string): boolean };
  selected: Template | null;
  onSelect: (template: Template | null) => void;
  renderCard: (template: Template) => ReactNode;
}) {
  const graph = useMemo(() => templateGraph(templates, tr("未分类")), [templates]);
  const branches = graph.map(group => ({ ...group, id: `tag:${group.tag}`, title: group.tag, parent: null }));
  const nodes = graph.flatMap(group => group.nodes.map(node => ({ x: node.x, y: node.y, id: node.template.id,
    key: JSON.stringify([group.tag, node.template.id]), title: node.template.title, parent: `tag:${group.tag}`,
    filled: covered.has(node.template.id), description: group.tag })));
  return <GraphCanvas branches={branches} nodes={nodes} rootLabel={tr("模板库")} label={tr("模板库画布")}
    emptyLabel={tr("没有匹配的模板，请试试其他关键词或标签。")} emptyNodeLabel={tr("模板")}
    selectedId={selected?.id} onSelect={id => onSelect(templates.find(t => t.id === id) ?? null)}
    renderCard={id => { const template = templates.find(t => t.id === id); return template ? renderCard(template) : null; }}
    legend={<><span><i className="graph-dot" />{tr("模板")}</span><span><i className="graph-dot covered" />{tr("有品")}</span></>} />;
}
