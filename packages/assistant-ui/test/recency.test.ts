import { describe, expect, it } from "vitest";
import { groupByRecency } from "../src/ui/navigation/recency.js";
import { conversationModelLabels } from "../src/application/conversation/endpoints.js";

const NOW = new Date(2026, 9, 7, 15, 30).getTime();
const at = (daysAgo: number, hour = 12): number => new Date(2026, 9, 7 - daysAgo, hour).getTime();

describe("groupByRecency", () => {
  it("buckets by calendar day, keeps order, and drops empty buckets", () => {
    const rows = [
      { id: "a", updatedAt: at(0, 9) },
      { id: "b", updatedAt: at(1, 23) },
      { id: "c", updatedAt: at(3) },
      { id: "d", updatedAt: at(40) },
    ];
    expect(groupByRecency(rows, NOW).map(({ group, rows: items }) => [group, items.map((row) => row.id)])).toEqual([
      ["today", ["a"]],
      ["yesterday", ["b"]],
      ["week", ["c"]],
      ["earlier", ["d"]],
    ]);
  });

  it("treats just after midnight as today and late last night as yesterday", () => {
    const rows = [{ updatedAt: new Date(2026, 9, 7, 0, 5).getTime() }, { updatedAt: new Date(2026, 9, 6, 23, 55).getTime() }];
    expect(groupByRecency(rows, NOW).map(({ group }) => group)).toEqual(["today", "yesterday"]);
  });

  it("returns nothing for no rows", () => {
    expect(groupByRecency([], NOW)).toEqual([]);
  });
});

describe("conversationModelLabels", () => {
  const endpoint = (id: string, model: string, provider: string) => ({ id, model: { id: model }, connection: { providerId: provider } }) as never;

  it("shows only the model unless two endpoints would read the same", () => {
    const labels = conversationModelLabels([
      endpoint("e1", "gpt-5", "openai"),
      endpoint("e2", "deepseek-chat", "deepseek"),
      endpoint("e3", "gpt-5", "azure"),
    ]);
    expect(labels.get("e2")).toBe("deepseek-chat");
    expect(labels.get("e1")).toBe("gpt-5 · openai");
    expect(labels.get("e3")).toBe("gpt-5 · azure");
  });
});

import { emptyStateSuggestions } from "../src/ui/conversation/suggestions.js";

describe("emptyStateSuggestions", () => {
  const snapshot = (folders: object, upload = true) =>
    ({ view: { workspaceFolders: folders, conversationAttachmentCanUpload: upload } }) as never;
  const labels = (value: never) => emptyStateSuggestions(value).map((item) => item.label);

  it("offers the generic starters when the host has no folder support", () => {
    expect(labels(snapshot({ available: false, canPick: false, folders: [], recent: [] }))).toEqual([
      "Explain a codebase", "Draft a plan", "Summarize a document",
    ]);
  });

  it("continues with the most recent folder before offering to open a new one", () => {
    const value = snapshot({ available: true, canPick: true, folders: [], recent: [{ recentRef: "r1", name: "web-app", access: "read_write" }] });
    expect(emptyStateSuggestions(value)[0]).toMatchObject({ kind: "regrant", label: "Continue with web-app", recentRef: "r1" });
  });

  it("explains a folder that is already part of the conversation", () => {
    expect(labels(snapshot({ available: true, canPick: true, folders: [{ grantId: "g", name: "notes", access: "read" }], recent: [] }))[0]).toBe("Explain notes");
  });

  it("offers to open a folder when none is known, and drops summarize without uploads", () => {
    const value = snapshot({ available: true, canPick: true, folders: [], recent: [] }, false);
    expect(emptyStateSuggestions(value).map((item) => item.kind)).toEqual(["grant", "prompt"]);
  });
});
