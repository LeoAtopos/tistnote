import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarWeeks,
  dailyActivity,
  dayKey,
  noteActivity,
} from "../src/activity";
import { newNote, type ActivityEvent, type Version } from "../src/model";

test("activity counts content changes, skips unchanged snapshots and includes pending latest content", () => {
  const first = {
    ...newNote(),
    title: "电影",
    createdAt: "2025-03-01T09:00:00Z",
    updatedAt: "2025-03-01T09:00:01Z",
  };
  const second = {
    ...first,
    description: "第二版",
    updatedAt: "2025-03-02T09:00:00Z",
  };
  const version = (note: typeof first, at: string, kind = "auto"): Version => ({
    id: at,
    at,
    kind,
    label: "",
    note,
  });
  const versions = [
    version(first, first.updatedAt, "initial"),
    version(first, "2025-03-01T10:00:00Z", "milestone"),
    version(second, "2025-03-03T09:00:00Z"),
  ];
  const events = noteActivity(second, versions);
  assert.deepEqual(
    events.map((event) => [event.kind, event.at]),
    [
      ["created", first.createdAt],
      ["modified", second.updatedAt],
    ],
  );
  assert.equal(
    noteActivity(
      { ...second, title: "新的电影", updatedAt: "2025-03-04T09:00:00Z" },
      versions,
    ).length,
    3,
  );
  assert.equal(noteActivity(first, []).length, 1);
  const delayed = { ...first, updatedAt: "2025-03-04T09:00:00Z" };
  assert.equal(
    noteActivity(delayed, [
      version(delayed, delayed.updatedAt, "initial"),
    ]).filter((event) => event.kind === "modified").length,
    1,
  );
});

test("daily activity uses local days and merges repeated edits per note and kind", () => {
  const at = new Date(2026, 9, 24, 23, 30).toISOString();
  const later = new Date(2026, 9, 24, 23, 50).toISOString();
  const events: ActivityEvent[] = [
    { noteId: "a", title: "新增", at, kind: "created" },
    { noteId: "a", title: "修改一次", at, kind: "modified" },
    { noteId: "a", title: "修改两次", at: later, kind: "modified" },
    { noteId: "b", title: "另一个", at, kind: "modified" },
    {
      noteId: "b",
      title: "次日",
      at: new Date(2026, 9, 25, 0, 10).toISOString(),
      kind: "modified",
    },
    { noteId: "bad", title: "时间损坏", at: "invalid", kind: "modified" },
  ];
  const days = dailyActivity(events);
  assert.equal(days.size, 2);
  assert.equal(days.get("2026-10-24")!.length, 3);
  assert.equal(
    days
      .get("2026-10-24")!
      .find((event) => event.noteId === "a" && event.kind === "modified")!
      .title,
    "修改两次",
  );
  assert.equal(days.get("2026-10-25")!.length, 1);
});

test("annual calendar includes every day once, including leap days, with Sunday columns", () => {
  for (const [year, count] of [
    [2024, 366],
    [2026, 365],
  ]) {
    const weeks = calendarWeeks(year);
    assert.equal(weeks[0][0].getDay(), 0);
    assert.equal(weeks.at(-1)!.at(-1)!.getDay(), 6);
    const dates = weeks
      .flat()
      .filter((date) => date.getFullYear() === year)
      .map(dayKey);
    assert.equal(dates.length, count);
    assert.equal(new Set(dates).size, count);
    assert.equal(dates[0], `${year}-01-01`);
    assert.equal(dates.at(-1), `${year}-12-31`);
    assert.equal(dates.includes(`${year}-02-29`), year === 2024);
  }
});
