import { tr, locale } from "./i18n";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { calendarWeeks, dailyActivity, dayKey } from "./activity";
import type { ActivityEvent, RecordNote } from "./model";

const level = (count: number) =>
  count === 0 ? 0 : count === 1 ? 1 : count < 4 ? 2 : count < 7 ? 3 : 4;
const dateLabel = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(locale(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

export function ActivityPage({
  events,
  notes,
  busy,
  onOpen,
  onRefresh,
}: {
  events: ActivityEvent[];
  notes: RecordNote[];
  busy: boolean;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const today = dayKey(new Date());
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selected, setSelected] = useState(today);
  const [preview, setPreview] = useState<string | null>(null);
  const graph = useRef<HTMLDivElement>(null);
  const invalid = events.filter(
    (event) => !Number.isFinite(Date.parse(event.at)),
  ).length;
  const days = useMemo(() => dailyActivity(events), [events]);
  const years = [
    ...new Set([
      currentYear,
      ...[...days.keys()]
        .filter((key) => key <= today)
        .map((key) => Number(key.slice(0, 4))),
    ]),
  ].sort((a, b) => b - a);
  const weeks = useMemo(() => calendarWeeks(year), [year]);
  const entries = [...days].filter(
    ([key]) => key.startsWith(`${year}-`) && key <= today,
  );
  const yearEvents = entries.flatMap(([, items]) => items);
  const created = yearEvents.filter((event) => event.kind === "created").length;
  const modified = yearEvents.filter((event) => event.kind === "modified").length;
  const reviewed = yearEvents.filter((event) => event.kind === "reviewed").length;
  const dayEvents = days.get(selected) ?? [];
  const active = new Set(notes.map((r) => r.note.id));
  const summary = (key: string) => {
    const events = days.get(key) ?? [];
    const created = events.filter((event) => event.kind === "created").length;
    const modified = events.filter((event) => event.kind === "modified").length;
    const reviewed = events.filter((event) => event.kind === "reviewed").length;
    return tr("新增 {0} 篇，修改 {1} 篇，回顾 {2} 篇", created, modified, reviewed);
  };
  useEffect(() => {
    const container = graph.current;
    if (!container) return;
    const reveal = () => {
      const cell = container.querySelector<HTMLElement>(
        `[data-date="${selected}"]`,
      );
      if (!cell) return;
      const left =
        cell.getBoundingClientRect().left -
        container.getBoundingClientRect().left;
      if (left < 48) container.scrollLeft += left - 48;
      else if (left + cell.offsetWidth > container.clientWidth)
        container.scrollLeft += left + cell.offsetWidth - container.clientWidth;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(container);
    return () => observer.disconnect();
  }, [year, selected]);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ];
    if (
      !keys.includes(event.key) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    event.preventDefault();
    const buttons = [
      ...graph.current!.querySelectorAll<HTMLButtonElement>(
        "button[data-date]:not(:disabled)",
      ),
    ];
    const index = buttons.indexOf(event.currentTarget);
    const weekday = new Date(
      `${event.currentTarget.dataset.date}T12:00:00`,
    ).getDay();
    const offset =
      event.key === "ArrowLeft"
        ? -7
        : event.key === "ArrowRight"
          ? 7
          : event.key === "ArrowUp"
            ? weekday
              ? -1
              : 0
            : event.key === "ArrowDown"
              ? weekday < 6
                ? 1
                : 0
              : event.key === "Home"
                ? -weekday
                : 6 - weekday;
    const next =
      buttons[Math.max(0, Math.min(buttons.length - 1, index + offset))];
    setSelected(next.dataset.date!);
    setPreview(null);
    next.focus();
  };
  return (
    <section className="library activity-page" aria-label={tr("品记使用历史")}>
      <header className="library-header">
        <h1>{tr("历史")}</h1>
        <div className="actions">
          <select
            aria-label={tr("历史年份")}
            value={year}
            onChange={(event) => {
              const year = Number(event.target.value);
              setYear(year);
              setSelected(
                year === currentYear
                  ? today
                  : ([...days.keys()]
                      .filter((key) => key.startsWith(`${year}-`))
                      .sort()
                      .at(-1) ?? `${year}-01-01`),
              );
              setPreview(null);
            }}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}</option>
            ))}
          </select>
          <button disabled={busy} onClick={onRefresh}>{tr("刷新历史")}</button>
        </div>
      </header>
      <p className="activity-summary">{tr("活跃天数：{0} · 新增：{1} · 更新：{2} · 回顾：{3}", entries.length, created, modified, reviewed)}</p>
      <div className="activity-calendar">
        <div
          className="activity-scroll"
          ref={graph}
          onMouseLeave={() => setPreview(null)}
        >
          <div
            className="activity-graph"
            style={{
              gridTemplateColumns: `44px repeat(${weeks.length}, var(--activity-cell))`,
            }}
          >
            <div className="activity-weekdays" aria-hidden="true">
              {[tr("日"), "", tr("二"), "", tr("四"), "", tr("六")].map((label, index) => (
                <span key={index}>{label}</span>
              ))}
            </div>
            {weeks.map((week, column) => {
              const monthStart = week.find(
                (date) => date.getFullYear() === year && date.getDate() === 1,
              );
              return (
                <div className="activity-week" key={column}>
                  <span className="activity-month" aria-hidden="true">
                    {monthStart ? monthStart.toLocaleDateString(locale(), { month: "short" }) : ""}
                  </span>
                  {week.map((date) => {
                    const key = dayKey(date);
                    const count = days.get(key)?.length ?? 0;
                    return date.getFullYear() !== year ? (
                      <span className="activity-blank" key={key} />
                    ) : (
                      <button
                        key={key}
                        className={`activity-cell activity-level-${level(count)} ${selected === key ? "chosen" : ""}`}
                        disabled={key > today}
                        data-date={key}
                        aria-label={`${dateLabel(key)}，${key > today ? tr("尚未到来") : summary(key)}`}
                        aria-pressed={selected === key}
                        tabIndex={selected === key ? 0 : -1}
                        onFocus={() => setPreview(key)}
                        onMouseEnter={() => setPreview(key)}
                        onKeyDown={keyboard}
                        onClick={() => {
                          setSelected(key);
                          setPreview(null);
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <div className="activity-graph-footer">
          <p>
            {dateLabel(preview ?? selected)} · {summary(preview ?? selected)}
          </p>
          <div className="activity-legend" aria-label={tr("颜色越深表示记录越多")}>
            <span>{tr("少")}</span>
            {[0, 1, 2, 3, 4].map((value) => (
              <i
                key={value}
                className={`activity-level-${value}`}
                aria-hidden="true"
              />
            ))}
            <span>{tr("多")}</span>
          </div>
        </div>
      </div>
      <div className="activity-day-heading">
        <h2 aria-live="polite">{dateLabel(selected)}</h2>
        <label>{tr("查看日期")}<input
            aria-label={tr("查看历史日期")}
            type="date"
            min={`${year}-01-01`}
            max={year === currentYear ? today : `${year}-12-31`}
            value={selected}
            onChange={(event) => {
              if (
                event.target.value &&
                event.target.value.startsWith(`${year}-`) &&
                event.target.value <= today
              ) {
                setSelected(event.target.value);
                setPreview(null);
              }
            }}
          />
        </label>
      </div>
      <div className="activity-records" aria-label={tr("当天笔记记录")}>
        {dayEvents.length ? (
          dayEvents.map((event) => (
            <button
              className="activity-record"
              key={`${event.kind}:${event.noteId}`}
              disabled={busy || !active.has(event.noteId)}
              onClick={() => onOpen(event.noteId)}
            >
              <span className={`activity-kind ${event.kind}`}>
                {event.kind === "created" ? tr("新增") : event.kind === "reviewed" ? tr("回顾") : tr("修改")}
              </span>
              <span className="activity-record-title">{event.title}</span>
              <span className="activity-record-time">
                {active.has(event.noteId)
                  ? new Date(event.at).toLocaleTimeString(locale(), {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : tr("在回收站")}
              </span>
            </button>
          ))
        ) : (
          <p className="activity-empty">{tr("这一天还没有新增、修改或回顾笔记。")}</p>
        )}
      </div>
      <p className="activity-source">{tr("按本地日期汇总；同一天同一篇笔记的多次修改或回顾分别计为一次。历史以现有笔记及保留的版本为准，包含回收站中的笔记。")}</p>
      {invalid > 0 && (
        <p className="error" role="alert">{tr("有")}{invalid}{tr("条记录的时间无效，未计入图表；原文件未修改。")}</p>
      )}
    </section>
  );
}
