import { language } from "./preferences";
import { tr } from "./i18n";

declare global { interface Window { TistnoteAndroid?: { call(id: string, command: string, payload: string): void } } }
export const isAndroid = typeof window !== "undefined" && !!window.TistnoteAndroid;
const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
if (isAndroid) window.addEventListener("tistnote-android-response", event => {
  const response = (event as CustomEvent).detail;
  const request = pending.get(response?.id);
  if (!request) return;
  pending.delete(response.id);
  if (response.ok) request.resolve(response.value);
  else request.reject(Error(tr("安卓操作失败：{0}", response.error)));
});
export function androidRequest<T>(command: string, data: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pending.set(id, { resolve: value => resolve(value as T), reject });
    try {
      if (!window.TistnoteAndroid) throw Error("Android bridge unavailable");
      window.TistnoteAndroid.call(id, command, JSON.stringify({ ...data, language: language() }));
    } catch (error) { pending.delete(id); reject(error); }
  });
}
