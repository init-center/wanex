// @vitest-environment happy-dom

import { act, StrictMode, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceChangeReadModel, WorkspaceChangeSummary } from "@wanex/assistant";
import type { Action, ActionResult, Snapshot } from "../src/application/model.js";
import type { Client } from "../src/client/contracts.js";
import { WorkspaceChangeCard } from "../src/ui/conversation/workspace-change.js";

type Props = ComponentProps<typeof WorkspaceChangeCard>;
const roots: Root[] = [];
// The card only relays this opaque snapshot; it does not project or render it.
const snapshot = { kind: "web.snapshot", generatedAt: 1 } as Snapshot;
const change: WorkspaceChangeSummary = {
  kind: "assistant.workspace-change", changeRef: "proposal-1", changeKind: "proposal",
  folder: "web-app", title: "Validate email", status: "proposed", available: true,
  actions: ["approve", "reject"], totalFileCount: 1,
  files: [{ path: "src/schema.ts", kind: "update" }],
};
const preview: WorkspaceChangeReadModel = {
  ...change,
  files: [{ ...change.files[0]!, before: { text: "email: string", truncated: false }, after: { text: "email: string.email()", truncated: false } }],
};

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  await act(async () => { while (roots.length > 0) roots.pop()?.unmount(); });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Workspace review interaction", () => {
  it.each(["success", "failure"])("keeps explicit retry focus stable through loading and %s", async (outcome) => {
    const held = deferred<ActionResult>();
    const dispatch = vi.fn<Client["dispatchAction"]>()
      .mockRejectedValueOnce(new Error("Preview unavailable"))
      .mockImplementationOnce(async () => held.promise);
    await mount({ client: client(dispatch) });
    await click("Review changes");
    button("Try again").focus();
    await click("Try again");
    const region = document.querySelector('[aria-label="Change preview"]');
    expect(document.activeElement).toBe(region);
    expect(region?.getAttribute("data-ui-workspace-review-state")).toBe("loading");
    await act(async () => held.resolve(outcome === "success" ? success("read-workspace-change", preview) : {
      ok: false, action: "read-workspace-change", snapshot, message: "Still unavailable",
    }));
    expect(document.activeElement).toBe(region);
    expect(region?.getAttribute("data-ui-workspace-review-state")).toBe(outcome === "success" ? "ready" : "error");
  });

  it("does not steal focus on retry settlement or an unrelated pointer activation", async () => {
    const held = deferred<ActionResult>();
    const dispatch = vi.fn<Client["dispatchAction"]>()
      .mockRejectedValueOnce(new Error("Preview unavailable"))
      .mockImplementationOnce(async () => held.promise);
    await mount({ client: client(dispatch) });
    await click("Review changes");
    const disclosure = button("Hide changes");
    disclosure.focus();
    await click("Try again");
    expect(document.activeElement).toBe(disclosure);
    await act(async () => held.resolve(success("read-workspace-change", preview)));
    expect(document.activeElement).toBe(disclosure);
  });

  it("shows a pending read, fences double activation, and can hide/reopen without another request", async () => {
    const held = deferred<ActionResult>();
    const dispatch = vi.fn(async () => held.promise);
    await mount({ client: client(dispatch) });
    await act(async () => { button("Review changes").click(); button("Review changes").click(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Loading changes");
    expect(button("Approve").disabled).toBe(true);
    const panel = document.querySelector('[data-ui-workspace-review-state="loading"]')!;
    expect(button("Hide changes").getAttribute("aria-controls")).toBe(panel.id);
    await click("Hide changes");
    expect(document.querySelector("[data-ui-workspace-review-state]")).toBeNull();
    await click("Review changes");
    expect(dispatch).toHaveBeenCalledTimes(1);
    await act(async () => held.resolve(success("read-workspace-change", preview)));
    expect(document.querySelector('[data-ui-workspace-review-state="ready"]')).not.toBeNull();
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(button("Approve").disabled).toBe(false);
  });

  it("keeps a failed read inline and explicitly retries the same change", async () => {
    const dispatch = vi.fn<Client["dispatchAction"]>()
      .mockResolvedValueOnce({ ok: false, action: "read-workspace-change", snapshot, message: "Preview unavailable" })
      .mockResolvedValueOnce(success("read-workspace-change", preview));
    const props = await mount({ client: client(dispatch) });
    await click("Review changes");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Preview unavailable");
    expect(props.onError).not.toHaveBeenCalled();
    await click("Try again");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[data-ui-diff-file]')?.textContent).toContain("string.email()");
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "read-workspace-change", input: { sessionId: "session-1", changeRef: "proposal-1" } },
      { type: "read-workspace-change", input: { sessionId: "session-1", changeRef: "proposal-1" } },
    ]);
  });

  it("reports transport and missing-preview failures rather than leaving an empty expanded card", async () => {
    const dispatch = vi.fn<Client["dispatchAction"]>()
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce({ ok: true, action: "read-workspace-change", snapshot })
      .mockResolvedValueOnce(success("read-workspace-change", preview));
    await mount({ client: client(dispatch) });
    await click("Review changes");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Connection lost");
    await click("Try again");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("preview was not returned");
    await click("Try again");
    expect(document.querySelector('[data-ui-workspace-review-state="ready"]')).not.toBeNull();
  });

  it("retains preview text through summary-only approval and mutation responses", async () => {
    const dispatch = vi.fn<Client["dispatchAction"]>()
      .mockResolvedValueOnce(success("read-workspace-change", preview))
      .mockResolvedValueOnce(success("decide-workspace-change", { ...change, status: "approved", actions: ["apply"] }))
      .mockResolvedValueOnce({ ok: true, action: "apply-workspace-change", snapshot, output: {
        kind: "web.workspace-change-action", action: "apply-workspace-change", result: {
          kind: "assistant.workspace-change-mutation", outcome: "applied",
          change: { ...change, status: "applied", actions: ["undo"] }, conflicts: [], totalConflictCount: 0,
        },
      } });
    await mount({ client: client(dispatch) });
    await click("Review changes");
    await click("Approve");
    expect(document.querySelector('[data-ui-diff-file]')?.textContent).toContain("string.email()");
    await click("Apply changes");
    expect(document.querySelector('[data-ui-diff-file]')?.textContent).toContain("string.email()");
    expect(button("Undo").disabled).toBe(false);
    expect(dispatch.mock.calls[1]?.[0]).toMatchObject({ input: { decision: "approve", idempotencyKey: expect.any(String) } });
    expect(dispatch.mock.calls[2]?.[0]).toMatchObject({ input: { idempotencyKey: expect.any(String) } });
  });

  it("does not display a preview returned for another change", async () => {
    await mount({ client: client(async () => success("read-workspace-change", { ...preview, changeRef: "other-change" })) });
    await click("Review changes");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("did not match");
    expect(document.querySelector('[data-ui-diff-file]')).toBeNull();
  });

  it("does not retry a failed mutation and preserves the loaded preview", async () => {
    const dispatch = vi.fn<Client["dispatchAction"]>()
      .mockResolvedValueOnce(success("read-workspace-change", preview))
      .mockResolvedValueOnce({ ok: false, action: "decide-workspace-change", snapshot, message: "Decision rejected" });
    const props = await mount({ client: client(dispatch) });
    await click("Review changes");
    await click("Approve");
    expect(props.onError).toHaveBeenCalledExactlyOnceWith("Decision rejected");
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-ui-diff-file]')?.textContent).toContain("string.email()");
  });

  it.each(["session", "change", "client"])("ignores an old response after its %s owner changes", async (kind) => {
    const held = deferred<ActionResult>();
    const dispatch = vi.fn<Client["dispatchAction"]>()
      .mockImplementationOnce(async () => held.promise)
      .mockResolvedValue(success("read-workspace-change", preview));
    const props = await mount({ client: client(dispatch) });
    const next = { ...props,
      ...(kind === "session" ? { sessionId: "session-2" } : {}),
      ...(kind === "change" ? { change: { ...change, changeRef: "proposal-2" } } : {}),
      ...(kind === "client" ? { client: client(dispatch) } : {}),
    };
    await click("Review changes");
    await render(next);
    await act(async () => held.resolve(success("read-workspace-change", preview)));
    expect(props.onSnapshot).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ui-diff-file]')).toBeNull();
    expect(button("Review changes").disabled).toBe(false);
  });

  it("drops pending reads when authority becomes unavailable and permits a fresh read after restoration", async () => {
    const held = deferred<ActionResult>();
    const dispatch = vi.fn<Client["dispatchAction"]>()
      .mockImplementationOnce(async () => held.promise)
      .mockResolvedValue(success("read-workspace-change", preview));
    const props = await mount({ client: client(dispatch) });
    await click("Review changes");
    await render({ ...props, change: { ...change, available: false } });
    await act(async () => held.resolve(success("read-workspace-change", preview)));
    expect(props.onSnapshot).not.toHaveBeenCalled();
    expect(button("Review changes").disabled).toBe(true);
    expect(document.querySelector('[data-ui-diff-file]')).toBeNull();
    await render(props);
    await click("Review changes");
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-ui-diff-file]')).not.toBeNull();
  });

  it("does not publish a read result after unmount", async () => {
    const held = deferred<ActionResult>();
    const props = await mount({ client: client(async () => held.promise) });
    await click("Review changes");
    await act(async () => roots.pop()!.unmount());
    await act(async () => held.resolve(success("read-workspace-change", preview)));
    expect(props.onSnapshot).not.toHaveBeenCalled();
    expect(props.onError).not.toHaveBeenCalled();
  });

  it("does not publish a completed mutation after unmount or resend it", async () => {
    const held = deferred<ActionResult>();
    const dispatch = vi.fn<Client["dispatchAction"]>()
      .mockResolvedValueOnce(success("read-workspace-change", preview))
      .mockImplementationOnce(async () => held.promise);
    const onSnapshot = vi.fn();
    await mount({ client: client(dispatch), onSnapshot });
    await click("Review changes");
    onSnapshot.mockClear();
    await click("Approve");
    await act(async () => roots.pop()!.unmount());
    await act(async () => held.resolve(success("decide-workspace-change", { ...change, status: "approved", actions: ["apply"] })));
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("uses keyboard-scrollable escaped text and valid cells for collapsed context", async () => {
    const unchanged = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n");
    const detail = { ...preview, files: [{ ...preview.files[0]!, before: { text: unchanged, truncated: false }, after: { text: `${unchanged}\n<script>alert(1)</script>`, truncated: true } }] };
    await mount({ client: client(async () => success("read-workspace-change", detail)) });
    await click("Review changes");
    const table = document.querySelector('[role="table"]')!;
    expect(table.getAttribute("tabindex")).toBe("0");
    expect([...table.querySelectorAll('[role="row"]')].every(row => row.querySelector('[role="cell"]') !== null)).toBe(true);
    expect(table.textContent).toContain("<script>alert(1)</script>");
    expect(table.querySelector("script")).toBeNull();
    expect(document.body.textContent).toContain("Preview is shortened");
  });
});

function client(dispatchAction: Client["dispatchAction"]): Client {
  return { dispatchAction, async readSnapshot() { return snapshot; } };
}
function success(action: Action["type"], result: WorkspaceChangeReadModel | WorkspaceChangeSummary): ActionResult {
  if (action !== "read-workspace-change" && action !== "decide-workspace-change") throw new Error("Unexpected summary action");
  return { ok: true, action, snapshot, output: { kind: "web.workspace-change-action", action, result } };
}
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function mount(overrides: Partial<Props>): Promise<Props> {
  const container = document.createElement("div");
  document.body.append(container);
  roots.push(createRoot(container));
  const props = { change, sessionId: "session-1", client: client(async () => success("read-workspace-change", preview)), onSnapshot: vi.fn(), onError: vi.fn(), ...overrides };
  await render(props);
  return props;
}
async function render(props: Props): Promise<void> {
  await act(async () => roots.at(-1)!.render(<StrictMode><WorkspaceChangeCard {...props} /></StrictMode>));
}
function button(name: string): HTMLButtonElement {
  const candidate = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === name);
  if (!candidate) throw new Error(`Missing button: ${name}`);
  return candidate;
}
async function click(name: string): Promise<void> { await act(async () => button(name).click()); }
