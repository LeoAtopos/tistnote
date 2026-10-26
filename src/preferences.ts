import { useSyncExternalStore } from "react";

export type Language = "zh" | "en";
export type Preferences = {
  language: "system" | Language;
  theme: "system" | "light" | "dark";
};
export const preferencesKey = "tistnote-preferences-v1";
export const defaultPreferences: Preferences = { language: "system", theme: "system" };
export function systemLanguage(value: string): Language {
  return /^zh(?:-|_|$)/i.test(value) ? "zh" : "en";
}
export function parsePreferences(value: string | null): Preferences {
  try {
    const data = JSON.parse(value ?? "null");
    return {
      language: ["system", "zh", "en"].includes(data?.language) ? data.language : "system",
      theme: ["system", "light", "dark"].includes(data?.theme) ? data.theme : "system",
    };
  } catch { return { ...defaultPreferences }; }
}
let preferences: Preferences = { ...defaultPreferences };
try { if (typeof localStorage !== "undefined") preferences = parsePreferences(localStorage.getItem(preferencesKey)); } catch { /* Use system settings if storage is unavailable. */ }
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
export const language = (): Language => preferences.language === "system"
  ? systemLanguage(typeof window === "undefined" ? "zh" : navigator.language)
  : preferences.language;
export const theme = () => preferences.theme === "system"
  ? (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  : preferences.theme;
export function applyPreferences() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language() === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.theme = theme();
  document.documentElement.style.colorScheme = theme();
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme());
  document.title = language() === "zh" ? "品记 tistnote" : "Tistnote";
}
export function setPreferences(patch: Partial<Preferences>) {
  const next = parsePreferences(JSON.stringify({ ...preferences, ...patch }));
  // Persist before switching, so a failed write never claims to have saved a preference.
  if (typeof localStorage !== "undefined") localStorage.setItem(preferencesKey, JSON.stringify(next));
  preferences = next;
  applyPreferences();
  notify();
}
export function usePreferences() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => preferences);
}
if (typeof window !== "undefined") {
  applyPreferences();
  window.addEventListener("languagechange", () => { preferences = { ...preferences }; applyPreferences(); notify(); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { preferences = { ...preferences }; applyPreferences(); notify(); });
  window.addEventListener("storage", event => {
    if (event.key === preferencesKey || event.key === null) {
      preferences = parsePreferences(event.newValue);
      applyPreferences();
      notify();
    }
  });
}
