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
  new Date(`${key}T12:00:00`).toLocaleDateString("zh-CN", {
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
    return `新增 ${created} 篇，修改 ${modified} 篇，回顾 ${reviewed} 篇`;
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
    <section className="library activity-page" aria-label="品记使用历史">
      <header className="library-header">
        <h1>历史</h1>
        <div className="actions">
          <select
            aria-label="历史年份"
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
                {year} 年
              </option>
            ))}
          </select>
          <button disabled={busy} onClick={onRefresh}>
            刷新历史
          </button>
        </div>
      </header>
      <p className="activity-summary">
        记录了 <strong>{entries.length}</strong> 天 · 新增{" "}
        <strong>{created}</strong> 篇 · 修改 <strong>{modified}</strong> 篇次
        {" "}· 回顾 <strong>{reviewed}</strong> 篇次
      </p>
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
              {["日", "", "二", "", "四", "", "六"].map((label, index) => (
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
                    {monthStart ? `${monthStart.getMonth() + 1}月` : ""}
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
                        aria-label={`${dateLabel(key)}，${key > today ? "尚未到来" : summary(key)}`}
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
          <div className="activity-legend" aria-label="颜色越深表示记录越多">
            <span>少</span>
            {[0, 1, 2, 3, 4].map((value) => (
              <i
                key={value}
                className={`activity-level-${value}`}
                aria-hidden="true"
              />
            ))}
            <span>多</span>
          </div>
        </div>
      </div>
      <div className="activity-day-heading">
        <h2 aria-live="polite">{dateLabel(selected)}</h2>
        <label>
          查看日期
          <input
            aria-label="查看历史日期"
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
      <div className="activity-records" aria-label="当天笔记记录">
        {dayEvents.length ? (
          dayEvents.map((event) => (
            <button
              className="activity-record"
              key={`${event.kind}:${event.noteId}`}
              disabled={busy || !active.has(event.noteId)}
              onClick={() => onOpen(event.noteId)}
            >
              <span className={`activity-kind ${event.kind}`}>
                {event.kind === "created" ? "新增" : event.kind === "reviewed" ? "回顾" : "修改"}
              </span>
              <span className="activity-record-title">{event.title}</span>
              <span className="activity-record-time">
                {active.has(event.noteId)
                  ? new Date(event.at).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "在回收站"}
              </span>
            </button>
          ))
        ) : (
          <p className="activity-empty">这一天还没有新增、修改或回顾笔记。</p>
        )}
      </div>
      <p className="activity-source">
        按本地日期汇总；同一天同一篇笔记的多次修改或回顾分别计为一次。历史以现有笔记及保留的版本为准，包含回收站中的笔记。
      </p>
      {invalid > 0 && (
        <p className="error" role="alert">
          有 {invalid} 条记录的时间无效，未计入图表；原文件未修改。
        </p>
      )}
    </section>
  );
}
