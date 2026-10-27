import { useMemo } from "react";
import { GraphCanvas } from "./GraphCanvas";
import { noteGraph } from "./note-graph";
import { tr } from "./i18n";
import type { RecordNote } from "./model";
import { applyCanvasPositions, type CanvasArrangement, type CanvasLayout, type NoteGraph } from "./canvas-layout";

export function NoteCanvas({ rootLabel, groups, records, allRecords, now, filtered, busy, onOpen, layout, onArrange, onFolder }: {
  rootLabel: string;
  groups: string[];
  records: RecordNote[];
  allRecords: RecordNote[];
  now: number;
  filtered: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  layout: CanvasLayout;
  onArrange?: (change: CanvasArrangement, graph: NoteGraph) => Promise<void>;
  onFolder: (path: string) => void;
}) {
  const full = useMemo(() => applyCanvasPositions(noteGraph(groups, [...allRecords].sort((a, b) => a.note.title.localeCompare(b.note.title)), now, false, layout.groupOrder), layout), [groups, allRecords, now, layout]);
  const graph = useMemo(() => {
    if (!filtered) return full;
    const ids = new Set(records.map(r => r.note.id)), parents = new Set<string>();
    const nodes = full.nodes.filter(n => ids.has(n.id));
    for (const node of nodes) {
      let parent = node.parent;
      while (parent && !parents.has(parent)) { parents.add(parent); parent = full.branches.find(b => b.id === parent)?.parent ?? null; }
    }
    return { branches: full.branches.filter(b => parents.has(b.id)), nodes };
  }, [full, records, filtered]);
  return <GraphCanvas {...graph} rootLabel={rootLabel} label={tr("我的笔记画布")}
    emptyLabel={tr(filtered ? "没有找到匹配的笔记" : "还没有笔记")}
    onSelect={id => { if (id) onOpen(id); }} busy={busy} className="note-canvas"
    onArrange={onArrange ? change => onArrange(change, full) : undefined} onFolder={onFolder}
    legend={<><span><i className="graph-dot" />{tr("空")}</span><span><i className="graph-dot covered" />{tr("有品")}</span><span><i className="graph-dot covered"><i className="graph-review-dot" /></i>{tr("需要回顾")}</span></>} />;
}
