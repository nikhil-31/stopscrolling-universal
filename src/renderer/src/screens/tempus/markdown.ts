/** A run of text with the inline styles Tempus uses: **bold**, *italic* and `code`. */
export interface MdSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type MdBlock =
  | { kind: "heading"; level: number; spans: MdSpan[] }
  | { kind: "bullet"; spans: MdSpan[] }
  | { kind: "numbered"; number: string; spans: MdSpan[] }
  | { kind: "paragraph"; spans: MdSpan[] }
  /** `header` is empty when the table had no separator row under its first line. */
  | { kind: "table"; header: MdSpan[][]; rows: MdSpan[][][] }
  | { kind: "divider" };

const headingPattern = /^(#{1,6})\s+(.*)$/;
const bulletPattern = /^\s*[-*•]\s+(.*)$/;
const numberedPattern = /^\s*(\d+)[.)]\s+(.*)$/;
const dividerPattern = /^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;
const separatorCellPattern = /^:?-+:?$/;

/** Swaps the non-breaking hyphens and spaces models like to emit for plain ones. */
function normalize(text: string) {
  return text.replace(/[‐‑]/g, "-").replace(/[   ]/g, " ");
}

function isTableLine(line: string) {
  const trimmed = line.trim();
  return trimmed.length >= 2 && trimmed.startsWith("|") && trimmed.endsWith("|");
}

function tableCells(line: string) {
  return line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => separatorCellPattern.test(cell.replaceAll(" ", "")));
}

function parseTable(lines: string[]): MdBlock {
  const rows = lines.map(tableCells);
  const header = rows.length >= 2 && isSeparatorRow(rows[1]) ? rows.splice(0, 2)[0] : [];
  return {
    kind: "table",
    header: header.map(parseInline),
    rows: rows.filter((cells) => !isSeparatorRow(cells)).map((cells) => cells.map(parseInline)),
  };
}

/** Line-based markdown: headings, bullets, numbered items, tables, dividers and paragraphs. Blank lines end a paragraph. */
export function parseMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let table: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushTable = () => {
    if (table.length) blocks.push(parseTable(table));
    table = [];
  };

  for (const raw of normalize(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (isTableLine(line)) {
      flushParagraph();
      table.push(line);
      continue;
    }
    flushTable();
    const heading = headingPattern.exec(line.trimStart());
    const numbered = numberedPattern.exec(line);
    const bullet = bulletPattern.exec(line);
    if (!line.trim()) {
      flushParagraph();
    } else if (dividerPattern.test(line)) {
      flushParagraph();
      blocks.push({ kind: "divider" });
    } else if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length, spans: parseInline(heading[2]) });
    } else if (numbered) {
      flushParagraph();
      blocks.push({ kind: "numbered", number: `${numbered[1]}.`, spans: parseInline(numbered[2]) });
    } else if (bullet) {
      flushParagraph();
      blocks.push({ kind: "bullet", spans: parseInline(bullet[1]) });
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushTable();
  return blocks;
}

/** Splits `**bold**`, `*italic*` and `` `code` ``; unmatched markers stay as text. */
export function parseInline(text: string): MdSpan[] {
  const spans: MdSpan[] = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`|\*([^*\s](?:[^*]*[^*\s])?)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ text: text.slice(last, index) });
    if (match[1] !== undefined) spans.push({ text: match[1], bold: true });
    else if (match[2] !== undefined) spans.push({ text: match[2], code: true });
    else spans.push({ text: match[3], italic: true });
    last = index + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}
