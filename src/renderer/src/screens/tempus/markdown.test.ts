import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("reads headings, lists, dividers and paragraphs", () => {
    const blocks = parseMarkdown("## This week\nYou spent\n**4h** on video.\n\n- YouTube 3h\n2) Slack 1h\n---\nDone");

    expect(blocks).toEqual([
      { kind: "heading", level: 2, spans: [{ text: "This week" }] },
      { kind: "paragraph", spans: [{ text: "You spent " }, { text: "4h", bold: true }, { text: " on video." }] },
      { kind: "bullet", spans: [{ text: "YouTube 3h" }] },
      { kind: "numbered", number: "2.", spans: [{ text: "Slack 1h" }] },
      { kind: "divider" },
      { kind: "paragraph", spans: [{ text: "Done" }] },
    ]);
  });

  it("reads tables with and without a header row", () => {
    const [withHeader] = parseMarkdown("| App | Time |\n| --- | :--: |\n| Slack | 1h |");
    const [plain] = parseMarkdown("| Slack | 1h |");

    expect(withHeader).toEqual({
      kind: "table",
      header: [[{ text: "App" }], [{ text: "Time" }]],
      rows: [[[{ text: "Slack" }], [{ text: "1h" }]]],
    });
    expect(plain).toMatchObject({ kind: "table", header: [], rows: [[[{ text: "Slack" }], [{ text: "1h" }]]] });
  });

  it("swaps non-breaking hyphens and spaces for plain ones", () => {
    expect(parseMarkdown("deep‑work time")).toEqual([{ kind: "paragraph", spans: [{ text: "deep-work time" }] }]);
  });
});

describe("parseInline", () => {
  it("splits bold, italic and code and leaves stray markers alone", () => {
    expect(parseInline("a **b** *c* `d` 2 * 3")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", code: true },
      { text: " 2 * 3" },
    ]);
  });
});
