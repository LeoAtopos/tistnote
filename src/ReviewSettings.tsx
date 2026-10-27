import { useState } from "react";
import { tr, formatCount } from "./i18n";
import { reviewIntervalLabel, reviewLimits, setReviewInterval, type Note, type ReviewUnit } from "./model";

const months = [1, 2, 3, 6, 12, 24];
const shortCycles = [
  { value: 1, unit: "day", label: "1 天" },
  { value: 3, unit: "day", label: "3 天" },
  { value: 1, unit: "week", label: "1 周" },
  { value: 2, unit: "week", label: "2 周" },
] as const;
const units: Record<ReviewUnit, string> = { minute: "分钟", hour: "小时", day: "天", week: "周", month: "个月", year: "年" };

export function ReviewSettings({ note, onChange }: { note: Note; onChange: (change: (note: Note) => void) => void }) {
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState("3");
  const [unit, setUnit] = useState<ReviewUnit>("month");
  const interval = note.reviewInterval;
  const selected = note.reviewTestMinute ? "test-minute" : interval
    ? shortCycles.some(c => c.unit === interval.unit && c.value === interval.value) ? `${interval.unit}-${interval.value}` : "saved-custom"
    : months.includes(note.reviewIntervalMonths ?? 3) ? String(note.reviewIntervalMonths ?? 3) : "saved-custom";
  const valid = /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= reviewLimits[unit];
  function select(next: string) {
    if (next === "custom") {
      setValue(String(interval?.value ?? (note.reviewTestMinute ? 1 : note.reviewIntervalMonths ?? 3)));
      setUnit(interval?.unit ?? (note.reviewTestMinute ? "minute" : "month"));
      setCustom(true);
      return;
    }
    setCustom(false);
    if (next === "saved-custom") return;
    const short = shortCycles.find(c => `${c.unit}-${c.value}` === next);
    onChange(n => {
      if (short) setReviewInterval(n, { value: short.value, unit: short.unit });
      else if (next === "test-minute") {
        delete n.reviewInterval;
        n.reviewIntervalMonths = n.reviewIntervalMonths || 3;
        n.reviewTestMinute = true;
      } else setReviewInterval(n, { value: Number(next), unit: "month" });
    });
  }
  return <div className="review-settings">
    <label className="review-cycle-select">
      <span>{tr("回顾周期")}</span>
      <select aria-label={tr("回顾周期")} value={custom ? "custom" : selected} onChange={e => select(e.target.value)}>
        <option value="test-minute">{tr("1 分钟（测试）")}</option>
        {shortCycles.map(c => <option key={c.label} value={`${c.unit}-${c.value}`}>{tr(c.label)}</option>)}
        {months.map(m => <option key={m} value={m}>{formatCount(m, "months")}</option>)}
        {selected === "saved-custom" && <option value="saved-custom">{reviewIntervalLabel(note)}</option>}
        <option value="custom">{tr("自定义…")}</option>
      </select>
    </label>
    {custom && <div className="review-custom">
      <div className="review-custom-fields">
        <input type="number" aria-label={tr("周期数值")} autoFocus min="1" max={reviewLimits[unit]} step="1" value={value}
          onChange={e => setValue(e.target.value)} aria-invalid={!valid} />
        <select aria-label={tr("周期单位")} value={unit} onChange={e => setUnit(e.target.value as ReviewUnit)}>
          {(Object.keys(units) as ReviewUnit[]).map(u => <option key={u} value={u}>{tr(units[u])}</option>)}
        </select>
      </div>
      {!valid && <p className="review-cycle-error" role="status">{tr("请输入 1–{0} 的整数", reviewLimits[unit])}</p>}
      <div className="review-custom-actions">
        <button type="button" disabled={!valid} onClick={() => { onChange(n => setReviewInterval(n, { value: Number(value), unit })); setCustom(false); }}>{tr("应用周期")}</button>
        <button type="button" onClick={() => setCustom(false)}>{tr("取消")}</button>
      </div>
    </div>}
  </div>;
}
