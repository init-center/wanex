import { describe, expect, it } from "vitest";
import { lineDiff } from "../src/ui/conversation/line-diff.js";

describe("lineDiff", () => {
  it("marks a replaced line and keeps numbering from both sides", () => {
    const rows = lineDiff("a\nb\nc\n", "a\nB\nc\n");
    expect(rows).toEqual([
      { kind: "same", text: "a", oldNo: 1, newNo: 1 },
      { kind: "del", text: "b", oldNo: 2 },
      { kind: "add", text: "B", newNo: 2 },
      { kind: "same", text: "c", oldNo: 3, newNo: 3 },
    ]);
  });

  it("shows a new file as additions and a deleted file as removals", () => {
    expect(lineDiff(undefined, "x\ny")).toEqual([
      { kind: "add", text: "x", newNo: 1 },
      { kind: "add", text: "y", newNo: 2 },
    ]);
    expect(lineDiff("x", undefined)).toEqual([{ kind: "del", text: "x", oldNo: 1 }]);
  });

  it("collapses long unchanged runs into one gap and keeps the surrounding context", () => {
    const body = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const changed = body.map((line, i) => (i === 15 ? "changed" : line));
    const rows = lineDiff(body.join("\n"), changed.join("\n"));
    expect(rows.filter((row) => row.kind === "gap")).toEqual([
      { kind: "gap", hidden: 12 },
      { kind: "gap", hidden: 11 },
    ]);
    expect(rows.filter((row) => row.kind === "add")).toHaveLength(1);
    expect(rows.filter((row) => row.kind === "del")).toHaveLength(1);
  });

  it("returns nothing for identical empty input and one gap for identical text", () => {
    expect(lineDiff(undefined, undefined)).toEqual([]);
    expect(lineDiff("same\ntext", "same\ntext")).toEqual([{ kind: "gap", hidden: 2 }]);
  });

  it("falls back to replace-all for very large inputs instead of stalling", () => {
    const big = Array.from({ length: 800 }, (_, i) => `a${i}`).join("\n");
    const other = Array.from({ length: 800 }, (_, i) => `b${i}`).join("\n");
    const rows = lineDiff(big, other);
    expect(rows.filter((row) => row.kind === "del")).toHaveLength(800);
    expect(rows.filter((row) => row.kind === "add")).toHaveLength(800);
  });
});
