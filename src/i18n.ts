import english from "./en.json";
import { language } from "./preferences";

export const locale = () => language() === "zh" ? "zh-CN" : "en-US";
export function formatCount(count: number, unit: "notes" | "choices" | "months") {
  const labels = { notes: ["份笔记", "note"], choices: ["个选择", "choice"], months: ["个月", "month"] };
  const [zh, en] = labels[unit];
  return `${count}${language() === "zh" ? zh : ` ${en}${count === 1 ? "" : "s"}`}`;
}
const messages: Record<string, string> = english;
const reverse = new Map(Object.entries(messages).map(([zh, en]) => [en, zh]));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(messages).filter(([key]) => /\{\d+\}/.test(key) && key.replace(/\{\d+\}/g, "").replace(/[^\p{L}]/gu, "").length >= 3).flatMap(([zh, en]) =>
  [[zh, en], [en, zh]].map(([from, to]) => {
    const indices: number[] = [];
    const parts = from.split(/(\{\d+\})/g).map(part => {
      if (/^\{\d+\}$/.test(part)) { indices.push(Number(part.slice(1, -1))); return "([\\s\\S]*?)"; }
      return escape(part);
    });
    return { from, to, regex: new RegExp(`^${parts.join("")}$`), indices, english: from === zh };
  }),
);
export function tr(source: string, ...values: unknown[]): string {
  let text = language() === "en" ? (messages[source] ?? source) : (reverse.get(source) ?? source);
  if (!values.length && text === source) {
    for (const pattern of patterns) {
      if (pattern.english !== (language() === "en")) continue;
      const match = pattern.regex.exec(source);
      if (!match) continue;
      const args: string[] = [];
      pattern.indices.forEach((index, i) => { args[index] = match[i + 1]; });
      text = pattern.to.replace(/\{(\d+)\}/g, (_, index) => args[Number(index)] ?? "");
      break;
    }
  }
  return values.length ? text.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? "")) : text;
}

// Vault warnings prefix diagnostics with a user filename; translate only the diagnostic.
export function trDiagnostic(source: string): string {
  const wrapped = /^(.+\.(?:md|json))：([\s\S]*)$/i.exec(source);
  if (!wrapped) return tr(source);
  return `${wrapped[1]}${language() === "en" ? ": " : "："}${tr(wrapped[2])}`;
}
