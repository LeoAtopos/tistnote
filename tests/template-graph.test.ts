import assert from "node:assert/strict";
import test from "node:test";
import { templateGraph, zoomGraph } from "../src/template-graph";
import { builtinTemplates } from "../src/templates";

test("graph includes every tag membership once and keeps untagged templates discoverable", () => {
  const multiple = { ...builtinTemplates[0], id: "multi", tags: ["A", "B", "A"] };
  const untagged = { ...builtinTemplates[0], id: "none", tags: [] };
  const graph = templateGraph([multiple, untagged], "Untagged");
  assert.deepEqual(graph.map(g => [g.tag, g.nodes.map(n => n.template.id)]), [["A", ["multi"]], ["B", ["multi"]], ["Untagged", ["none"]]]);
  const full = templateGraph(builtinTemplates, "Untagged");
  assert.equal(full.flatMap(g => g.nodes).length, builtinTemplates.length);
  assert(full.every(g => [g, ...g.nodes].every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
  assert.deepEqual(templateGraph([], "Untagged"), []);
});

test("zoom preserves the world point beneath the pointer even at scale limits", () => {
  const view = { x: 300, y: 200, scale: 1 };
  const anchor = { x: 500, y: 350 };
  for (const factor of [0.001, 0.8, 1.25, 100]) {
    const next = zoomGraph(view, anchor, factor);
    assert(next.scale >= 0.35 && next.scale <= 2.5);
    assert.equal((anchor.x - next.x) / next.scale, (anchor.x - view.x) / view.scale);
    assert.equal((anchor.y - next.y) / next.scale, (anchor.y - view.y) / view.scale);
  }
});
