import { cleanTags, validReviewSettings, type Note } from "./model";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateNote(value: unknown): asserts value is Note {
  const n = value as Note;
  if (!n || !uuid.test(n.id) || typeof n.title !== "string" || /[\r\n]/.test(n.title)
    || typeof n.description !== "string" || !Array.isArray(n.tags) || n.tags.some(t => typeof t !== "string")
    || typeof n.ranked !== "boolean" || !Array.isArray(n.entries)
    || !Number.isFinite(Date.parse(n.createdAt)) || !Number.isFinite(Date.parse(n.updatedAt)))
    throw Error("Invalid note metadata. The original file was preserved.");
  if (!validReviewSettings(n)
    || (n.reviewTestMinute != null && typeof n.reviewTestMinute !== "boolean")
    || (n.lastReviewedAt != null && !Number.isFinite(Date.parse(n.lastReviewedAt)))
    || (n.source != null && typeof n.source !== "string")) throw Error("Invalid review or source metadata.");
  const ids = new Set<string>();
  for (const e of n.entries) {
    if (!e || !uuid.test(e.id) || ids.has(e.id) || typeof e.name !== "string" || /[\r\n]/.test(e.name) || typeof e.reason !== "string")
      throw Error("Invalid or duplicate entry ID, name or reason.");
    ids.add(e.id);
  }
}
export function markdown(note: Note): string {
  validateNote(note);
  const metadata = {
    schema: note.reviewInterval ? 2 : 1, id: note.id, tags: cleanTags(note.tags), ranked: note.ranked,
    createdAt: note.createdAt, updatedAt: note.updatedAt,
    reviewIntervalMonths: note.reviewIntervalMonths ?? 3,
    reviewTestMinute: note.reviewTestMinute ?? false,
    ...(note.reviewInterval ? {reviewInterval:note.reviewInterval} : {}),
    lastReviewedAt: note.lastReviewedAt ?? null, source: note.source ?? null,
  };
  let text = `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n# ${note.title}\n\n`;
  text += note.description.split("\n").map(line => `> ${line}\n`).join("");
  text += "\n<!-- tistnote:entries -->\n\n";
  note.entries.forEach((entry, i) => {
    text += `${note.ranked ? `${i + 1}.` : "-"} ${entry.name}\n  <!-- tistnote-entry:${entry.id} -->\n`;
    text += entry.reason.split("\n").map(line => `  > ${line}\n`).join("");
    text += "\n";
  });
  return text;
}
// Match Rust's UUID v5 fallback, so legacy entries keep the same identity in both apps.
async function legacyId(namespace: string, name: string): Promise<string> {
  const bytes = new Uint8Array(namespace.replaceAll("-", "").match(/../g)!.map(x => parseInt(x, 16)));
  const text = new TextEncoder().encode(name);
  const input = new Uint8Array(bytes.length + text.length); input.set(bytes); input.set(text, bytes.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", input)).slice(0, 16);
  hash[6] = (hash[6] & 15) | 80; hash[8] = (hash[8] & 63) | 128;
  const hex = Array.from(hash, x => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function parseMarkdown(raw: string): Promise<{ note: Note; approximate: boolean }> {
  const text = raw.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  if (!text.startsWith("---\n")) throw Error("Not Tistnote Markdown: missing metadata.");
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw Error("Incomplete metadata.");
  const meta = JSON.parse(text.slice(4, end));
  if (![1,2].includes(meta.schema) || !uuid.test(meta.id) || (meta.schema === 2) !== !!meta.reviewInterval) throw Error("Unsupported or invalid note metadata.");
  const body = text.slice(end + 5);
  const marker = "\n<!-- tistnote:entries -->\n";
  const split = body.indexOf(marker);
  if (split < 0) throw Error("Missing list delimiter.");
  const header = body.slice(0, split).replace(/^\n+/, "").split("\n");
  if (!header[0].startsWith("# ")) throw Error("Missing note title.");
  const description: string[] = [];
  for (const line of header.slice(1)) {
    if (line.startsWith("> ")) description.push(line.slice(2));
    else if (line.trim()) throw Error("Unrecognized description format. Preserve the > prefix.");
  }
  const note: Note = { ...meta, title: header[0].slice(2), description: description.join("\n"), entries: [],
    reviewIntervalMonths: meta.reviewIntervalMonths ?? 3, reviewTestMinute: meta.reviewTestMinute ?? false,
    lastReviewedAt: meta.lastReviewedAt ?? null, source: meta.source ?? null };
  let seenId = false, approximate = false;
  const finish = () => { if (note.entries.length && !seenId) approximate = true; };
  for (const line of body.slice(split + marker.length).split("\n")) {
    if (!line) continue;
    const id = /^  <!-- tistnote-entry:(.+) -->$/.exec(line);
    if (id) {
      if (!note.entries.length || seenId || !uuid.test(id[1])) throw Error("Invalid or duplicate entry ID.");
      note.entries.at(-1)!.id = id[1]; seenId = true;
    } else if (line.startsWith("  > ")) {
      const entry = note.entries.at(-1); if (!entry) throw Error("Reason without an entry.");
      // Track empty first reason lines without losing intentional leading newlines.
      const reasons = (entry as typeof entry & { _reasons?: string[] })._reasons ?? [];
      reasons.push(line.slice(4)); (entry as typeof entry & { _reasons?: string[] })._reasons = reasons;
      entry.reason = reasons.join("\n");
    } else {
      const entry = /^(?:- |\d+\. )(.*)$/.exec(line);
      if (!entry) throw Error("Unrecognized list format. The original file was preserved.");
      finish(); seenId = false;
      note.entries.push({ id: await legacyId(meta.id, `${note.entries.length}:${entry[1]}`), name: entry[1], reason: "" });
    }
  }
  finish();
  note.entries.forEach(entry => { delete (entry as typeof entry & { _reasons?: string[] })._reasons; });
  delete (note as Note & { schema?: number }).schema;
  validateNote(note);
  note.tags = cleanTags(note.tags);
  return { note, approximate };
}
export async function revision(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
}
