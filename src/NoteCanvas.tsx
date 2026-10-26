import { useMemo } from "react";
import { GraphCanvas } from "./GraphCanvas";
import { noteGraph } from "./note-graph";
import { tr } from "./i18n";
import type { RecordNote } from "./model";

export function NoteCanvas({ groups, records, now, filtered, currentId, busy, onOpen }: {
  groups: string[];
  records: RecordNote[];
  now: number;
  filtered: boolean;
  currentId?: string;
  busy: boolean;
  onOpen: (id: string) => void;
}) {
  const graph = useMemo(() => noteGraph(groups, records, now, filtered), [groups, records, now, filtered]);
  return <GraphCanvas {...graph} rootLabel={tr("品记")} label={tr("我的笔记画布")}
    emptyLabel={tr(filtered ? "没有找到匹配的笔记" : "还没有笔记")}
    selectedId={currentId} onSelect={id => { if (id) onOpen(id); }} busy={busy} className="note-canvas"
    legend={<><span><i className="graph-dot" />{tr("空")}</span><span><i className="graph-dot covered" />{tr("有品")}</span><span><i className="graph-dot covered"><i className="graph-review-dot" /></i>{tr("需要回顾")}</span></>} />;
}
