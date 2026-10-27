import test from "node:test";
import assert from "node:assert/strict";
import { newNote, reviewDueAt, needsReview, reviewTimeLabel, contentKey, diffNotes, setReviewInterval, validReviewSettings, reviewLimits, type ReviewUnit } from "../src/model";

test("day and week cycles keep local time across calendar boundaries and restart on review", () => {
  for (const [value, unit, days] of [[1,"day",1],[3,"day",3],[1,"week",7],[2,"week",14]] as const) {
    const note = newNote();
    const start = new Date(2026, 2, 7, 12, 30);
    note.createdAt = note.updatedAt = start.toISOString();
    const original = structuredClone(note);
    setReviewInterval(note, {value,unit});
    const due = new Date(2026, 2, 7 + days, 12, 30);
    assert.equal(reviewDueAt(note)?.getTime(), due.getTime());
    assert.equal(needsReview(note, due.getTime() - 1), false);
    assert.equal(needsReview(note, due.getTime()), true);
    assert.notEqual(contentKey(original), contentKey(note));
    assert.deepEqual(diffNotes(original, note), [`回顾周期：3 个月 → ${value} ${unit === "day" ? "天" : "周"}`]);
    note.lastReviewedAt = new Date(2026, 2, 8, 9).toISOString();
    assert.equal(reviewDueAt(note)?.getTime(), new Date(2026, 2, 8 + days, 9).getTime());
    note.updatedAt = new Date(2026, 2, 9, 10).toISOString();
    assert.equal(reviewDueAt(note)?.getTime(), new Date(2026, 2, 9 + days, 10).getTime());
  }
});

test("custom minute/hour cycles are elapsed time; calendar years clamp leap days", () => {
  const note = newNote();
  note.createdAt = note.updatedAt = new Date(2024, 1, 29, 12).toISOString();
  for (const [unit,size] of [["minute",60_000],["hour",3_600_000]] as const) {
    setReviewInterval(note, {value:5,unit});
    assert.equal(reviewDueAt(note)?.getTime(), Date.parse(note.updatedAt) + 5 * size);
  }
  setReviewInterval(note, {value:1,unit:"year"});
  assert.equal(reviewDueAt(note)?.getTime(), new Date(2025, 1, 28, 12).getTime());
  assert.equal(note.reviewInterval, undefined);
  assert.equal(note.reviewIntervalMonths, 12);
  setReviewInterval(note, {value:5,unit:"month"});
  assert.equal(reviewDueAt(note)?.getTime(), new Date(2024, 6, 29, 12).getTime());
});

test("custom intervals reject invalid units, fractions, extra fields and inconsistent legacy metadata", () => {
  for (const unit of Object.keys(reviewLimits) as ReviewUnit[]) {
    const note = newNote();
    setReviewInterval(note, {value:reviewLimits[unit],unit});
    assert(validReviewSettings(note));
    for (const value of [0,-1,0.5,NaN,Infinity,reviewLimits[unit]+1]) assert.throws(() => setReviewInterval(note,{value,unit}));
  }
  const note = newNote();
  setReviewInterval(note,{value:1,unit:"day"});
  const reordered = {...note, reviewInterval:{unit:"day" as const,value:1}};
  assert.equal(contentKey(note),contentKey(reordered));
  assert.deepEqual(diffNotes(note,reordered),[]);
  note.reviewIntervalMonths = 3;
  assert.equal(reviewDueAt(note),null);
  note.reviewIntervalMonths = 0;note.reviewTestMinute = true;
  assert.equal(validReviewSettings(note),false);
  note.reviewTestMinute = false;
  for (const interval of [{value:1,unit:"second"},{value:1,unit:"day",extra:true},null,[]]) {
    note.reviewInterval = interval as never;
    assert.equal(validReviewSettings(note),false);
  }
});

test("reviews use calendar months, clamping month ends and respecting exact due time", () => {
  const note = newNote();
  const start = new Date(2024, 0, 31, 10, 30);
  note.createdAt = note.updatedAt = start.toISOString();
  note.reviewIntervalMonths = 1;
  const due = new Date(2024, 1, 29, 10, 30);
  assert.equal(reviewDueAt(note)?.getTime(), due.getTime());
  assert.equal(needsReview(note, due.getTime() - 1), false);
  assert.equal(needsReview(note, due.getTime()), true);
  note.updatedAt = new Date(2025, 0, 31, 10, 30).toISOString();
  assert.equal(reviewDueAt(note)?.getDate(), 28);
});

test("review labels distinguish past, future and overdue with short relative times", () => {
  const now = Date.parse("2026-10-25T06:00:00Z");
  assert.equal(reviewTimeLabel(now, now), "刚刚");
  assert.equal(reviewTimeLabel(now - 59_000, now), "刚刚");
  assert.equal(reviewTimeLabel(now - 120_000, now), "2分钟前");
  assert.equal(reviewTimeLabel(now + 30_000, now), "30秒后");
  assert.equal(reviewTimeLabel(now + 3 * 86_400_000, now), "3天后");
  assert.equal(reviewTimeLabel(now - 3_600_000, now, true), "已过1小时");
  assert.equal(reviewTimeLabel(now, now, true), "刚到期");
  assert.equal(reviewTimeLabel(now - 30_000, now, true), "已过30秒");
  assert.equal(reviewTimeLabel(now + 89 * 86_400_000, now), "3个月后");
  assert.equal(reviewTimeLabel(now - 366 * 86_400_000, now), "1年前");
  assert.equal(reviewTimeLabel(NaN, now), "日期未知");
});

test("one-minute testing cycle becomes due after sixty seconds and restarts on confirmation", () => {
  const note = newNote();
  note.createdAt = note.updatedAt = "2026-10-25T10:00:00Z";
  const original = structuredClone(note);
  note.reviewTestMinute = true;
  const due = Date.parse(note.updatedAt) + 60_000;
  assert.equal(reviewDueAt(note)?.getTime(), due);
  assert.equal(needsReview(note, due - 1), false);
  assert.equal(needsReview(note, due), true);
  assert.deepEqual(diffNotes(original, note), ["回顾周期：3 个月 → 1 分钟（测试）"]);
  note.lastReviewedAt = "2026-10-25T10:01:30Z";
  assert.equal(reviewDueAt(note)?.getTime(), Date.parse(note.lastReviewedAt) + 60_000);
  note.reviewTestMinute = false;
  assert.ok(reviewDueAt(note)!.getTime() > Date.parse(note.lastReviewedAt) + 60_000);
  assert.equal(note.reviewIntervalMonths, 3);
});

test("legacy notes default to three months; latest update or early review resets the reminder", () => {
  const note = newNote();
  delete note.reviewIntervalMonths;
  note.createdAt = note.updatedAt = new Date(2025, 0, 15, 12).toISOString();
  assert.equal(reviewDueAt(note)?.getTime(), new Date(2025, 3, 15, 12).getTime());
  note.lastReviewedAt = new Date(2025, 2, 15, 12).toISOString();
  assert.equal(reviewDueAt(note)?.getTime(), new Date(2025, 5, 15, 12).getTime());
  note.updatedAt = new Date(2025, 4, 15, 12).toISOString();
  assert.equal(reviewDueAt(note)?.getTime(), new Date(2025, 7, 15, 12).getTime());
  const content = contentKey(note);
  const beforeReview = structuredClone(note);
  note.lastReviewedAt = new Date(2025, 5, 15, 12).toISOString();
  assert.equal(contentKey(note), content);
  assert.deepEqual(diffNotes(beforeReview, note), []);
  note.reviewIntervalMonths = 6;
  assert.deepEqual(diffNotes(beforeReview, note), ["回顾周期：3 个月 → 6 个月"]);
  assert.notEqual(contentKey(note), content);
  assert.equal(reviewDueAt(note)?.getTime(), new Date(2025, 11, 15, 12).getTime());
  note.reviewIntervalMonths = 0;
  assert.equal(reviewDueAt(note), null);
  assert.equal(needsReview(note), false);
});
