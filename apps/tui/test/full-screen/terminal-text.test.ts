import { describe, expect, it } from "vitest";
import type { SelectItem, SelectListTheme } from "@earendil-works/pi-tui";
import { TuiSelectOverlay } from "../../src/full-screen/components.js";
import {
  terminalBracketedPasteInput,
  terminalMultilineText,
  terminalSingleLineText,
} from "../../src/full-screen/terminal-text.js";

const identityTheme: SelectListTheme = {
  selectedPrefix: (text) => text,
  selectedText: (text) => text,
  description: (text) => text,
  scrollInfo: (text) => text,
  noMatch: (text) => text,
};

describe("assistant full-screen terminal text boundary", () => {
  it("preserves ordinary Unicode while making single-line and multiline data inert", () => {
    const single = terminalSingleLineText(
      "  会话 👩‍💻\u001b[31m红色\u001b[0m\u001b]0;owned\u0007\n第二行\u202e  ",
      { maxWidth: 80 },
    );
    const multiline = terminalMultilineText(
      "第一行\u001b[32m绿色\u001b[0m\r\n第二行 👩‍💻\u009d0;owned\u009c\u202e",
    );

    expect(single).toBe("  会话 👩‍💻红色 第二行  ");
    expect(multiline).toBe("第一行绿色\n第二行 👩‍💻 0;owned ");
    expect(hasUnsafeTerminalText(single, false)).toBe(false);
    expect(hasUnsafeTerminalText(multiline, true)).toBe(false);
  });

  it("sanitizes only bracketed-paste content and keeps Pi paste framing intact", () => {
    const input =
      "prefix\u001b[200~一行\u009d0;paste-owned\u009c\n二行\u202e\u001b[201~suffix";
    const result = terminalBracketedPasteInput(input);

    expect(result).toBe(
      "prefix\u001b[200~一行 0;paste-owned \n二行\u001b[201~suffix",
    );
    expect(terminalBracketedPasteInput("ordinary input")).toBe(
      "ordinary input",
    );
  });

  it("renders safe SelectItem copies but returns the original opaque item", () => {
    const original: SelectItem = {
      value: "plugin.opaque\u001b]0;value-title\u0007",
      label: "插件命令\u001b]0;label-title\u0007\n运行\u202e",
      description: "说明\u009d0;description-title\u009c",
    };
    const selected: SelectItem[] = [];
    const overlay = new TuiSelectOverlay("Commands", [original], {
      selectedIndex: 0,
      theme: identityTheme,
      onSelect: (item) => selected.push(item),
      onCancel: () => undefined,
    });

    const rendered = overlay.render(80);
    expect(rendered.join("\n")).toContain("插件命令 运行");
    expect(rendered.join("\n")).not.toContain("label-title");
    expect(rendered.every((line) => !hasUnsafeTerminalText(line, false))).toBe(
      true,
    );

    overlay.handleInput("\r");
    expect(selected).toEqual([original]);
    expect(selected[0]).toBe(original);
  });
});

function hasUnsafeTerminalText(value: string, allowNewline: boolean): boolean {
  return Array.from(value).some(
    (character) =>
      (!allowNewline || character !== "\n") &&
      (/[\p{Cc}\p{Cs}]/u.test(character) ||
        /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(
          character,
        )),
  );
}
