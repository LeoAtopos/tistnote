import {
  contentKey,
  type ActivityEvent,
  type Note,
  type Version,
} from "./model";

export function noteActivity(note: Note, versions: Version[]): ActivityEvent[] {
  const events: ActivityEvent[] = [
    { noteId: note.id, title: note.title, at: note.createdAt, kind: "created" },
  ];
  let previous: Note | undefined;
  for (const version of [...versions].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  )) {
    if (
      previous
        ? contentKey(previous) !== contentKey(version.note)
        : dayKey(new Date(version.note.updatedAt)) !==
          dayKey(new Date(note.createdAt))
    )
      events.push({
        noteId: note.id,
        title: version.note.title,
        at: version.note.updatedAt,
        kind: "modified",
      });
    previous = version.note;
  }
  if (previous && contentKey(previous) !== contentKey(note))
    events.push({
      noteId: note.id,
      title: note.title,
      at: note.updatedAt,
      kind: "modified",
    });
  return events;
}

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dailyActivity(events: ActivityEvent[]) {
  const days = new Map<string, Map<string, ActivityEvent>>();
  for (const event of events) {
    const date = new Date(event.at);
    if (!Number.isFinite(date.getTime())) continue;
    const key = dayKey(date);
    const entries = days.get(key) ?? new Map<string, ActivityEvent>();
    const identity = `${event.kind}:${event.noteId}`;
    const previous = entries.get(identity);
    if (!previous || Date.parse(previous.at) < date.getTime())
      entries.set(identity, event);
    days.set(key, entries);
  }
  return new Map(
    [...days].map(([key, entries]) => [
      key,
      [...entries.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    ]),
  );
}
export function calendarWeeks(year: number) {
  const date = new Date(year, 0, 1, 12);
  date.setDate(date.getDate() - date.getDay());
  const end = new Date(year, 11, 31, 12);
  const weeks: Date[][] = [];
  while (date <= end) {
    const week: Date[] = [];
    for (let day = 0; day < 7; day++) {
      week.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}
