import { noteTree, validEntries, needsReview, type NoteFolder, type RecordNote } from "./model";
import type { CanvasBranch, CanvasNode } from "./canvas-graph";

export function noteGraph(groups: string[], records: RecordNote[], now: number, filtered = false) {
  const branches: CanvasBranch[] = [], nodes: CanvasNode[] = [];
  const root = noteTree(groups, records, filtered);
  function weight(folder: NoteFolder): number {
    return Math.max(1, folder.notes.length + folder.folders.reduce((sum, child) => sum + weight(child) + 1, 0));
  }
  function layout(folder: NoteFolder, depth: number, start: number, span: number) {
    const parent = folder.path ? `group:${folder.path}` : null;
    const total = weight(folder);
    let angle = start;
    for (const child of folder.folders) {
      const part = span * (weight(child) + 1) / total;
      const middle = angle + part / 2;
      branches.push({ id: `group:${child.path}`, title: child.name, parent, x: Math.cos(middle) * (depth + 1) * 240, y: Math.sin(middle) * (depth + 1) * 175 });
      layout(child, depth + 1, angle + part * 0.08, part * 0.84);
      angle += part;
    }
    for (const record of folder.notes) {
      const middle = angle + span / total / 2;
      const filled = validEntries(record.note).length > 0;
      nodes.push({ id: record.note.id, key: `note:${record.note.id}`, title: record.note.title, parent,
        x: Math.cos(middle) * (depth * 240 + 420), y: Math.sin(middle) * (depth * 175 + 310),
        filled, due: filled && needsReview(record.note, now), description: folder.path });
      angle += span / total;
    }
  }
  layout(root, 0, -Math.PI / 2, Math.PI * 2);
  return { branches, nodes };
}
