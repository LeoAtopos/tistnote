import test from "node:test";
import assert from "node:assert/strict";
import { newNote, reviewDueAt, needsReview, reviewTimeLabel, contentKey, diffNotes } from "../src/model";

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
