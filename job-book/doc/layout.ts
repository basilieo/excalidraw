// A document's markdown, laid out as a page: headings, paragraphs, lists,
// checklists, quotes, code and rules, each block in its own size and
// weight, wrapped to the page's width. Both the canvas drawing (render.ts)
// and nothing else read this, so what prints is what you see.
//
// Inline marks (**bold**, _italic_, `code`, [links](...)) are shown as their
// text: a block can be bold as a whole (a heading, or a line that is all
// **bold**), but one Excalidraw text element has one style.

export const PAD = 32;
export const BODY = 15;
const LINE = 1.35;

export type Block =
  | {
      kind: "text";
      text: string;
      size: number;
      bold: boolean;
      muted?: boolean;
      mono?: boolean;
      /** extra room on the left: lists, quotes */
      indent: number;
      /** what goes in the indent: a bullet, a number */
      marker?: string;
      checkbox?: "on" | "off";
      /** a quote's bar, a code block's shading */
      decor?: "quote" | "code";
      gapBefore: number;
    }
  | { kind: "rule"; gapBefore: number };

/** a line's inline marks taken out, leaving what reads */
export const plain = (s: string) =>
  s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]*)`/g, "$1");

const allBold = (s: string) => /^(\*\*|__)[^*_].*\1$/.test(s.trim());

export const parse = (md: string): Block[] => {
  const blocks: Block[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  let gap = 0;
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      const text = para.join(" ");
      blocks.push({
        kind: "text",
        text: plain(text),
        size: BODY,
        bold: allBold(text),
        indent: 0,
        gapBefore: gap,
      });
      gap = 10;
      para = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      gap = Math.max(gap, 10);
      continue;
    }
    // a fenced code block, as one block
    if (/^```/.test(line.trim())) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      blocks.push({
        kind: "text",
        text: code.join("\n") || " ",
        size: 13,
        bold: false,
        mono: true,
        indent: 0,
        decor: "code",
        gapBefore: gap + 4,
      });
      gap = 14;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      blocks.push({
        kind: "text",
        text: plain(h[2]),
        size: [0, 28, 21, 17][level],
        bold: true,
        indent: 0,
        gapBefore: blocks.length ? [0, 22, 18, 14][level] : 0,
      });
      gap = 8;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ kind: "rule", gapBefore: gap + 6 });
      gap = 14;
      continue;
    }
    const depth = Math.floor((/^\s*/.exec(raw)![0].replace(/\t/g, "  ").length) / 2);
    const check = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (check) {
      flush();
      blocks.push({
        kind: "text",
        text: plain(check[2]),
        size: BODY,
        bold: false,
        muted: check[1] !== " ",
        indent: 24 + depth * 20,
        checkbox: check[1] === " " ? "off" : "on",
        gapBefore: gap ? Math.min(gap, 6) : 4,
      });
      gap = 4;
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flush();
      const text = bullet ? bullet[1] : numbered![2];
      blocks.push({
        kind: "text",
        text: plain(text),
        size: BODY,
        bold: allBold(text),
        indent: 22 + depth * 20,
        marker: bullet ? (depth % 2 ? "◦" : "•") : `${numbered![1]}.`,
        gapBefore: gap ? Math.min(gap, 6) : 4,
      });
      gap = 4;
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      blocks.push({
        kind: "text",
        text: plain(quote[1]) || " ",
        size: BODY,
        bold: false,
        muted: true,
        indent: 16,
        decor: "quote",
        gapBefore: gap ? Math.min(gap, 8) : 2,
      });
      gap = 2;
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
};

let ctx: CanvasRenderingContext2D | null = null;
const measure = (text: string, size: number, bold: boolean, mono?: boolean) => {
  if (!ctx) {
    ctx = document.createElement("canvas").getContext("2d");
  }
  ctx!.font = `${bold ? "700 " : ""}${size}px ${
    mono ? "Cascadia, ui-monospace, Menlo, monospace" : "Helvetica, Arial, sans-serif"
  }`;
  return ctx!.measureText(text).width;
};

/** text broken into lines no wider than `max`, at spaces where it can */
const wrap = (
  text: string,
  max: number,
  size: number,
  bold: boolean,
  mono?: boolean,
): string[] => {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (mono) {
      // code keeps its lines; a long one is cut, not reflowed
      out.push(para);
      continue;
    }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (measure(next, size, bold) <= max || !line.trim()) {
        line = next;
        while (measure(line, size, bold) > max && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && measure(line.slice(0, cut), size, bold) > max) {
            cut--;
          }
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
};

export type Placed =
  | (Extract<Block, { kind: "text" }> & {
      x: number;
      y: number;
      width: number;
      height: number;
      lines: string[];
      lineHeight: number;
    })
  | { kind: "rule"; x: number; y: number; width: number; gapBefore: number };

export type DocLayout = { placed: Placed[]; contentHeight: number };

export const layoutDoc = (md: string, width: number): DocLayout => {
  const inner = Math.max(80, width - PAD * 2);
  let y = PAD;
  const placed: Placed[] = [];
  for (const b of parse(md)) {
    y += b.gapBefore;
    if (b.kind === "rule") {
      placed.push({ ...b, x: PAD, y: y + 4, width: inner });
      y += 9;
      continue;
    }
    const codePad = b.decor === "code" ? 10 : 0;
    const textWidth = inner - b.indent - codePad * 2;
    const lines = wrap(b.text, textWidth, b.size, b.bold, b.mono);
    const lineHeight = b.mono ? 1.4 : b.size >= 20 ? 1.2 : LINE;
    const height = lines.length * b.size * lineHeight;
    placed.push({
      ...b,
      x: PAD + b.indent + codePad,
      y: y + codePad,
      width: textWidth,
      height,
      lines,
      lineHeight,
    });
    y += height + codePad * 2;
  }
  return { placed, contentHeight: y + PAD };
};
