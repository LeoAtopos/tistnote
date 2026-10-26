import test from "node:test";
import assert from "node:assert/strict";
import {
  asTemplate,
  cleanTags,
  assertUniqueTitle,
  copyTitle,
  coveredTemplates,
  notesByTemplate,
  groupName,
  groupMovePath,
  inGroup,
  noteTree,
  diffNotes,
  matches,
  newNote,
  randomTemplate,
  uid,
  validTitle,
} from "../src/model";
import { builtinTemplates } from "../src/templates";
import {
  BOTTOM,
  LINE,
  layoutShare,
  shareBlocks,
  shareHeading,
  wrapText,
  type ShareOptions,
} from "../src/share";
function fixture() {
  const n = newNote(builtinTemplates[0]);
  n.tags = ["电影", "私密标签"];
  n.description = "不公开的主题说明";
  n.entries = Array.from({ length: 8 }, (_, i) => ({
    id: uid(),
    name: `电影${i + 1}`,
    reason: `私人理由${i + 1}`,
  }));
  return n;
}
function options(): ShareOptions {
  return {
    selected: [],
    reasons: true,
    description: false,
    tags: false,
    date: false,
    invitation: false,
    message: "想听听你的选择",
    signature: "",
    format: "long",
  };
}

test("note titles are unique across IDs, with trimmed whitespace and safe copy names", () => {
  const first = newNote();
  first.title = "电影";
  const records = [{ note: first, revision: "one" }];
  assert.doesNotThrow(() => assertUniqueTitle(first, records));
  const second = newNote();
  for (const title of ["电影", " 电影 "]) {
    second.title = title;
    assert.throws(() => assertUniqueTitle(second, records), /DUPLICATE_TITLE:/);
  }
  second.title = "电影2";
  assert.doesNotThrow(() => assertUniqueTitle(second, records));
  const copy = { ...first, id: uid(), title: "电影（副本）" };
  const copy2 = { ...first, id: uid(), title: "电影（副本）（2）" };
  assert.equal(
    copyTitle("电影（副本）", [
      ...records,
      { note: copy, revision: "two" },
      { note: copy2, revision: "three" },
    ]),
    "电影（副本）（3）",
  );
  first.title = "未命名笔记";
  second.title = "  ";
  assert.throws(() => assertUniqueTitle(second, records), /DUPLICATE_TITLE:/);
  first.title = "Film";
  second.title = "film";
  assert.doesNotThrow(() => assertUniqueTitle(second, records));
});

test("new notes number occupied titles across groups and reuse available numbers", () => {
  const records = ["未命名笔记", " 未命名笔记（1） ", "未命名笔记（3）"].map(
    (title, i) => ({
      note: { ...newNote(), title },
      revision: String(i),
      group: i ? "电影" : "",
    }),
  );
  const next = newNote(undefined, records);
  assert.equal(next.title, "未命名笔记（2）");
  assert.doesNotThrow(() => assertUniqueTitle(next, records));
  records.push({ note: next, revision: "next", group: "设计" });
  assert.equal(newNote(undefined, records).title, "未命名笔记（4）");
  assert.equal(newNote(undefined, records.slice(1)).title, "未命名笔记");
  const template = builtinTemplates[0];
  assert.equal(
    newNote(template, [{ note: newNote(template), revision: "template" }])
      .title,
    `${template.title}（1）`,
  );
  assert.equal(
    newNote({ ...template, title: ` ${template.title} ` }, [
      { note: newNote(template), revision: "template" },
    ]).title,
    `${template.title}（1）`,
  );
  for (const title of ["未命名笔记", "未命名笔记（1）", " 未命名笔记（12） "])
    assert.equal(validTitle({ ...next, title }), false);
  assert.equal(validTitle({ ...next, title: "未命名笔记的想法" }), true);
});

test("template coverage counts populated active notes by source or exact trimmed title once", () => {
  const templates = builtinTemplates.slice(0, 3);
  const populated = (title: string, source?: string) => ({
    note: {
      ...newNote(),
      title,
      source,
      entries: [{ id: uid(), name: "一个条目", reason: "" }],
    },
    revision: uid(),
    group: "任意分组",
  });
  const linked = populated("改过标题的品记", templates[0].id);
  const sameTitle = populated(` ${templates[1].title} `);
  const blank = populated(templates[2].title, templates[2].id);
  blank.note.entries[0].name = "   ";
  const records = [
    linked,
    populated("第二份记录", templates[0].id),
    sameTitle,
    blank,
  ];
  assert.deepEqual(
    [...coveredTemplates(templates, records)],
    templates.slice(0, 2).map((template) => template.id),
  );
  assert.equal(coveredTemplates(templates, []).size, 0);
  assert.equal(coveredTemplates([], records).size, 0);
  assert.equal(
    coveredTemplates(templates, [populated("相似但不同的标题")]).size,
    0,
  );
  assert.equal(
    coveredTemplates(templates, [populated("未命名笔记（1）", templates[0].id)])
      .size,
    0,
  );
  assert.equal(coveredTemplates(templates.slice(1), [linked]).size, 0);
  const personal = { ...templates[0], id: "personal-template" };
  assert.equal(
    coveredTemplates([personal], [populated(personal.title)]).size,
    1,
  );
});

test("covered templates open the latest populated matching note without changing record order", () => {
  const template = builtinTemplates[0];
  const record = (title: string, source: string | undefined, updatedAt: string) => ({
    note: {
      ...newNote(),
      title,
      source,
      updatedAt,
      entries: [{ id: uid(), name: "有效条目", reason: "" }],
    },
    revision: uid(),
  });
  const older = record("改过标题的旧笔记", template.id, "2026-10-20T00:00:00Z");
  const latest = record("改过标题的新笔记", template.id, "2026-10-24T00:00:00Z");
  const empty = record(template.title, template.id, "2026-10-25T00:00:00Z");
  empty.note.entries[0].name = " ";
  const untitled = record("未命名笔记（1）", template.id, "2026-10-26T00:00:00Z");
  const records = [older, latest, empty, untitled];
  assert.equal(notesByTemplate([template], records).get(template.id), latest);
  assert.deepEqual(records, [older, latest, empty, untitled]);
  const legacy = record(` ${template.title} `, undefined, "2026-10-27T00:00:00Z");
  assert.equal(
    notesByTemplate([template], [...records, legacy]).get(template.id),
    legacy,
  );
  assert.equal(notesByTemplate([template], [empty, untitled]).size, 0);
});

test("groups validate Windows paths, include descendants, and never scope title uniqueness", () => {
  assert.equal(groupName(" 电影/收藏 "), "电影/收藏");
  for (const name of [
    "",
    ".",
    "..",
    "../outside",
    "/电影",
    "电影//收藏",
    "电影/../收藏",
    "电影\\收藏",
    "C:/外部",
    "CON",
    "com1.txt",
    "电影.",
    "电影 /收藏",
    "电影\n收藏",
  ])
    assert.throws(() => groupName(name));
  assert(inGroup("电影/收藏", "电影"));
  assert(!inGroup("电影2", "电影"));
  assert(inGroup(undefined, ""));
  assert(!inGroup("电影", ""));
  const n = fixture();
  assert.throws(
    () =>
      assertUniqueTitle({ ...n, id: uid() }, [
        { note: n, revision: "one", group: "另一分组" },
      ]),
    /DUPLICATE_TITLE/,
  );
});
test("folder drops keep the leaf name, allow root moves and reject cycles", () => {
  assert.equal(groupMovePath("电影/收藏", "设计"), "设计/收藏");
  assert.equal(groupMovePath("电影/收藏", ""), "收藏");
  assert.equal(groupMovePath("电影/收藏", "电影"), "电影/收藏");
  for (const target of ["电影", "电影/收藏", "电影/收藏/子组"])
    assert.throws(() => groupMovePath("电影", target), /自身或子文件夹/);
  assert.throws(() => groupMovePath("Film", "film/收藏"), /自身或子文件夹/);
  assert.throws(() => groupMovePath("../电影", ""));
  assert.throws(() => groupMovePath("电影", "../设计"));
});

test("file tree includes folder ancestry, root notes and empty folders, and prunes unmatched branches", () => {
  const first = { note: fixture(), revision: "a", group: "电影/收藏" };
  const second = { note: fixture(), revision: "b", group: "" };
  const third = { note: fixture(), revision: "c", group: "电影/收藏" };
  const tree = noteTree(
    ["电影/收藏", "空目录", "电影"],
    [first, second, third],
  );
  assert.deepEqual(tree.notes, [second]);
  const movies = tree.folders.find((f) => f.name === "电影")!;
  assert.equal(movies.path, "电影");
  assert.equal(movies.folders[0].name, "收藏");
  assert.deepEqual(movies.folders[0].notes, [first, third]);
  assert(tree.folders.some((f) => f.name === "空目录"));
  const searched = noteTree(["电影/收藏", "空目录"], [third], true);
  assert.equal(searched.folders.length, 1);
  assert.equal(searched.folders[0].folders[0].notes[0], third);
  assert.equal(noteTree(["空目录"], [], true).folders.length, 0);
  assert.equal(
    noteTree([], [{ ...first, group: "外部/新组" }]).folders[0].folders[0].path,
    "外部/新组",
  );
});

test("stable entry identity distinguishes rename, move and reason change", () => {
  const a = fixture(),
    b = structuredClone(a);
  b.entries[0].name = "新名称";
  b.entries[0].reason = "新理由";
  b.entries.reverse();
  const result = diffNotes(a, b);
  assert(result.some((s) => s.includes("改名")));
  assert(result.some((s) => s.includes("排名")));
  assert(result.some((s) => s.includes("新理由")));
  assert(!result.some((s) => s.startsWith("新增") || s.startsWith("移除")));
});
test("template extraction never carries private answers", () => {
  const n = fixture(),
    t = asTemplate(n);
  assert(!("entries" in t));
  assert(!JSON.stringify(t).includes("私人理由"));
  t.tags.push("新标签");
  assert(!n.tags.includes("新标签"));
});
test("share attribution reads naturally for named, anonymous and partial lists", () => {
  const n = fixture();
  const all = { ...options(), selected: n.entries.map(e => e.id) };
  assert.equal(shareHeading(n, all), "一份匿名品单");
  assert.equal(shareHeading(n, { ...all, signature: "  \n  " }), "一份匿名品单");
  assert.equal(shareHeading(n, { ...all, signature: " 小林 " }), "小林的品单");
  assert.equal(shareHeading(n, { ...all, signature: "Alex  Lee", selected: [n.entries[0].id] }), "Alex Lee的品单 · 节选");
  assert.equal(shareHeading(n, { ...options(), selected: [n.entries[0].id] }), "一份匿名品单 · 节选");
  assert.equal(shareHeading(n, { ...all, invitation: true, signature: "小林" }), "小林向你求品");
  assert.equal(shareHeading(n, { ...all, invitation: true }), "一位品友向你求品");
});

test("invitation excludes every answer, reason, tag and unselected description", () => {
  const n = fixture();
  const blocks = shareBlocks(n, {
    ...options(),
    invitation: true,
    selected: n.entries.map((e) => e.id),
    tags: true,
    reasons: true,
    date: true,
  });
  assert.equal(blocks.length, 1);
  const result = JSON.stringify(blocks);
  for (const secret of ["电影1", "私人理由", "私密标签", "不公开的主题说明"])
    assert(!result.includes(secret));
});
test("selected ranked entries retain original rank and reason privacy", () => {
  const n = fixture();
  const b = shareBlocks(n, {
    ...options(),
    selected: [n.entries[7].id],
    reasons: false,
  });
  assert.deepEqual(
    b.map((x) => x.text),
    ["08. 电影8"],
  );
});
test("unranked exports do not imply preference order", () => {
  const n = fixture();
  n.ranked = false;
  const b = shareBlocks(n, {
    ...options(),
    selected: [n.entries[7].id],
    reasons: false,
  });
  assert.equal(b[0].text, "· 电影8");
});
test("tag normalization deduplicates and search includes reasons with OR filters", () => {
  assert.deepEqual(cleanTags(" 电影， 电影, 文学、生活 "), [
    "电影",
    "文学",
    "生活",
  ]);
  const n = fixture();
  assert(matches(n, "私人理由3", ["不存在", "电影"]));
  assert(!matches(n, "私人理由3", ["不存在"]));
});
test("random template respects filtered pool and never immediately repeats", () => {
  const pool = builtinTemplates.filter((t) => t.tags.includes("电影"));
  for (let i = 0; i < 100; i++)
    assert.notEqual(randomTemplate(pool, pool[0].id)?.id, pool[0].id);
  assert.equal(randomTemplate([pool[0]], pool[0].id)?.id, pool[0].id);
  assert.equal(randomTemplate([]), undefined);
  assert.equal(builtinTemplates.length, 45);
  assert.equal(builtinTemplates[0].id, "builtin-1");
  assert.equal(builtinTemplates[0].title, "我最喜欢的电影");
  assert.equal(builtinTemplates[29].id, "builtin-30");
  assert.equal(builtinTemplates[29].title, "我想保留的日常仪式");
  for (const title of [
    "我讨厌的相处方式",
    "我不认同的观念",
    "不想再去的地方",
    "我还说不清的感受",
    "让我又爱又恨的电影",
  ])
    assert(builtinTemplates.some((template) => template.title === title));
  assert.equal(
    new Set(builtinTemplates.map((template) => template.id)).size,
    45,
  );
});
test("wrapping preserves Chinese, emoji graphemes, newlines and long English", () => {
  const text = "中文 👨‍👩‍👧‍👦 caféabcdefghijklmnopqrstuvwxyz\n\n第二段";
  const lines = wrapText(text, 8, (s) => Array.from(s).length);
  assert.equal(
    lines.join("").replaceAll(" ", ""),
    text.replaceAll("\n", "").replaceAll(" ", ""),
  );
  assert(lines.some((s) => s.includes("👨‍👩‍👧‍👦")));
  assert(lines.includes(""));
});
test("English wrapping keeps ordinary words together and still wraps very long words", () => {
  assert.deepEqual(wrapText("Would love to hear your picks", 10, s => s.length).map(s => s.trim()), ["Would love", "to hear", "your picks"]);
  const long = "abcdefghijklmnopqrstuvwxyz";
  assert.equal(wrapText(long, 8, s => s.length).join(""), long);
});

test("oversize reasons paginate with continuation and no lost content", () => {
  const reason = "甲".repeat(1000);
  const pages = layoutShare(
    [
      { text: "01. 长内容", kind: "entry", entryId: "a" },
      { text: reason, kind: "reason", entryId: "a" },
    ],
    (s) => wrapText(s, 10, (x) => x.length),
  );
  assert(pages.length > 3);
  assert(pages.slice(1).every((p) => p[0].continuation));
  assert.equal(
    pages
      .flat()
      .filter((x) => x.kind === "reason")
      .map((x) => x.text)
      .join(""),
    reason,
  );
  assert(pages.flat().every((x) => x.y + LINE <= BOTTOM));
});
test("entry and reason that fit together move intact to next page", () => {
  const pages = layoutShare(
    [
      { text: "m".repeat(160), kind: "meta" },
      { text: "title", kind: "entry", entryId: "x" },
      { text: "r".repeat(30), kind: "reason", entryId: "x" },
    ],
    (s) => wrapText(s, 10, (x) => x.length),
  );
  assert.equal(pages.length, 2);
  assert.equal(pages[1][0].kind, "entry");
  assert.equal(pages[0].filter((l) => l.kind === "entry").length, 0);
});

test("long-image layout preserves all lines in one continuous image", () => {
  const text = "甲".repeat(1000);
  const pages = layoutShare([
    { text: "01. 标题", kind: "entry", entryId: "one" },
    { text, kind: "reason", entryId: "one" },
    { text: "02. 最后一项", kind: "entry", entryId: "two" },
  ], s => wrapText(s, 10, x => x.length), 220, Infinity);
  assert.equal(pages.length, 1);
  assert(!pages[0].some(line => line.continuation));
  assert.equal(pages[0].filter(line => line.kind === "reason").map(line => line.text).join(""), text);
  assert.equal(pages[0].at(-1)?.text, "02. 最后一项");
  assert(pages[0].at(-1)!.y > BOTTOM);
  assert(pages[0].every((line, i) => i === 0 || line.y >= pages[0][i - 1].y + LINE));
});
