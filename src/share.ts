import { validEntries, type Note } from "./model";
export interface ShareOptions {
  selected: string[];
  reasons: boolean;
  description: boolean;
  tags: boolean;
  date: boolean;
  invitation: boolean;
  message: string;
}
export interface ShareBlock {
  text: string;
  kind: "title" | "meta" | "entry" | "reason" | "invite";
  entryId?: string;
}
export interface SharePage {
  blocks: ShareBlock[];
}
export const WIDTH = 1000,
  HEIGHT = 1400,
  MARGIN = 70,
  FONT = 32,
  LINE = 49,
  TOP = 220,
  BOTTOM = 1190;
export function shareBlocks(note: Note, o: ShareOptions): ShareBlock[] {
  const blocks: ShareBlock[] = [];
  if (o.description && note.description)
    blocks.push({ text: note.description, kind: "meta" });
  if (o.invitation) {
    blocks.push({ text: o.message, kind: "invite" });
    return blocks;
  }
  if (o.tags && note.tags.length)
    blocks.push({
      text: note.tags.map((t) => "#" + t).join("  "),
      kind: "meta",
    });
  if (o.date)
    blocks.push({
      text: new Date(note.updatedAt).toLocaleDateString("zh-CN"),
      kind: "meta",
    });
  validEntries(note).forEach((e, i) => {
    if (!o.selected.includes(e.id)) return;
    blocks.push({
      text: `${note.ranked ? `${String(i + 1).padStart(2, "0")}. ` : "· "}${e.name}`,
      kind: "entry",
      entryId: e.id,
    });
    if (o.reasons && e.reason)
      blocks.push({ text: e.reason, kind: "reason", entryId: e.id });
  });
  return blocks;
}
// Grapheme-safe wrapping handles Chinese, emoji and unbroken English without dropping text.
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const { segment } of segmenter.segment(paragraph)) {
      if (line && measure(line + segment) > maxWidth) {
        out.push(line);
        line = segment;
      } else line += segment;
    }
    out.push(line);
  }
  return out;
}
interface DrawLine {
  text: string;
  kind: ShareBlock["kind"];
  y: number;
  continuation?: boolean;
}
export function layoutShare(
  blocks: ShareBlock[],
  wrap: (text: string, kind: ShareBlock["kind"]) => string[],
  top = TOP,
): DrawLine[][] {
  const pages: DrawLine[][] = [[]];
  let y = top;
  const page = () => {
    if (pages.at(-1)!.length) {
      pages.push([]);
      y = top;
    }
  };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const lines = wrap(b.text, b.kind);
    if (b.kind === "entry") {
      const next = blocks[i + 1];
      const size =
        lines.length +
        (next?.kind === "reason" && next.entryId === b.entryId
          ? wrap(next.text, next.kind).length
          : 0);
      if (
        y > top &&
        size * LINE + 28 <= BOTTOM - top &&
        y + size * LINE + 28 > BOTTOM
      )
        page();
    }
    if (b.kind !== "reason" && y > top) y += 24;
    for (const text of lines) {
      if (y + LINE > BOTTOM) {
        page();
        if (b.entryId) {
          pages
            .at(-1)!
            .push({
              text: "（上页条目续）",
              kind: "meta",
              y,
              continuation: true,
            });
          y += LINE;
        }
      }
      pages.at(-1)!.push({ text, kind: b.kind, y });
      y += LINE;
    }
  }
  return pages;
}
export async function renderShare(
  note: Note,
  o: ShareOptions,
): Promise<string[]> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const font = (kind: string) =>
    `${kind === "entry" ? "600" : "400"} ${kind === "meta" ? 30 : FONT}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  const titleFont = '600 46px "Microsoft YaHei", sans-serif';
  ctx.font = titleFont;
  const title = wrapText(
    note.title,
    WIDTH - MARGIN * 2,
    (s) => ctx.measureText(s).width,
  );
  // Very long titles continue as body text, keeping a two-line repeated page header.
  const header = title.slice(0, 2);
  if (title.length > 2) {
    while (ctx.measureText(header[1] + "…").width > WIDTH - MARGIN * 2)
      header[1] = Array.from(header[1]).slice(0, -1).join("");
    header[1] += "…";
  }
  const top = header.length > 1 ? 260 : 220;
  const blocks = shareBlocks(note, o);
  if (title.length > 2) blocks.unshift({ text: note.title, kind: "title" });
  const pages = layoutShare(
    blocks,
    (text, kind) => {
      ctx.font = font(kind);
      return wrapText(
        text,
        WIDTH - MARGIN * 2,
        (s) => ctx.measureText(s).width,
      );
    },
    top,
  );
  if (pages.length > 200) throw Error("内容超过 200 页，请减少本次品交条目。");
  const subset = !o.invitation && o.selected.length < validEntries(note).length;
  return pages.map((lines, index) => {
    const height = Math.max(
      620,
      Math.min(HEIGHT, (lines.at(-1)?.y ?? top) + LINE + 210),
    );
    canvas.height = height;
    ctx.fillStyle = "#f8f6f0";
    ctx.fillRect(0, 0, WIDTH, height);
    ctx.textBaseline = "top";
    ctx.fillStyle = "#52685b";
    ctx.font = '500 28px "Microsoft YaHei", sans-serif';
    ctx.fillText(
      o.invitation ? "想听听你的选择" : subset ? "我的选择 · 节选" : "我的选择",
      MARGIN,
      48,
    );
    ctx.fillStyle = "#292e28";
    ctx.font = titleFont;
    header.forEach((t, i) => ctx.fillText(t, MARGIN, 104 + i * 62));
    ctx.fillStyle = "#d9ded4";
    ctx.fillRect(MARGIN, top - 26, WIDTH - MARGIN * 2, 1);
    for (const line of lines) {
      ctx.font = font(line.kind);
      ctx.fillStyle =
        line.kind === "reason" || line.kind === "meta" ? "#596056" : "#292e28";
      ctx.fillText(line.text, MARGIN, line.y);
    }
    ctx.fillStyle = "#d9ded4";
    ctx.fillRect(MARGIN, height - 190, WIDTH - MARGIN * 2, 1);
    ctx.fillStyle = "#334b42";
    ctx.font = '600 32px "Microsoft YaHei", sans-serif';
    ctx.fillText("品记 tistnote", MARGIN, height - 135);
    ctx.fillStyle = "#636a60";
    ctx.font = '400 28px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${index + 1} / ${pages.length}`, MARGIN, height - 80);
    ctx.strokeStyle = "#b9c2b5";
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(770, height - 175, 160, 160);
    ctx.setLineDash([]);
    ctx.font = '400 28px "Microsoft YaHei", sans-serif';
    ctx.fillText("下载二维码", 780, height - 124);
    ctx.fillText("预留", 822, height - 82);
    return canvas.toDataURL("image/png");
  });
}
