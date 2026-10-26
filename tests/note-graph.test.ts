import assert from "node:assert/strict";
import test from "node:test";
import { noteGraph } from "../src/note-graph";
import { newNote, type RecordNote } from "../src/model";

function record(id: string, group = "", filled = false): RecordNote {
  return { group, revision: id, note: { ...newNote(), id, title: id, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z",
    entries: filled ? [{ id: "entry", name: "选择", reason: "" }] : [] } };
}

test("note canvas preserves nested group ancestry and connects ungrouped notes to its root", () => {
  const graph = noteGraph(["一级/二级", "空分组"], [record("root"), record("nested", "一级/二级", true)], Date.now());
  assert.equal(graph.nodes.find(n => n.id === "root")?.parent, null);
  assert.equal(graph.nodes.find(n => n.id === "nested")?.parent, "group:一级/二级");
  assert.equal(graph.branches.find(b => b.id === "group:一级/二级")?.parent, "group:一级");
  assert.equal(graph.branches.find(b => b.id === "group:一级")?.parent, null);
  assert(graph.branches.some(b => b.id === "group:空分组"));
  assert.equal(new Set(graph.nodes.map(n => n.id)).size, 2);
  assert([...graph.nodes, ...graph.branches].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const filtered = noteGraph(["一级/二级", "空分组"], [record("nested", "一级/二级")], Date.now(), true);
  assert.deepEqual(filtered.branches.map(b => b.title), ["一级", "二级"]);
});

test("canvas fill follows valid entries; only filled overdue notes receive a review dot", () => {
  const now = Date.now();
  const empty = record("empty");
  const overdue = record("due", "", true);
  const reviewed = record("reviewed", "", true);
  reviewed.note.lastReviewedAt = new Date(now).toISOString();
  const blank = record("blank", "", true);
  blank.note.entries[0].name = "  ";
  const graph = noteGraph([], [empty, overdue, reviewed, blank], now);
  assert.equal(graph.branches.length, 0);
  assert.deepEqual(graph.nodes.map(n => [n.id, n.filled, n.due]), [["empty", false, false], ["due", true, true], ["reviewed", true, false], ["blank", false, false]]);
  const testing = record("minute", "", true);
  testing.note.reviewTestMinute = true;
  testing.note.updatedAt = new Date(now).toISOString();
  assert.equal(noteGraph([], [testing], now + 59_999).nodes[0].due, false);
  assert.equal(noteGraph([], [testing], now + 60_000).nodes[0].due, true);
});
