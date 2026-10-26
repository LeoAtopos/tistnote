import test from "node:test";
import assert from "node:assert/strict";
import english from "../src/en.json";
import { language, parsePreferences, setPreferences, systemLanguage, theme } from "../src/preferences";
import { tr, formatCount } from "../src/i18n";
import { copyTitle, newNote, notesByTemplate, reviewTimeLabel, validTitle } from "../src/model";
import { builtinTemplates, localizedBuiltinTemplates } from "../src/templates";

test("system Chinese variants default to Chinese; every other language defaults to English", () => {
  for (const value of ["zh", "zh-CN", "zh-TW", "zh-Hant-HK", "ZH_cn"]) assert.equal(systemLanguage(value), "zh");
  for (const value of ["en-US", "ja-JP", "fr-FR", "", "zhx"]) assert.equal(systemLanguage(value), "en");
});
test("preferences reject malformed or unsupported stored settings independently", () => {
  assert.deepEqual(parsePreferences(null), { language: "system", theme: "system" });
  assert.deepEqual(parsePreferences("broken"), { language: "system", theme: "system" });
  assert.deepEqual(parsePreferences('{"language":"en","theme":"dark"}'), { language: "en", theme: "dark" });
  assert.deepEqual(parsePreferences('{"language":"fr","theme":"light"}'), { language: "system", theme: "light" });
});
test("translations preserve interpolation values and can relocalize existing interface statuses", () => {
  try {
    setPreferences({ language: "en", theme: "dark" });
    assert.equal(language(), "en");
    assert.equal(theme(), "dark");
    assert.equal(tr("新建笔记"), "New note");
    assert.equal(formatCount(1, "months"), "1 month");
    assert.equal(formatCount(2, "notes"), "2 notes");
    assert.equal(tr("已移到{0}", "我的分组"), "Moved to 我的分组");
    assert.equal(tr("已移到我的分组"), "Moved to 我的分组");
    assert.equal(tr("DUPLICATE_TITLE:已存在标题为“我的品单”的笔记，请使用其他标题。"), "DUPLICATE_TITLE:A note titled “我的品单” already exists. Choose another title.");
    setPreferences({ language: "zh" });
    assert.equal(tr("Saved"), "已保存");
    assert.equal(tr("Moved to 我的分组"), "已移到我的分组");
  } finally { setPreferences({ language: "system", theme: "system" }); }
});
test("English defaults and template labels do not rewrite existing note content or template IDs", () => {
  const existing = newNote();
  existing.title = "我不想改变的内容";
  const before = JSON.stringify(existing);
  try {
    setPreferences({ language: "en" });
    const note = newNote();
    assert.equal(note.title, "Untitled note");
    assert.equal(copyTitle(note.title, [{ note, revision: "one" }], 1), "Untitled note (1)");
    for (const title of ["Untitled note", "Untitled note (1)", "Untitled note（2）", "未命名笔记（1）"]) assert.equal(validTitle({ ...note, title }), false);
    const localized = localizedBuiltinTemplates();
    assert.deepEqual(localized.map(t => t.id), builtinTemplates.map(t => t.id));
    assert(localized.every(t => !/[\u3400-\u9fff]/.test(t.title + t.hint + t.tags.join(""))));
    const manual = { ...existing, title: builtinTemplates[0].title, entries: [{ id: "entry", name: "作品", reason: "" }] };
    assert(notesByTemplate(localized, [{ note: manual, revision: "manual" }]).has(builtinTemplates[0].id));
    assert.equal(JSON.stringify(existing), before);
    const now = Date.now();
    assert.equal(reviewTimeLabel(now - 60_000, now), "1 min. ago");
    assert.equal(reviewTimeLabel(now - 60_000, now, true), "Overdue by 1 minute");
  } finally { setPreferences({ language: "system" }); }
});
test("all translation messages preserve their numbered placeholders", () => {
  const placeholders = (s: string) => [...new Set(s.match(/\{\d+\}/g) ?? [])].sort();
  for (const [zh, en] of Object.entries(english)) {
    assert(en.trim(), `Empty English translation: ${zh}`);
    assert.deepEqual(placeholders(en), placeholders(zh), zh);
  }
});
