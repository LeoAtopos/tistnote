import assert from "node:assert/strict";
import test from "node:test";
import { emptyCanvasLayout, readCanvasState, validateCanvasLayout, canvasKeys, translateCanvas, reorderCanvas, remapCanvasGroup, applyCanvasPositions } from "../src/canvas-layout";
import { noteGraph } from "../src/note-graph";
import { newNote, noteTree } from "../src/model";

const record = { note: newNote(), revision: "initial", group: "A/child" };
const graph = noteGraph(["A/child", "B", "C"], [record], Date.now());
test("canvas arrangement translates an entire branch and preserves unrelated nodes", () => {
  const original = emptyCanvasLayout();
  const moved = translateCanvas(original, graph, "group:A", { x: 50, y: -25 });
  assert.equal(Object.keys(original.positions).length, 0);
  assert.deepEqual([...canvasKeys(graph, "group:A")].sort(), ["group:A", "group:A/child", `note:${record.note.id}`].sort());
  const next = applyCanvasPositions(graph, moved);
  for (const item of next.branches) {
    const before = graph.branches.find(b => b.id === item.id)!;
    assert.equal(item.x - before.x, item.id.startsWith("group:A") ? 50 : 0);
  }
  assert.equal(next.nodes[0].y, graph.nodes[0].y - 25);
});
test("reordering sibling branches moves their families into slots and changes tree ordering", () => {
  const layout = reorderCanvas(emptyCanvasLayout(), graph, "group:C", "group:A", "before");
  assert.deepEqual(layout.groupOrder, ["C", "A", "B"]);
  assert.deepEqual(noteTree(["A/child", "B", "C"], [record], false, layout.groupOrder).folders.map(f => f.name), ["C", "A", "B"]);
  assert(Math.abs(layout.positions["group:C"].x - graph.branches[0].x) < 1e-9);
  assert(Math.abs(layout.positions["group:C"].y - graph.branches[0].y) < 1e-9);
  assert.throws(() => reorderCanvas(layout, graph, "group:A/child", "group:B", "before"));
  const renamed = remapCanvasGroup(layout, "A", "B/A");
  assert(renamed.positions["group:B/A/child"]);
  assert(!renamed.positions["group:A/child"]);
  assert.deepEqual(renamed.groupOrder, ["C", "B/A", "B"]);
});
test("layout parsing refuses invalid paths, non-finite coordinates and unknown data", async () => {
  const empty = await readCanvasState(null); assert.equal(empty.revision, null);
  const raw = JSON.stringify(empty.layout); assert((await readCanvasState(raw)).revision);
  for (const value of [
    { ...empty.layout, positions: { "group:../escape": { x: 0, y: 0 } } },
    { ...empty.layout, positions: { "group:A": { x: NaN, y: 0 } } },
    { ...empty.layout, positions: { "group:A": { x: 1_000_001, y: 0 } } },
    { ...empty.layout, groupOrder: ["A", "A"] },
    { ...empty.layout, schema: 2 }, { ...empty.layout, unexpected: true },
  ]) assert.throws(() => validateCanvasLayout(value));
  await assert.rejects(readCanvasState("broken"), /原文件已保留/);
});
