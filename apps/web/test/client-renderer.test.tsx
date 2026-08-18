// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHttpClient,
  mountClient,
  type Client,
  type ClientEvent,
  type PreparedResourceDelivery,
} from "../src/client/index.js";
import type {
  Action,
  ActionResult,
  Snapshot,
} from "../src/application/model.js";
import { STYLESHEET } from "../src/generated/stylesheet.js";

const mounted: Array<{ unmount(): void }> = [];

afterEach(async () => {
  await act(async () => {
    while (mounted.length > 0) mounted.pop()?.unmount();
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("Web client", () => {
  it("renders the chat-first timeline without exposing lower execution identities", async () => {
    const client = createClient(baseSnapshot());
    await mount(client);

    expect(document.querySelector("[data-renderer=product]")).not.toBeNull();
    expect(document.querySelector("[data-ui-session-drawer]")?.textContent).toContain(
      "Conversations",
    );
    const userRow = requiredElement<HTMLElement>("[data-ui-conversation-row=row_user]");
    const assistantRow = requiredElement<HTMLElement>("[data-ui-conversation-row=row_assistant]");
    expect(userRow.textContent).toContain("What changed?");
    expect(userRow.querySelector("[data-ui-message-header]")).toBeNull();
    expect(assistantRow.querySelector("h2")?.textContent).toBe(
      "Result",
    );
    expect(assistantRow.querySelector("[data-ui-message-header]")).toBeNull();
    expect(assistantRow.textContent).not.toContain("completed");
    expect(assistantRow.textContent).not.toContain("Completed");
    expect(document.querySelector("script")).toBeNull();
    expect(document.body.textContent).not.toContain("attempt_renderer_private");
    expect(document.body.textContent).not.toContain("control_renderer_private");
    expect(document.body.textContent).not.toContain("Wanex");
    const timeline = requiredElement<HTMLElement>("[data-ui-conversation-timeline]");
    expect(timeline.getAttribute("role")).toBe("log");
    expect(timeline.getAttribute("aria-label")).toBe("Conversation messages");
    expect(timeline.getAttribute("aria-relevant")).toBe("additions text");
  });

  it("shows a retryable unavailable state when the initial snapshot read fails", async () => {
    const snapshot = baseSnapshot();
    let readCount = 0;
    let subscribeCount = 0;
    let resolveRetry: (() => void) | undefined;
    const client: Client = {
      async readSnapshot() {
        readCount += 1;
        if (readCount === 1) throw new Error("Host is temporarily unavailable");
        return await new Promise<Snapshot>((resolve) => {
          resolveRetry = () => resolve(snapshot);
        });
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      subscribe() {
        subscribeCount += 1;
        return () => {};
      },
    };
    await mount(client);

    await waitFor(() => document.querySelector(
      '[data-ui-availability-state="unavailable"]',
    ) !== null);
    expect(document.body.textContent).toContain("Conversation unavailable");
    expect(document.body.textContent).toContain("Host is temporarily unavailable");
    expect(requiredButton("Try again").disabled).toBe(false);

    await act(async () => requiredButton("Try again").click());
    await waitFor(() => resolveRetry !== undefined);
    expect(requiredButton("Trying again").disabled).toBe(true);
    await act(async () => requiredButton("Trying again").click());
    expect(readCount).toBe(2);
    await act(async () => resolveRetry?.());
    await waitFor(() => document.querySelector(
      '[data-ui-conversation-row="row_assistant"]',
    ) !== null);

    expect(readCount).toBe(2);
    expect(subscribeCount).toBe(1);
    expect(document.querySelector(
      '[data-ui-availability-state="unavailable"]',
    )).toBeNull();
  });

  it("keeps model reasoning available but collapsed outside the primary reading flow", async () => {
    await mount(createClient(reasoningSnapshot(baseSnapshot())));

    const reasoning = requiredElement<HTMLDetailsElement>("[data-ui-reasoning]");
    expect(reasoning.open).toBe(false);
    expect(reasoning.querySelector("summary")?.textContent).toBe("Reasoning");
    expect(reasoning.textContent).toContain("Inspect the stable boundary first");
    expect(reasoning.querySelector("[data-ui-rich-text]")).not.toBeNull();
  });

  it("copies exact canonical message Markdown and exact code text", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    installClipboard(writeText);
    const snapshot = contentActionsSnapshot(baseSnapshot());
    await mount(createClient(snapshot), snapshot);

    expect(document.querySelector('[data-ui-copy-message="row_user"]')).not.toBeNull();
    const messageCopy = requiredElement<HTMLButtonElement>(
      '[data-ui-copy-message="row_assistant"]',
    );
    expect(messageCopy.type).toBe("button");
    expect(messageCopy.getAttribute("aria-label")).toBe("Copy message");

    await act(async () => {
      messageCopy.click();
      await Promise.resolve();
    });
    expect(messageCopy.dataset.uiCopyState).toBe("succeeded");
    expect(writeText).toHaveBeenNthCalledWith(
      1,
      "## Result\n\n```ts\nconst answer = 42;\n```\n\nFinal **note**.",
    );
    expect(writeText.mock.calls[0]?.[0]).not.toContain("private reasoning");
    expect(writeText.mock.calls[0]?.[0]).not.toContain("workspace.private");
    expect(writeText.mock.calls[0]?.[0]).not.toContain("resource_private");
    expect(messageCopy.title).toBe("Copied");

    const codeCopy = requiredElement<HTMLButtonElement>('[data-ui-copy-code="0"]');
    expect(codeCopy.type).toBe("button");
    expect(codeCopy.getAttribute("aria-label")).toBe("Copy code");
    await act(async () => {
      codeCopy.click();
      await Promise.resolve();
    });
    expect(codeCopy.dataset.uiCopyState).toBe("succeeded");
    expect(writeText).toHaveBeenNthCalledWith(2, "const answer = 42;\n");
  });

  it("groups only consecutive tool activity and expands unfinished groups", async () => {
    const snapshot = toolActivitySnapshot(baseSnapshot());
    await mount(createClient(snapshot), snapshot);

    const activities = Array.from(
      document.querySelectorAll<HTMLElement>("[data-ui-tool-activity]"),
    );
    expect(activities.map((item) => item.dataset.uiToolCount)).toEqual([
      "2",
      "2",
      "1",
    ]);
    expect(activities[0]).toBeInstanceOf(HTMLDetailsElement);
    expect((activities[0] as HTMLDetailsElement).open).toBe(false);
    expect(activities[0]?.textContent).toContain("Used 2 tools");
    expect(activities[1]).toBeInstanceOf(HTMLDetailsElement);
    expect((activities[1] as HTMLDetailsElement).open).toBe(true);
    expect(activities[1]?.textContent).toContain("2 tool steps failed");
    expect(activities[2]).not.toBeInstanceOf(HTMLDetailsElement);
    expect(activities[2]?.textContent).toContain("Workspace updated");
    expect(activities[2]?.textContent).toContain("workspace.finalize");
    const detailDisclosure = activities[2]?.querySelector<HTMLDetailsElement>(
      "[data-ui-tool-details]",
    );
    expect(detailDisclosure?.open).toBe(false);
    expect(detailDisclosure?.textContent).toContain("Files");
    expect(detailDisclosure?.textContent).toContain("2 changed");
    expect(document.querySelectorAll("[data-ui-tool]")).toHaveLength(5);
    expect(requiredElement<HTMLElement>(
      '[data-ui-tool="workspace.pending"]',
    ).dataset.uiToolState).toBe("running");
  });

  it("renders waiting, cancelled, and recovery Tool states without a spinner", async () => {
    const snapshot = truthfulToolStateSnapshot(baseSnapshot());
    await mount(createClient(snapshot), snapshot);

    for (const [name, state, label] of [
      ["workspace.waiting", "waiting", "Waiting"],
      ["workspace.cancelled", "cancelled", "Cancelled"],
      ["workspace.recovery", "needs_attention", "Needs attention"],
    ] as const) {
      const tool = requiredElement<HTMLElement>(`[data-ui-tool="${name}"]`);
      expect(tool.dataset.uiToolState).toBe(state);
      expect(tool.textContent).toContain(label);
      expect(tool.querySelector(".is-running")).toBeNull();
    }
  });

  it("shows a retryable clipboard failure and suppresses repeated pending writes", async () => {
    let resolveWrite: (() => void) | undefined;
    const pendingWrite = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const writeText = vi.fn(() => pendingWrite);
    installClipboard(writeText);
    const snapshot = contentActionsSnapshot(baseSnapshot());
    await mount(createClient(snapshot), snapshot);
    const copy = requiredElement<HTMLButtonElement>(
      '[data-ui-copy-message="row_assistant"]',
    );

    await act(async () => {
      copy.click();
      copy.click();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(copy.disabled).toBe(true);
    resolveWrite?.();
    await act(async () => {
      await pendingWrite;
    });
    expect(copy.dataset.uiCopyState).toBe("succeeded");

    writeText.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    await act(async () => {
      copy.click();
      await Promise.resolve();
    });
    expect(copy.dataset.uiCopyState).toBe("failed");
    expect(copy.disabled).toBe(false);
    expect(copy.getAttribute("aria-label")).toBe("Copy failed. Try again");
    expect(copy.title).toBe("Copy failed. Try again");

    writeText.mockResolvedValueOnce();
    await act(async () => {
      copy.click();
      await Promise.resolve();
    });
    expect(copy.dataset.uiCopyState).toBe("succeeded");
    expect(writeText).toHaveBeenCalledTimes(3);
  });

  it("fails visibly without a Clipboard API and never uses a legacy fallback", async () => {
    installClipboard();
    const execCommand = vi.fn();
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    const snapshot = contentActionsSnapshot(baseSnapshot());
    await mount(createClient(snapshot), snapshot);
    const copy = requiredElement<HTMLButtonElement>(
      '[data-ui-copy-message="row_assistant"]',
    );

    await act(async () => {
      copy.click();
      await Promise.resolve();
    });
    expect(copy.dataset.uiCopyState).toBe("failed");
    expect(copy.getAttribute("aria-label")).toBe("Copy failed. Try again");
    expect(execCommand).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("does not schedule clipboard state after an in-flight write unmounts", async () => {
    let resolveWrite: (() => void) | undefined;
    const pendingWrite = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    installClipboard(vi.fn(() => pendingWrite));
    const snapshot = contentActionsSnapshot(baseSnapshot());
    await mount(createClient(snapshot), snapshot);
    const copy = requiredElement<HTMLButtonElement>(
      '[data-ui-copy-message="row_assistant"]',
    );
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    await act(async () => copy.click());
    const renderer = mounted.pop();
    await act(async () => renderer?.unmount());
    const callsBeforeResolution = setTimeoutSpy.mock.calls.length;
    resolveWrite?.();
    await act(async () => pendingWrite);

    expect(setTimeoutSpy).toHaveBeenCalledTimes(callsBeforeResolution);
  });

  it("follows new content while the conversation is near the latest message", async () => {
    const initial = baseSnapshot();
    let current = initial;
    let listener: ((event: ClientEvent) => void) | undefined;
    const client: Client = {
      async readSnapshot() {
        return current;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot: current };
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    await mount(client, initial);
    await waitFor(() => listener !== undefined);

    const timeline = requiredElement<HTMLDivElement>("[data-ui-conversation-timeline]");
    const geometry = installScrollGeometry(timeline, {
      clientHeight: 400,
      scrollHeight: 1_000,
      scrollTop: 580,
    });
    await act(async () => timeline.dispatchEvent(new Event("scroll")));

    current = streamingSnapshot(initial, "New output", 2);
    geometry.setScrollHeight(1_100);
    await act(async () => listener?.({ kind: "snapshot-invalidated" }));
    await waitFor(() => document.querySelector("[data-ui-transient-assistant]") !== null);

    expect(geometry.scrollTop()).toBe(700);
    expect(document.querySelector('[data-ui-action="jump-to-latest"]')).toBeNull();
  });

  it("preserves a manually scrolled position and offers the latest jump", async () => {
    const initial = baseSnapshot();
    let current = initial;
    let listener: ((event: ClientEvent) => void) | undefined;
    const client: Client = {
      async readSnapshot() {
        return current;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot: current };
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    await mount(client, initial);
    await waitFor(() => listener !== undefined);

    const timeline = requiredElement<HTMLDivElement>("[data-ui-conversation-timeline]");
    const geometry = installScrollGeometry(timeline, {
      clientHeight: 400,
      scrollHeight: 1_000,
      scrollTop: 300,
    });
    await act(async () => timeline.dispatchEvent(new Event("scroll")));
    expect(document.querySelector('[data-ui-action="jump-to-latest"]')).not.toBeNull();

    current = streamingSnapshot(initial, "Output arrived while reading history", 2);
    geometry.setScrollHeight(1_100);
    await act(async () => listener?.({ kind: "snapshot-invalidated" }));
    await waitFor(() => document.querySelector("[data-ui-transient-assistant]") !== null);

    expect(geometry.scrollTop()).toBe(300);
    expect(document.querySelector('[data-ui-action="jump-to-latest"]')).not.toBeNull();

    await act(async () => requiredButton("Jump to latest").click());
    expect(geometry.scrollTop()).toBe(700);
    expect(document.querySelector('[data-ui-action="jump-to-latest"]')).toBeNull();

    current = streamingSnapshot(current, " and more output", 3);
    geometry.setScrollHeight(1_200);
    await act(async () => listener?.({ kind: "snapshot-invalidated" }));
    await waitFor(() => document.querySelector("[data-ui-transient-assistant]")?.textContent?.includes("and more output") === true);
    expect(geometry.scrollTop()).toBe(800);
  });

  it("loads earlier history through dispatch and preserves the visible scroll anchor", async () => {
    const initial: Snapshot = {
      ...baseSnapshot(),
      conversation: {
        ...baseSnapshot().conversation,
        historyPage: {
          limit: 100,
          hasMore: true,
          nextCursor: "history_cursor_1",
          liveRowsTruncated: false,
        },
      },
    };
    const olderRow = {
      id: "row_older_user",
      kind: "message" as const,
      role: "user" as const,
      status: "completed",
      createdAt: 0,
      updatedAt: 0,
      parts: [{ key: "older-text", type: "text" as const, text: "Earlier question" }],
      capabilityRequests: [],
    };
    const loaded: Snapshot = {
      ...initial,
      generatedAt: 2,
      conversation: {
        ...initial.conversation,
        historyRows: [olderRow, ...initial.conversation.historyRows],
        historyPage: {
          limit: 100,
          hasMore: false,
          liveRowsTruncated: false,
        },
        historyExpanded: true,
      },
    };
    const actions: Action[] = [];
    let geometry: ReturnType<typeof installScrollGeometry> | undefined;
    const client = createClient(initial, async (action) => {
      actions.push(action);
      geometry?.setScrollHeight(1_300);
      return { ok: true, action: action.type, snapshot: loaded };
    });
    await mount(client, initial);
    const timeline = requiredElement<HTMLDivElement>("[data-ui-conversation-timeline]");
    geometry = installScrollGeometry(timeline, {
      clientHeight: 400,
      scrollHeight: 1_000,
      scrollTop: 300,
    });
    await act(async () => timeline.dispatchEvent(new Event("scroll")));

    await act(async () => requiredButton("Load earlier messages").click());
    await waitFor(() => document.querySelector(
      '[data-ui-conversation-row="row_older_user"]',
    ) !== null);

    expect(actions).toEqual([{
      type: "load-earlier-history",
      input: {
        sessionId: "session_react",
        cursor: "history_cursor_1",
        limit: 100,
      },
    }]);
    expect(geometry.scrollTop()).toBe(600);
    expect(document.querySelector("[data-ui-history-loader]")).toBeNull();
    expect(
      requiredElement<HTMLElement>("[data-ui-conversation-timeline]")
        .dataset.uiHistoryExpanded,
    ).toBe("true");
  });

  it("keeps earlier-history loading retryable after a failed action", async () => {
    const initial = baseSnapshot();
    const paged: Snapshot = {
      ...initial,
      conversation: {
        ...initial.conversation,
        historyPage: {
          limit: 50,
          hasMore: true,
          nextCursor: "history_cursor_retry",
          liveRowsTruncated: false,
        },
      },
    };
    let attempts = 0;
    const client = createClient(paged, async (action) => {
      attempts += 1;
      if (attempts === 1) {
        return {
          ok: false,
          action: action.type,
          message: "History service unavailable",
          snapshot: paged,
        };
      }
      return {
        ok: true,
        action: action.type,
        snapshot: {
          ...paged,
          conversation: {
            ...paged.conversation,
            historyPage: {
              limit: 50,
              hasMore: false,
              liveRowsTruncated: false,
            },
            historyExpanded: true,
          },
        },
      };
    });
    await mount(client, paged);

    await act(async () => requiredButton("Load earlier messages").click());
    await waitFor(() => document.body.textContent?.includes(
      "Earlier messages could not be loaded",
    ) === true);
    expect(requiredButton("Load earlier messages").disabled).toBe(false);

    await act(async () => requiredButton("Load earlier messages").click());
    await waitFor(() => document.querySelector("[data-ui-history-loader]") === null);
    expect(attempts).toBe(2);
  });

  it("resets scroll ownership and moves to the latest content when the session changes", async () => {
    const initial = baseSnapshot();
    let current = initial;
    let listener: ((event: ClientEvent) => void) | undefined;
    const client: Client = {
      async readSnapshot() {
        return current;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot: current };
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    await mount(client, initial);
    await waitFor(() => listener !== undefined);

    const timeline = requiredElement<HTMLDivElement>("[data-ui-conversation-timeline]");
    const geometry = installScrollGeometry(timeline, {
      clientHeight: 400,
      scrollHeight: 1_000,
      scrollTop: 300,
    });
    await act(async () => timeline.dispatchEvent(new Event("scroll")));
    expect(document.querySelector('[data-ui-action="jump-to-latest"]')).not.toBeNull();

    current = {
      ...initial,
      generatedAt: 2,
      conversation: {
        ...initial.conversation,
        sessionId: "session_next",
        transientAssistantText: "Latest session output",
      },
      view: {
        ...initial.view,
        selection: { kind: "session", sessionId: "session_next" },
        selectedSessionTitle: "Next session",
      },
    };
    geometry.setScrollHeight(1_400);
    await act(async () => listener?.({ kind: "snapshot-invalidated" }));
    await waitFor(() => document.querySelector("[data-ui-transient-assistant]") !== null);

    expect(timeline.getAttribute("data-ui-session-id")).toBe("session_next");
    expect(geometry.scrollTop()).toBe(1_000);
    expect(document.querySelector('[data-ui-action="jump-to-latest"]')).toBeNull();
  });

  it("keeps the fallback revision path when ResizeObserver is unavailable", async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: undefined,
    });
    try {
      const initial = baseSnapshot();
      let current = initial;
      let listener: ((event: ClientEvent) => void) | undefined;
      const client: Client = {
        async readSnapshot() {
          return current;
        },
        async dispatchAction(action) {
          return { ok: true, action: action.type, snapshot: current };
        },
        subscribe(nextListener) {
          listener = nextListener;
          return () => {};
        },
      };
      await mount(client, initial);
      await waitFor(() => listener !== undefined);

      const timeline = requiredElement<HTMLDivElement>("[data-ui-conversation-timeline]");
      const geometry = installScrollGeometry(timeline, {
        clientHeight: 400,
        scrollHeight: 1_000,
        scrollTop: 580,
      });
      await act(async () => timeline.dispatchEvent(new Event("scroll")));
      current = streamingSnapshot(initial, "Fallback output", 2);
      geometry.setScrollHeight(1_100);
      await act(async () => listener?.({ kind: "snapshot-invalidated" }));
      await waitFor(() => document.querySelector("[data-ui-transient-assistant]") !== null);

      expect(geometry.scrollTop()).toBe(700);
    } finally {
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: originalResizeObserver,
      });
    }
  });

  it("applies the same ownership rules to asynchronous content resizing", async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    let resizeCallback: ResizeObserverCallback | undefined;
    class TestResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      disconnect(): void {}
      observe(): void {}
      unobserve(): void {}
    }
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: TestResizeObserver,
    });
    try {
      await mount(createClient(baseSnapshot()), baseSnapshot());
      await waitFor(() => resizeCallback !== undefined);

      const timeline = requiredElement<HTMLDivElement>("[data-ui-conversation-timeline]");
      const geometry = installScrollGeometry(timeline, {
        clientHeight: 400,
        scrollHeight: 1_000,
        scrollTop: 580,
      });
      await act(async () => timeline.dispatchEvent(new Event("scroll")));

      geometry.setScrollHeight(1_100);
      await act(async () => resizeCallback?.([], {} as ResizeObserver));
      expect(geometry.scrollTop()).toBe(700);

      timeline.scrollTop = 300;
      await act(async () => timeline.dispatchEvent(new Event("scroll")));
      geometry.setScrollHeight(1_200);
      await act(async () => resizeCallback?.([], {} as ResizeObserver));

      expect(geometry.scrollTop()).toBe(300);
      expect(document.querySelector('[data-ui-action="jump-to-latest"]')).not.toBeNull();
    } finally {
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: originalResizeObserver,
      });
    }
  });

  it("filters recent conversations without changing the active conversation", async () => {
    await mount(createClient(baseSnapshot()));

    const search = requiredElement<HTMLInputElement>('input[aria-label="Search conversations and groups"]');
    await setInput(search, "does-not-exist");

    expect(document.querySelector("[data-ui-session=\"session_react\"]")).toBeNull();
    expect(document.querySelector("[data-ui-session-list]")?.textContent).toContain("No matches");
    expect(document.querySelector("[data-ui-conversation-row=row_user]")?.textContent).toContain(
      "What changed?",
    );
  });

  it("renames a conversation through separate semantic controls and adopts the canonical title", async () => {
    const initial = sessionLibrarySnapshot();
    const renamed = renameLibrarySession(initial, "session_secondary", "Architecture notes");
    const actions: Action[] = [];
    await mount(createClient(initial, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot: renamed };
    }), initial);

    const row = requiredElement<HTMLLIElement>('[data-ui-session="session_secondary"]');
    expect(row.querySelector("button button")).toBeNull();
    expect(row.querySelectorAll(":scope > button")).toHaveLength(2);

    const trigger = requiredElement<HTMLButtonElement>(
      '[data-ui-session-menu-trigger="session_secondary"]',
    );
    await act(async () => trigger.click());
    const menu = requiredElement<HTMLElement>('[data-ui-session-menu="session_secondary"]');
    expect(menu.getAttribute("role")).toBe("menu");
    await waitFor(() => document.activeElement?.textContent?.includes("Rename") === true);

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })));
    expect(document.querySelector('[data-ui-session-menu="session_secondary"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => trigger.click());

    await act(async () => requiredButton("Rename").click());
    const input = requiredElement<HTMLInputElement>(
      '[data-ui-session-rename="session_secondary"] input',
    );
    expect(document.activeElement).toBe(input);
    await setInput(input, "  Architecture notes  ");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    })));

    await waitFor(() => actions.length === 1);
    expect(actions).toEqual([{
      type: "rename-session",
      input: {
        sessionId: "session_secondary",
        title: "Architecture notes",
        expectedRevision: 3,
      },
    }]);
    await waitFor(() => requiredElement<HTMLElement>(
      '[data-ui-session="session_secondary"] [data-ui-session-title]',
    ).textContent === "Architecture notes");
    expect(document.querySelector('[data-ui-session-rename="session_secondary"]')).toBeNull();
  });

  it("preserves a failed rename draft and supports keyboard cancellation", async () => {
    const snapshot = sessionLibrarySnapshot();
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return {
        ok: false,
        action: action.type,
        message: "Conversation changed elsewhere",
        snapshot,
      };
    }), snapshot);

    await act(async () => requiredElement<HTMLButtonElement>(
      '[data-ui-session-menu-trigger="session_secondary"]',
    ).click());
    await act(async () => requiredButton("Rename").click());
    const input = requiredElement<HTMLInputElement>(
      '[data-ui-session-rename="session_secondary"] input',
    );
    await setInput(input, "Keep my draft");
    await submitForm(requiredElement<HTMLFormElement>(
      '[data-ui-session-rename="session_secondary"]',
    ));

    await waitFor(() => actions.length === 1);
    expect(input.value).toBe("Keep my draft");
    expect(document.querySelector("[role=alert]")?.textContent).toContain(
      "Conversation changed elsewhere",
    );
    expect(requiredElement<HTMLElement>(
      '[data-ui-session="session_secondary"]',
    ).textContent).not.toContain("Architecture notes");

    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })));
    expect(document.querySelector('[data-ui-session-rename="session_secondary"]')).toBeNull();
    expect(requiredElement<HTMLElement>(
      '[data-ui-session="session_secondary"] [data-ui-session-title]',
    ).textContent).toBe("Provider investigation");

    await act(async () => requiredElement<HTMLButtonElement>(
      '[data-ui-session-menu-trigger="session_secondary"]',
    ).click());
    await act(async () => requiredButton("Rename").click());
    const secondInput = requiredElement<HTMLInputElement>(
      '[data-ui-session-rename="session_secondary"] input',
    );
    await setInput(secondInput, "Discard on blur");
    await act(async () => {
      secondInput.focus();
      secondInput.blur();
    });
    expect(document.querySelector('[data-ui-session-rename="session_secondary"]')).toBeNull();
    expect(actions).toHaveLength(1);
  });

  it("archives and restores conversations with their current revisions", async () => {
    const initial = sessionLibrarySnapshot();
    const archived = moveLibrarySession(initial, "session_secondary", true);
    const restored = moveLibrarySession(archived, "session_secondary", false);
    const actions: Action[] = [];
    await mount(createClient(initial, async (action) => {
      actions.push(action);
      return {
        ok: true,
        action: action.type,
        snapshot: action.type === "archive-session" ? archived : restored,
      };
    }), initial);

    await act(async () => requiredElement<HTMLButtonElement>(
      '[data-ui-session-menu-trigger="session_secondary"]',
    ).click());
    await act(async () => requiredButton("Archive").click());
    await waitFor(() => requiredElement<HTMLElement>(
      '[data-ui-session="session_secondary"]',
    ).dataset.uiSessionArchived === "true");
    expect(actions[0]).toEqual({
      type: "archive-session",
      input: { sessionId: "session_secondary", expectedRevision: 3 },
    });

    const archivedSection = requiredElement<HTMLDetailsElement>("[data-ui-archived-sessions]");
    await act(async () => archivedSection.querySelector("summary")?.click());
    expect(archivedSection.open).toBe(true);
    await act(async () => requiredElement<HTMLButtonElement>(
      '[data-ui-session-menu-trigger="session_secondary"]',
    ).click());
    await act(async () => requiredButton("Restore").click());
    await waitFor(() => requiredElement<HTMLElement>(
      '[data-ui-session="session_secondary"]',
    ).dataset.uiSessionArchived === "false");
    expect(actions[1]).toEqual({
      type: "restore-session",
      input: { sessionId: "session_secondary", expectedRevision: 4 },
    });
  });

  it("searches active and archived conversations as one library", async () => {
    const snapshot = sessionLibrarySnapshot();
    await mount(createClient(snapshot), snapshot);
    const search = requiredElement<HTMLInputElement>('input[aria-label="Search conversations and groups"]');

    await setInput(search, "history");
    const archivedSection = requiredElement<HTMLDetailsElement>("[data-ui-archived-sessions]");
    expect(archivedSection.open).toBe(true);
    expect(document.querySelector('[data-ui-session="session_react"]')).toBeNull();
    expect(requiredElement<HTMLElement>(
      '[data-ui-session="session_archived"] [data-ui-session-title]',
    ).textContent).toBe("Release history");
    expect(document.querySelector("[data-ui-session-list]")?.textContent).not.toContain("No matches");

    await setInput(search, "no conversation has this title");
    expect(document.querySelectorAll("[data-ui-session]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-ui-session-list] [data-ui-session-empty]")).toHaveLength(1);
    expect(document.querySelector("[data-ui-session-list]")?.textContent).toContain("No matches");
  });

  it("opens the responsive conversation drawer and closes it through every navigation path", async () => {
    const snapshot = baseSnapshot();
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot };
    }));

    const drawer = requiredElement<HTMLElement>("[data-ui-session-drawer]");
    const layout = requiredElement<HTMLElement>("[data-ui-layout]");
    const opener = requiredButton("Open conversations");
    expect(drawer.getAttribute("data-ui-drawer-open")).toBe("false");

    opener.focus();
    await act(async () => opener.click());
    expect(layout.getAttribute("data-ui-sidebar-open")).toBe("true");
    expect(drawer.getAttribute("data-ui-drawer-open")).toBe("true");
    expect(drawer.getAttribute("role")).toBe("dialog");
    expect(drawer.getAttribute("aria-modal")).toBe("true");
    await waitFor(() =>
      document.activeElement === requiredButton("New conversation")
    );
    expect(requiredElement<HTMLElement>("[data-ui-conversation-main]").inert).toBe(true);
    expect(requiredElement<HTMLElement>("[data-ui-topbar]").inert).toBe(true);

    const drawerSettings = requiredElement<HTMLButtonElement>(
      '[data-ui-session-drawer] [data-ui-action="open-settings"]',
    );
    drawerSettings.focus();
    await act(async () => drawerSettings.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    })));
    expect(document.activeElement).toBe(requiredButton("New conversation"));
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })));
    expect(document.activeElement).toBe(drawerSettings);

    await act(async () => requiredButton("Close conversations").click());
    expect(layout.getAttribute("data-ui-sidebar-open")).toBe("false");
    expect(document.activeElement).toBe(opener);

    await act(async () => opener.click());
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(layout.getAttribute("data-ui-sidebar-open")).toBe("false");
    expect(document.activeElement).toBe(opener);

    await act(async () => opener.click());
    await act(async () => requiredElement<HTMLButtonElement>(
      '[data-ui-session-select="session_react"]',
    ).click());
    await waitFor(() => actions.length === 1);

    expect(actions).toEqual([{ type: "select-session", sessionId: "session_react" }]);
    expect(layout.getAttribute("data-ui-sidebar-open")).toBe("false");
    expect(drawer.getAttribute("data-ui-drawer-open")).toBe("false");
  });

  it("turns a quick start into a focused composer draft", async () => {
    const initial = baseSnapshot();
    const empty: Snapshot = {
      ...initial,
      conversation: {
        ...initial.conversation,
        historyRows: [],
      },
    };
    await mount(createClient(empty));

    await act(async () => requiredButton("Explain a codebase").click());

    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    expect(textarea.value).toBe(
      "Explain this codebase and point out the most important files to understand first.",
    );
    expect(document.querySelector("[data-ui-quick-starts]")).not.toBeNull();
    expect(textarea.placeholder).toBe("Ask anything...");
    expect(document.body.textContent).not.toContain("Wanex");
  });

  it("opens Provider settings as a focused overlay instead of a layout column", async () => {
    await mount(createClient(baseSnapshot()));

    const opener = requiredButton("Open settings");
    opener.focus();
    await act(async () => opener.click());

    expect(document.querySelector("[data-ui-settings-overlay]")).not.toBeNull();
    const dialog = requiredElement<HTMLElement>('[role="dialog"][aria-label="Settings"]');
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("Settings");
    expect(dialog.textContent).toContain("Appearance");
    expect(dialog.textContent).toContain("Models & providers");
    expect(dialog.textContent).not.toMatch(/Product setup|trusted host|renderer|redacted/u);
    expect(document.querySelector("[data-ui-layout] > [data-ui-settings-panel]")).toBeNull();
    const close = requiredElement<HTMLButtonElement>(
      '[role="dialog"] button[aria-label="Close settings"]',
    );
    await waitFor(() => document.activeElement === close);
    expect(requiredElement<HTMLElement>("[data-ui-layout]").inert).toBe(true);
    expect(requiredElement<HTMLElement>("[data-ui-topbar]").inert).toBe(true);
    await act(async () => close.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    })));
    expect(document.activeElement).toBe(close);
    expect(dialog.contains(document.activeElement)).toBe(true);

    await act(async () => requiredElement<HTMLButtonElement>("[data-ui-settings-dismiss]").click());
    expect(document.querySelector("[data-ui-settings-overlay]")).toBeNull();
    expect(document.activeElement).toBe(opener);

    await act(async () => opener.click());
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.querySelector("[data-ui-settings-overlay]")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps local extension selection pathless and the review one-shot", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const snapshot = extensionSnapshot(baseSnapshot());
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      if (action.type === "request-local-plugin-review") {
        return {
          ok: true,
          action: action.type,
          output: {
            kind: "web.plugin-management-action",
            action: action.type,
            result: localExtensionReview(),
          },
          snapshot,
        };
      }
      if (action.type === "cancel-local-plugin-review") {
        return {
          ok: true,
          action: action.type,
          output: {
            kind: "web.plugin-management-action",
            action: action.type,
            result: { kind: "plugin.management.review-cancelled" },
          },
          snapshot,
        };
      }
      return { ok: true, action: action.type, snapshot };
    }));

    await act(async () => requiredButton("Open settings").click());
    expect(document.querySelector("[data-ui-extension-settings]")).not.toBeNull();
    const add = requiredElement<HTMLButtonElement>("[data-ui-extension-add]");
    await act(async () => add.click());
    await waitFor(() => document.querySelector("[data-ui-extension-review]") !== null);

    const review = requiredElement<HTMLElement>("[data-ui-extension-review]");
    expect(review.textContent).toContain("Unsigned local code");
    expect(review.textContent).toContain("Example Extension");
    expect(review.textContent).toContain("Read configuration");
    expect(review.textContent).toContain("Echo");
    expect(document.body.innerHTML).not.toContain("/private/source");
    expect(document.body.innerHTML).not.toContain("installBaseDir");
    await waitFor(() => document.activeElement === requiredElement<HTMLButtonElement>(
      "[data-ui-extension-review] footer button",
    ));

    await act(async () => requiredElement<HTMLButtonElement>(
      "[data-ui-settings-dismiss]",
    ).click());
    expect(document.querySelector("[data-ui-extension-review]")).not.toBeNull();

    await act(async () => requiredElement<HTMLElement>(
      "[data-ui-settings-subdialog]",
    ).dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })));
    await waitFor(() => document.querySelector("[data-ui-extension-review]") === null);
    expect(document.querySelector("[data-ui-settings-overlay]")).not.toBeNull();
    expect(document.activeElement).toBe(add);
    expect(actions).toEqual([
      { type: "request-local-plugin-review" },
      {
        type: "cancel-local-plugin-review",
        input: { reviewId: "review_example" },
      },
    ]);
  });

  it("uses exact state changes, explicit removal confirmation, and retry recovery", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let current = extensionSnapshot(baseSnapshot(), {
      runtimeState: "attention_required",
      diagnostic: {
        code: "catalog_refresh_failed",
        message: "Catalog load needs attention",
      },
    });
    const actions: Action[] = [];
    const client = createClient(current, async (action) => {
      actions.push(action);
      if (action.type === "set-plugin-install-state") {
        current = extensionSnapshot(current, {
          state: action.input.state,
          runtimeState: action.input.state === "installed" ? "loaded" : "inactive",
        });
        return pluginMutationAction(action.type, current);
      }
      if (action.type === "retry-plugin-refresh") {
        current = extensionSnapshot(current, { runtimeState: "loaded" });
        return pluginMutationAction(action.type, current);
      }
      return { ok: true, action: action.type, snapshot: current };
    });
    await mount(client, current);
    await act(async () => requiredButton("Open settings").click());

    const retry = requiredElement<HTMLButtonElement>("[data-ui-extension-retry]");
    await act(async () => retry.click());
    await waitFor(() => actions.length === 1);
    expect(actions[0]).toEqual({ type: "retry-plugin-refresh" });

    const toggle = requiredElement<HTMLInputElement>("[data-ui-extension-toggle]");
    await act(async () => toggle.click());
    await waitFor(() => actions.length === 2);
    expect(actions[1]).toEqual({
      type: "set-plugin-install-state",
      input: {
        pluginId: "plugin.example",
        version: "1.0.0",
        expectedState: "installed",
        state: "disabled",
      },
    });

    const remove = requiredElement<HTMLButtonElement>("[data-ui-extension-remove]");
    await act(async () => remove.click());
    await waitFor(() => document.querySelector("[data-ui-extension-remove-dialog]") !== null);
    expect(actions).toHaveLength(2);
    await waitFor(() => document.activeElement === requiredButton("Keep extension"));
    await act(async () => requiredButton("Keep extension").click());
    expect(actions).toHaveLength(2);
    expect(document.activeElement).toBe(remove);

    await act(async () => remove.click());
    await act(async () => requiredElement<HTMLButtonElement>(
      "[data-ui-extension-remove-confirm]",
    ).click());
    await waitFor(() => actions.length === 3);
    expect(actions[2]).toEqual({
      type: "set-plugin-install-state",
      input: {
        pluginId: "plugin.example",
        version: "1.0.0",
        expectedState: "disabled",
        state: "removed",
      },
    });
    expect(document.querySelector("[data-ui-extension-remove-dialog]")).toBeNull();
    expect(document.querySelector("[data-ui-extension-remove]")).toBeNull();
  });

  it("recovers a failed extension read through the canonical action path", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const ready = extensionSnapshot(baseSnapshot());
    const failed: Snapshot = {
      ...baseSnapshot(),
      pluginManagement: {
        ok: false,
        command: "readPluginManagement",
        error: {
          code: "command_error",
          category: "runtime",
          message: "Extension service is temporarily unavailable",
        },
        event: {
          id: "surface-plugin-management-failed",
          sequence: 0,
          type: "product.surface.command_rejected",
          command: "readPluginManagement",
          at: 1,
          error: {
            code: "command_error",
            category: "runtime",
            message: "Extension service is temporarily unavailable",
          },
        },
      },
      view: {
        ...baseSnapshot().view,
        settings: {
          ...baseSnapshot().view.settings,
          plugins: {
            state: "failed",
            installs: [],
            message: "Extension service is temporarily unavailable",
          },
        },
      },
    };
    const actions: Action[] = [];
    await mount(createClient(failed, async (action) => {
      actions.push(action);
      const output = action.type === "read-plugin-management"
        ? {
            kind: "web.plugin-management-action" as const,
            action: action.type,
            result: ready.pluginManagement.ok
              ? ready.pluginManagement.value
              : { kind: "product.plugin-management.unavailable" as const, reason: "not_configured" as const, message: "Unavailable" },
          }
        : undefined;
      return {
        ok: true,
        action: action.type,
        ...(output === undefined ? {} : { output }),
        snapshot: ready,
      };
    }), failed);

    await act(async () => requiredButton("Open settings").click());
    expect(document.body.textContent).toContain(
      "Extension service is temporarily unavailable",
    );
    await act(async () => requiredElement<HTMLButtonElement>(
      "[data-ui-extension-read-retry]",
    ).click());
    await waitFor(() => document.querySelector("[data-ui-extension-add]") !== null);
    expect(actions).toEqual([{ type: "read-plugin-management" }]);
  });

  it("settles appearance preferences through the canonical Product snapshot", async () => {
    let current = baseSnapshot();
    const actions: Action[] = [];
    const client: Client = {
      async readSnapshot() {
        return current;
      },
      async dispatchAction(action) {
        actions.push(action);
        if (action.type !== "update-preferences") {
          return { ok: true, action: action.type, snapshot: current };
        }
        current = {
          ...current,
          view: {
            ...current.view,
            theme: action.input.preferences.theme ?? current.view.theme,
            density: action.input.preferences.density ?? current.view.density,
          },
        };
        return { ok: true, action: action.type, snapshot: current };
      },
    };
    await mount(client);

    const shell = requiredElement<HTMLElement>("[data-ui-product-shell]");
    expect(shell.dataset.theme).toBe("system");
    expect(shell.dataset.density).toBe("comfortable");

    await act(async () => requiredButton("Open settings").click());
    const dark = requiredElement<HTMLButtonElement>(
      '[data-ui-preference="theme"][data-ui-preference-value="dark"]',
    );
    await act(async () => dark.click());
    await waitFor(() => shell.dataset.theme === "dark");

    const compact = requiredElement<HTMLButtonElement>(
      '[data-ui-preference="density"][data-ui-preference-value="compact"]',
    );
    await act(async () => compact.click());
    await waitFor(() => shell.dataset.density === "compact");

    expect(actions).toEqual([
      {
        type: "update-preferences",
        input: { preferences: { theme: "dark" } },
      },
      {
        type: "update-preferences",
        input: { preferences: { density: "compact" } },
      },
    ]);
    expect(dark.disabled).toBe(true);
    expect(compact.disabled).toBe(true);
    expect(document.querySelector("[data-ui-appearance-status]")?.textContent).toBe(
      "Appearance updated",
    );
  });

  it("keeps canonical appearance after a rejected preference update", async () => {
    const snapshot = baseSnapshot();
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        if (action.type === "update-preferences") {
          throw new Error("preference store unavailable");
        }
        return { ok: true, action: action.type, snapshot };
      },
    };
    await mount(client);
    await act(async () => requiredButton("Open settings").click());
    await act(async () => requiredElement<HTMLButtonElement>(
      '[data-ui-preference="theme"][data-ui-preference-value="dark"]',
    ).click());

    await waitFor(() => document.body.textContent?.includes("Appearance could not be updated") === true);
    expect(requiredElement<HTMLElement>("[data-ui-product-shell]").dataset.theme).toBe("system");
    expect(document.body.textContent).toContain("preference store unavailable");
  });

  it("preserves a rejected composer draft and clears it only after acceptance", async () => {
    const snapshot = baseSnapshot();
    const actions: Action[] = [];
    let accepted = false;
    const client = createClient(snapshot, async (action) => {
      actions.push(action);
      return accepted
        ? { ok: true, action: action.type, snapshot }
        : {
            ok: false,
            action: action.type,
            message: "Provider is not ready",
            snapshot,
          };
    });
    await mount(client);

    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    await setTextarea(textarea, "Keep this draft");
    await submitComposer();

    expect(textarea.value).toBe("Keep this draft");
    expect(document.querySelector("[role=alert]")?.textContent).toContain(
      "Provider is not ready",
    );
    expect(actions[0]).toMatchObject({
      type: "submit-conversation",
      input: { sessionId: "session_react", text: "Keep this draft" },
    });

    accepted = true;
    await submitComposer();
    expect(textarea.value).toBe("");
    expect(actions).toHaveLength(2);
  });

  it("allows drafting but prevents submission while Provider readiness is blocked", async () => {
    const ready = baseSnapshot();
    const blocked = {
      ...ready,
      view: {
        ...ready.view,
        conversationCanSubmit: false,
        providerRunGate: {
          ...ready.view.providerRunGate,
          state: "blocked" as const,
          canRun: false,
          canSubmitConversation: false,
          attentionRequired: true,
          message: "Configure a Provider",
        },
      },
    };
    const actions: Action[] = [];
    await mount(createClient(blocked, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot: blocked };
    }));

    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    await setTextarea(textarea, "Keep this draft until setup is complete");
    expect(textarea.disabled).toBe(false);
    expect(requiredButton("Send message").disabled).toBe(true);
    await submitComposer();
    expect(actions).toEqual([]);
    expect(textarea.value).toBe("Keep this draft until setup is complete");
  });

  it("submits with Enter while preserving Shift+Enter for multiline drafts", async () => {
    const snapshot = baseSnapshot();
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot };
    }));
    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    await setTextarea(textarea, "Keyboard submission");

    const shifted = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => textarea.dispatchEvent(shifted));
    expect(shifted.defaultPrevented).toBe(false);
    expect(actions).toEqual([]);

    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => textarea.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(true);
    expect(actions).toEqual([{
      type: "submit-conversation",
      input: { sessionId: "session_react", text: "Keyboard submission" },
    }]);
  });

  it("opens commands from the composer without changing its draft and restores keyboard focus", async () => {
    const snapshot = commandPaletteSnapshot();
    await mount(createClient(snapshot), snapshot);
    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    const opener = requiredElement<HTMLButtonElement>('[data-ui-action="open-commands"]');

    await setTextarea(textarea, "Keep this composer draft");
    opener.focus();
    await act(async () => opener.click());
    expect(document.querySelector("[data-ui-command-palette]")).not.toBeNull();
    expect(textarea.value).toBe("Keep this composer draft");

    await act(async () => requiredButton("Close commands").click());
    expect(document.querySelector("[data-ui-command-palette]")).toBeNull();
    expect(document.activeElement).toBe(opener);

    await setTextarea(textarea, "");
    textarea.focus();
    const shortcut = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => textarea.dispatchEvent(shortcut));
    expect(shortcut.defaultPrevented).toBe(true);
    await waitFor(() => document.activeElement?.hasAttribute("data-ui-command-search") === true);

    const search = requiredElement<HTMLInputElement>("[data-ui-command-search]");
    await act(async () => search.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })));
    expect(document.querySelector("[data-ui-command-palette]")).toBeNull();
    expect(document.activeElement).toBe(textarea);
  });

  it("searches commands and executes generated structured input after explicit review", async () => {
    const initial = commandPaletteSnapshot();
    const actions: Action[] = [];
    const client = createClient(initial, async (action) => {
      actions.push(action);
      if (action.type === "preview-command") {
        const snapshot = commandPreviewSnapshot(initial, "runnable", 10);
        return { ok: true, action: action.type, snapshot };
      }
      if (action.type === "execute-command") {
        const snapshot = commandExecutionSnapshot(
          commandPreviewSnapshot(initial, "runnable", 10),
          "completed",
          11,
        );
        return { ok: true, action: action.type, snapshot };
      }
      return { ok: true, action: action.type, snapshot: initial };
    });
    await mount(client, initial);
    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    await setTextarea(textarea, "Composer text stays independent");
    await act(async () => requiredButton("Commands").click());

    const search = requiredElement<HTMLInputElement>("[data-ui-command-search]");
    await setInput(search, "memory");
    expect(document.querySelector('[data-ui-command="product.status"]')).toBeNull();
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => search.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(true);

    await setInput(
      requiredElement<HTMLInputElement>('[data-ui-command-field="/query"] input'),
      "recent decisions",
    );
    const limitField = requiredElement<HTMLElement>('[data-ui-command-field="/limit"]');
    await act(async () => requiredElement<HTMLInputElement>(
      '[data-ui-command-field="/limit"] > label input',
    ).click());
    await setInput(requiredElement<HTMLInputElement>(
      '[data-ui-command-field="/limit"] input[type="number"]',
    ), "12");
    expect(limitField.textContent).toContain("Limit");

    await act(async () => requiredButton("Review").click());
    await waitFor(() => document.querySelector(
      '[data-ui-command-preview="runnable"]',
    ) !== null);
    expect(actions[0]).toEqual({
      type: "preview-command",
      input: {
        commandId: "product.memory.inspect",
        input: { query: "recent decisions", limit: 12 },
      },
    });
    expect(textarea.value).toBe("Composer text stays independent");

    await act(async () => requiredButton("Execute").click());
    await waitFor(() => document.querySelector(
      '[data-ui-command-execution="completed"]',
    ) !== null);
    expect(actions[1]).toEqual({
      type: "execute-command",
      input: {
        commandId: "product.memory.inspect",
        input: { query: "recent decisions", limit: 12 },
      },
    });
    expect(document.body.textContent).toContain("Command completed");
    await act(async () => requiredButton("Done").click());
    expect(document.querySelector("[data-ui-command-palette]")).toBeNull();
  });

  it("fails closed for unsupported inputs and retries a rejected preview with the same input", async () => {
    const initial = commandPaletteSnapshot();
    const previews: Action[] = [];
    let previewAttempt = 0;
    await mount(createClient(initial, async (action) => {
      if (action.type !== "preview-command") {
        return { ok: true, action: action.type, snapshot: initial };
      }
      previews.push(action);
      previewAttempt += 1;
      const snapshot = commandPreviewSnapshot(
        initial,
        previewAttempt === 1 ? "rejected" : "runnable",
        previewAttempt,
      );
      return { ok: true, action: action.type, snapshot };
    }), initial);
    await act(async () => requiredButton("Commands").click());

    await act(async () => requiredElement<HTMLButtonElement>(
      '[data-ui-command="product.unsupported"]',
    ).click());
    expect(document.querySelector("[data-ui-command-input]")).toBeNull();
    expect(document.body.textContent).toContain("cannot be represented safely");

    await act(async () => requiredButton("Back to commands").click());
    await act(async () => requiredElement<HTMLButtonElement>(
      '[data-ui-command="product.memory.inspect"]',
    ).click());
    await setInput(
      requiredElement<HTMLInputElement>('[data-ui-command-field="/query"] input'),
      "preserve this input",
    );
    await act(async () => requiredButton("Review").click());
    await waitFor(() => document.querySelector(
      '[data-ui-command-preview="rejected"]',
    ) !== null);
    expect(document.body.textContent).toContain("Input needs attention");

    await act(async () => requiredButton("Review again").click());
    await waitFor(() => document.querySelector(
      '[data-ui-command-preview="runnable"]',
    ) !== null);
    expect(previews).toEqual([
      {
        type: "preview-command",
        input: {
          commandId: "product.memory.inspect",
          input: { query: "preserve this input" },
        },
      },
      {
        type: "preview-command",
        input: {
          commandId: "product.memory.inspect",
          input: { query: "preserve this input" },
        },
      },
    ]);
  });

  it("suppresses duplicate command requests and retries rejected execution", async () => {
    const initial = commandPaletteSnapshot();
    const previewDeferred = deferred<ActionResult>();
    const executionDeferred = deferred<ActionResult>();
    let previewCalls = 0;
    let executionCalls = 0;
    let executionAttempt = 0;
    const client = createClient(initial, async (action) => {
      if (action.type === "preview-command") {
        previewCalls += 1;
        return await previewDeferred.promise;
      }
      if (action.type === "execute-command") {
        executionCalls += 1;
        executionAttempt += 1;
        if (executionAttempt === 1) return await executionDeferred.promise;
        const completed = commandExecutionSnapshot(
          commandPreviewSnapshot(initial, "runnable", 1),
          "completed",
          3,
        );
        return { ok: true, action: action.type, snapshot: completed };
      }
      return { ok: true, action: action.type, snapshot: initial };
    });
    await mount(client, initial);
    await act(async () => requiredButton("Commands").click());
    await act(async () => requiredElement<HTMLButtonElement>(
      '[data-ui-command="product.memory.inspect"]',
    ).click());
    await setInput(
      requiredElement<HTMLInputElement>('[data-ui-command-field="/query"] input'),
      "one request only",
    );

    const review = requiredButton("Review");
    await act(async () => {
      review.click();
      review.click();
    });
    expect(previewCalls).toBe(1);
    previewDeferred.resolve({
      ok: true,
      action: "preview-command",
      snapshot: commandPreviewSnapshot(initial, "runnable", 1),
    });
    await waitFor(() => document.querySelector(
      '[data-ui-command-preview="runnable"]',
    ) !== null);

    const execute = requiredButton("Execute");
    await act(async () => {
      execute.click();
      execute.click();
    });
    expect(executionCalls).toBe(1);
    executionDeferred.resolve({
      ok: true,
      action: "execute-command",
      snapshot: commandExecutionSnapshot(
        commandPreviewSnapshot(initial, "runnable", 1),
        "rejected",
        2,
      ),
    });
    await waitFor(() => document.querySelector(
      '[data-ui-command-execution="rejected"]',
    ) !== null);

    await act(async () => requiredButton("Try again").click());
    await waitFor(() => document.querySelector(
      '[data-ui-command-execution="completed"]',
    ) !== null);
    expect(executionCalls).toBe(2);
  });

  it("anchors the command palette inside narrow viewports without horizontal overflow", () => {
    expect(STYLESHEET).toMatch(
      /@media\(max-width:620px\)\{[^}]*position:fixed;right:12px;bottom:12px;left:12px;width:auto;/u,
    );
  });

  it("turns the Product topbar into macOS integrated window chrome", () => {
    expect(STYLESHEET).toContain("data-window-chrome=integrated-macos")
    expect(STYLESHEET).toContain("-webkit-app-region:drag")
    expect(STYLESHEET).toContain("-webkit-app-region:no-drag")
  });

  it("uploads attachment bytes through the trusted client and removes canonical drafts through Product", async () => {
    const initial = baseSnapshot();
    const uploaded = attachmentSnapshot(initial);
    const actions: Action[] = [];
    const uploads: Array<{
      readonly mediaType: string;
      readonly label?: string;
      readonly sessionId?: string;
      readonly content: readonly number[];
    }> = [];
    const client: Client = {
      async readSnapshot() {
        return initial;
      },
      async dispatchAction(action) {
        actions.push(action);
        return { ok: true, action: action.type, snapshot: initial };
      },
      async uploadAttachment(request) {
        uploads.push({
          mediaType: request.mediaType,
          ...(request.label === undefined ? {} : { label: request.label }),
          ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
          content: Array.from(request.content),
        });
        return {
          kind: "web.attachment-uploaded",
          attachment: uploaded.view.conversationAttachments[0]!,
          attachments: {
            kind: "product.conversation-attachments",
            draftKey: "session:session_react",
            sessionId: "session_react",
            attachments: uploaded.view.conversationAttachments,
          },
          snapshot: uploaded,
        };
      },
    };
    await mount(client);
    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    await setTextarea(textarea, "Keep the draft while uploading");
    const input = requiredElement<HTMLInputElement>("[data-ui-attachment-input]");
    const file = new File([new Uint8Array([1, 2, 3])], "diagram.png", {
      type: "image/png",
    });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await waitFor(() => document.querySelector("[data-ui-attachment=resource_react]") !== null);

    expect(uploads).toEqual([{
      mediaType: "image/png",
      label: "diagram.png",
      sessionId: "session_react",
      content: [1, 2, 3],
    }]);
    expect(textarea.value).toBe("Keep the draft while uploading");
    expect(document.body.textContent).toContain("diagram.png");

    await act(async () => requiredButton("Remove diagram.png").click());
    expect(actions).toEqual([{
      type: "remove-conversation-attachment",
      input: { resourceId: "resource_react", sessionId: "session_react" },
    }]);
  });

  it("shows attachment preview failure and retries the same resource without losing state", async () => {
    const snapshot = attachmentSnapshot(baseSnapshot());
    let previewReadCount = 0;
    const released: string[] = [];
    let resolveRetry: (() => void) | undefined;
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      async prepareResourceDelivery(request) {
        expect(request).toEqual({
          resourceId: "resource_react",
          sha256: "a".repeat(64),
          purpose: "preview",
          sessionId: "session_react",
        });
        previewReadCount += 1;
        if (previewReadCount === 1) throw new Error("Preview read failed");
        return await new Promise((resolve) => {
          resolveRetry = () => resolve({
            kind: "web.resource-delivery",
            url: "/resource-delivery?token=opaque",
            resourceId: "resource_react",
            sha256: "a".repeat(64),
            resourceKind: "image",
            mediaType: "image/png",
            sizeBytes: 3,
            purpose: "preview",
            sessionId: "session_react",
            expiresAt: 10_000,
          });
        });
      },
      async releaseResourceDelivery(delivery) {
        released.push(delivery.url);
      },
    };

    await mount(client, snapshot);
    await waitFor(() => document.querySelector(
      '[data-ui-resource-preview="resource_react"][data-ui-preview-state="failed"]',
    ) !== null);
    expect(document.body.textContent).toContain("Preview unavailable");

    await act(async () => requiredButton("Retry diagram.png").click());
    await waitFor(() => resolveRetry !== undefined);
    expect(previewReadCount).toBe(2);
    expect(document.querySelector(
      '[data-ui-resource-preview="resource_react"]',
    )?.getAttribute("data-ui-preview-state")).toBe("loading");
    expect(document.querySelector(
      '[data-ui-resource-preview-retry="resource_react"]',
    )).toBeNull();

    await act(async () => resolveRetry?.());
    await waitFor(() => document.querySelector('img[alt="diagram.png"]') !== null);
    const image = requiredElement<HTMLImageElement>('img[alt="diagram.png"]');
    expect(image.src).toContain("/resource-delivery?token=opaque");
    await act(async () => image.dispatchEvent(new Event("load")));
    expect(document.querySelector(
      '[data-ui-resource-preview="resource_react"]',
    )?.getAttribute("data-ui-preview-state")).toBe("ready");
    await act(async () => mounted.pop()?.unmount());
    expect(released).toEqual(["/resource-delivery?token=opaque"]);
  });

  it("uses the same failed preview contract for generated image resources", async () => {
    const snapshot = generatedResourceSnapshot(baseSnapshot());
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      async prepareResourceDelivery() {
        throw new Error("Generated preview read failed");
      },
    };
    await mount(client, snapshot);

    await waitFor(() => document.querySelector(
      '[data-ui-resource-preview="generated_resource_react"][data-ui-preview-state="failed"]',
    ) !== null);
    expect(requiredButton("Retry Generated image")).not.toBeNull();
    expect(document.querySelector(
      '[data-ui-resource="generated_resource_react"]',
    )?.textContent).toContain("Preview unavailable");
  });

  it("presents non-image resources without eagerly preparing media delivery", async () => {
    const snapshot = nonImageResourceSnapshot(baseSnapshot());
    let previewReadCount = 0;
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      async prepareResourceDelivery() {
        previewReadCount += 1;
        throw new Error("non-image preview should not be requested");
      },
    };
    await mount(client, snapshot);

    const iconClasses: string[] = [];
    for (const [kind, label, mediaType] of [
      ["file", "File", "application/octet-stream"],
      ["video", "Video", "video/mp4"],
      ["audio", "Audio", "audio/mpeg"],
      ["document", "Document", "application/pdf"],
      ["artifact", "Artifact", "application/json"],
      ["log", "Log", "text/plain"],
      ["patch", "Patch", "text/x-diff"],
      ["url", "Link", "text/uri-list"],
    ] as const) {
      const resource = requiredElement<HTMLElement>(
        `[data-ui-resource=resource_${kind}]`,
      );
      expect(resource.querySelector("[data-ui-resource-presentation]")?.getAttribute(
        "data-ui-resource-presentation",
      )).toBe(kind);
      expect(resource.textContent).toContain(label);
      expect(resource.textContent).toContain(mediaType);
      expect(resource.textContent).toContain("2.0 KB");
      const icon = resource.querySelector("[data-ui-resource-icon] svg");
      expect(icon).not.toBeNull();
      iconClasses.push(icon?.getAttribute("class") ?? "");
      if (kind === "audio" || kind === "video") {
        expect(resource.textContent).not.toContain("No preview");
        expect(resource.querySelector("audio, video")).toBeNull();
        expect(requiredButton(`Play ${label}`)).not.toBeNull();
        expect(resource.querySelector("[data-ui-media-state=idle]")).not.toBeNull();
      } else {
        expect(resource.textContent).toContain("No preview");
        expect(resource.querySelector("audio, video, button, a")).toBeNull();
      }
    }
    expect(new Set(iconClasses).size).toBe(8);
    expect(previewReadCount).toBe(0);
  });

  it("prepares audio on demand, uses native controls, and releases it on teardown", async () => {
    const snapshot = nonImageResourceSnapshot(baseSnapshot());
    const prepared: Array<{ readonly resourceId: string; readonly purpose: string }> = [];
    const released: string[] = [];
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      async prepareResourceDelivery(request) {
        prepared.push({ resourceId: request.resourceId, purpose: request.purpose });
        return mediaDelivery(request, {
          url: "/resource-delivery?token=audio",
          resourceKind: "audio",
          mediaType: "audio/mpeg",
          expiresAt: Date.now() + 60_000,
        });
      },
      async releaseResourceDelivery(delivery) {
        released.push(delivery.url);
      },
    };

    await mount(client, snapshot);
    expect(prepared).toEqual([]);
    await act(async () => requiredButton("Play Audio").click());
    await waitFor(() => document.querySelector(
      '[data-ui-resource-media="resource_audio"] audio[controls]',
    ) !== null);
    const audio = requiredElement<HTMLAudioElement>(
      '[data-ui-resource-media="resource_audio"] audio',
    );
    expect(audio.getAttribute("src")).toBe("/resource-delivery?token=audio");
    expect(audio.preload).toBe("metadata");
    expect(prepared).toEqual([{ resourceId: "resource_audio", purpose: "media" }]);
    await act(async () => audio.dispatchEvent(new Event("loadedmetadata")));
    expect(document.querySelector(
      '[data-ui-resource-media="resource_audio"]',
    )?.getAttribute("data-ui-media-state")).toBe("ready");
    expect(play).toHaveBeenCalledTimes(1);

    await act(async () => mounted.pop()?.unmount());
    expect(released).toEqual(["/resource-delivery?token=audio"]);
  });

  it("renews expired media once, restores position, and exposes retry for other failures", async () => {
    const snapshot = nonImageResourceSnapshot(baseSnapshot());
    let prepareCount = 0;
    const released: string[] = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      async prepareResourceDelivery(request) {
        prepareCount += 1;
        return mediaDelivery(request, {
          url: `/resource-delivery?token=audio-${prepareCount}`,
          resourceKind: "audio",
          mediaType: "audio/mpeg",
          expiresAt: prepareCount === 1 ? Date.now() - 1 : Date.now() + 60_000,
        });
      },
      async releaseResourceDelivery(delivery) {
        released.push(delivery.url);
      },
    };

    await mount(client, snapshot);
    await act(async () => requiredButton("Play Audio").click());
    await waitFor(() => document.querySelector(
      'audio[src="/resource-delivery?token=audio-1"]',
    ) !== null);
    const expired = requiredElement<HTMLAudioElement>(
      'audio[src="/resource-delivery?token=audio-1"]',
    );
    Object.defineProperties(expired, {
      currentTime: { configurable: true, value: 37, writable: true },
      paused: { configurable: true, value: false },
    });
    await act(async () => expired.dispatchEvent(new Event("error")));
    await waitFor(() => document.querySelector(
      'audio[src="/resource-delivery?token=audio-2"]',
    ) !== null);
    const renewed = requiredElement<HTMLAudioElement>(
      'audio[src="/resource-delivery?token=audio-2"]',
    );
    await act(async () => renewed.dispatchEvent(new Event("loadedmetadata")));
    expect(renewed.currentTime).toBe(37);
    expect(prepareCount).toBe(2);
    expect(released).toEqual(["/resource-delivery?token=audio-1"]);

    await act(async () => renewed.dispatchEvent(new Event("error")));
    expect(prepareCount).toBe(2);
    expect(requiredButton("Retry Audio")).not.toBeNull();
    expect(released).toEqual([
      "/resource-delivery?token=audio-1",
      "/resource-delivery?token=audio-2",
    ]);
    await act(async () => requiredButton("Retry Audio").click());
    await waitFor(() => prepareCount === 3);
  });

  it("retains the composer draft when trusted attachment upload rejects the file", async () => {
    const snapshot = baseSnapshot();
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      async uploadAttachment() {
        throw new Error("active model does not support image attachment input");
      },
    };
    await mount(client);
    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    await setTextarea(textarea, "Do not lose this question");
    const input = requiredElement<HTMLInputElement>("[data-ui-attachment-input]");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["image"], "unsupported.png", { type: "image/png" })],
    });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await waitFor(() => document.querySelector("[role=alert]") !== null);

    expect(document.querySelector("[role=alert]")?.textContent).toContain(
      "active model does not support image attachment input",
    );
    expect(textarea.value).toBe("Do not lose this question");
  });

  it("opens trusted Provider onboarding when required and clears the submitted credential", async () => {
    const blocked = {
      ...baseSnapshot(),
      view: {
        ...baseSnapshot().view,
        providerRunGate: {
          ...baseSnapshot().view.providerRunGate,
          state: "blocked" as const,
          canRun: false,
          attentionRequired: true,
          message: "Connect a provider",
        },
      },
    };
    const ready = baseSnapshot();
    const saved = {
      kind: "local-host.configured-provider-list" as const,
      providers: [{
        connectionId: "openai",
        providerId: "openai",
        presetId: "openai" as const,
        credentialConfigured: true,
        active: true,
        endpoints: [{
          id: "openai",
          protocol: { id: "openai-chat-completions" },
          model: {
            id: "gpt-5.4",
            operations: ["conversation"],
            inputModalities: ["text"],
            outputModalities: ["text"],
            features: ["tool_calling"],
          },
          active: true,
        }],
      }],
    };
    const saveRequests: unknown[] = [];
    const client: Client = {
      async readSnapshot() {
        return blocked;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot: blocked };
      },
      async listProviders() {
        return { kind: "local-host.configured-provider-list", providers: [] };
      },
      async saveProvider(request) {
        saveRequests.push(request);
        return {
          kind: "web.provider-mutated",
          providers: saved,
          snapshot: ready,
        };
      },
      async removeProvider() {
        throw new Error("not used");
      },
    };
    await mount(client);
    await waitFor(() => document.querySelector("[aria-label=Settings]") !== null);

    const form = requiredElement<HTMLFormElement>("[data-ui-provider-form]");
    const modelInput = requiredElement<HTMLInputElement>('input[name="conversationModelId"]');
    const advanced = requiredElement<HTMLDetailsElement>("[data-ui-provider-advanced]");
    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("Connect a model");
    expect(document.activeElement).toBe(modelInput);
    expect(advanced.open).toBe(false);
    expect(advanced.textContent).toContain("Image generation model");
    expect(document.body.textContent).not.toMatch(/trusted host|renderer|redacted|Theme|Density/u);
    modelInput.value = "gpt-5.4";
    requiredElement<HTMLInputElement>('input[name="credential"]').value = "secret-provider-key";
    await act(async () => {
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(() => document.body.textContent?.includes("Provider saved") === true);

    expect(saveRequests).toEqual([{
      presetId: "openai",
      conversationModelId: "gpt-5.4",
      credential: "secret-provider-key",
      makeConversationActive: true,
    }]);
    expect(document.body.textContent).toContain("openai");
    expect(document.body.textContent).not.toContain("secret-provider-key");
    expect(requiredElement<HTMLInputElement>('input[name="credential"]').value).toBe("");
  });

  it("keeps optional Provider capabilities behind one advanced disclosure", async () => {
    const snapshot = baseSnapshot();
    const saveRequests: unknown[] = [];
    const providers = {
      kind: "local-host.configured-provider-list" as const,
      providers: [],
    };
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      async listProviders() {
        return providers;
      },
      async saveProvider(request) {
        saveRequests.push(request);
        return { kind: "web.provider-mutated", providers, snapshot };
      },
      async removeProvider() {
        throw new Error("not used");
      },
    };
    await mount(client);
    await act(async () => requiredButton("Open settings").click());

    const preset = requiredElement<HTMLSelectElement>('select[name="presetId"]');
    await act(async () => {
      preset.value = "openai-compatible";
      preset.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const advanced = requiredElement<HTMLDetailsElement>("[data-ui-provider-advanced]");
    expect(advanced.open).toBe(false);
    expect(advanced.textContent).toContain("Accept image input");
    expect(advanced.textContent).toContain("Support tool calling");
    advanced.open = true;

    await setInput(requiredElement<HTMLInputElement>('input[name="conversationModelId"]'), "custom-chat");
    await setInput(requiredElement<HTMLInputElement>('input[name="baseUrl"]'), "https://provider.example.test/v1");
    await setInput(requiredElement<HTMLInputElement>('input[name="credential"]'), "custom-secret");
    await setInput(requiredElement<HTMLInputElement>('input[name="imageGenerationModelId"]'), "custom-image");
    const imageInput = requiredElement<HTMLInputElement>('input[name="conversationInputImage"]');
    const toolCalling = requiredElement<HTMLInputElement>('input[name="conversationToolCalling"]');
    imageInput.checked = true;
    toolCalling.checked = true;
    await submitForm(requiredElement<HTMLFormElement>("[data-ui-provider-form]"));

    expect(saveRequests).toEqual([{
      presetId: "openai-compatible",
      conversationModelId: "custom-chat",
      conversationInputModalities: ["text", "image"],
      conversationFeatures: ["tool_calling"],
      imageGenerationModelId: "custom-image",
      baseUrl: "https://provider.example.test/v1",
      credential: "custom-secret",
      makeConversationActive: true,
    }]);
    expect(document.body.textContent).not.toContain("custom-secret");
  });

  it("keeps Provider loading and mutation errors inside the visible settings dialog", async () => {
    const snapshot = baseSnapshot();
    const providerList = {
      kind: "local-host.configured-provider-list" as const,
      providers: [],
    };
    let resolveProviders: ((value: typeof providerList) => void) | undefined;
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      listProviders() {
        return new Promise((resolve) => {
          resolveProviders = resolve;
        });
      },
      async saveProvider() {
        throw new Error("Provider credential was rejected");
      },
      async removeProvider() {
        throw new Error("not used");
      },
    };
    await mount(client);
    await act(async () => requiredButton("Open settings").click());

    const dialog = requiredElement<HTMLElement>('[role="dialog"][aria-label="Settings"]');
    expect(dialog.querySelector("[role=status]")?.textContent).toContain("Loading providers");
    expect(dialog.querySelector("[data-ui-provider-loading]")).not.toBeNull();

    await act(async () => resolveProviders?.(providerList));
    await waitFor(() => dialog.textContent?.includes("Add a provider") === true);
    expect(dialog.textContent).not.toContain("Loading providers");
    expect(dialog.querySelector("[data-ui-provider-loading]")).toBeNull();
    expect(dialog.querySelector("[data-ui-provider-empty]")).not.toBeNull();

    requiredElement<HTMLInputElement>('input[name="conversationModelId"]').value = "gpt-test";
    requiredElement<HTMLInputElement>('input[name="credential"]').value = "rejected-secret";
    await submitForm(requiredElement<HTMLFormElement>("[data-ui-provider-form]"));
    await waitFor(() => dialog.querySelector("[role=alert]") !== null);

    expect(dialog.querySelector("[role=alert]")?.textContent)
      .toContain("Provider credential was rejected");
    expect(document.querySelector("[data-ui-error]")).toBeNull();
    expect(document.querySelector("[data-ui-settings-overlay]")).not.toBeNull();
  });

  it("replaces Provider loading with an inline read failure", async () => {
    const snapshot = baseSnapshot();
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      async listProviders() {
        throw new Error("Provider list is unavailable");
      },
      async saveProvider() {
        throw new Error("not used");
      },
      async removeProvider() {
        throw new Error("not used");
      },
    };
    await mount(client);
    await act(async () => requiredButton("Open settings").click());

    const dialog = requiredElement<HTMLElement>('[role="dialog"][aria-label="Settings"]');
    await waitFor(() => dialog.querySelector("[role=alert]") !== null);

    expect(dialog.querySelector("[role=alert]")?.textContent)
      .toContain("Provider list is unavailable");
    expect(dialog.textContent).not.toContain("Loading providers");
  });

  it("keeps Plan, Goal, and Side Query behind one contextual workflow panel", async () => {
    const snapshot = {
      ...baseSnapshot(),
      view: { ...baseSnapshot().view, sideQueryCanStart: true },
    };
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot };
    }));

    await act(async () => requiredButton("Workflows").click());
    const planForm = requiredElement<HTMLFormElement>("[data-ui-plan-form]");
    planForm.querySelector<HTMLTextAreaElement>('textarea[name="text"]')!.value = "Plan the renderer cutover";
    await submitForm(planForm);

    await act(async () => requiredButton("Goal").click());
    const goalForm = requiredElement<HTMLFormElement>("[data-ui-goal-form]");
    goalForm.querySelector<HTMLTextAreaElement>('textarea[name="objective"]')!.value = "Finish the release gate";
    goalForm.querySelector<HTMLTextAreaElement>('textarea[name="successCriteria"]')!.value = "All tests pass\nOne renderer remains";
    await submitForm(goalForm);

    await act(async () => requiredButton("Ask aside").click());
    const sideForm = requiredElement<HTMLFormElement>("[data-ui-side-query-form]");
    sideForm.querySelector<HTMLTextAreaElement>('textarea[name="question"]')!.value = "What changed in this task?";
    await submitForm(sideForm);

    expect(actions).toEqual([
      {
        type: "start-plan-generation",
        input: { text: "Plan the renderer cutover", sessionId: "session_react" },
      },
      {
        type: "start-goal",
        input: {
          sessionId: "session_react",
          objective: "Finish the release gate",
          successCriteria: ["All tests pass", "One renderer remains"],
          boundaries: [],
          constraints: [],
          stopPolicy: { maxAttempts: 5, maxConsecutiveBlockedAttempts: 2 },
        },
      },
      {
        type: "start-side-query",
        input: { question: "What changed in this task?" },
      },
    ]);
  });

  it("dispatches regeneration as a fresh Product conversation operation", async () => {
    const snapshot = baseSnapshot();
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot };
    }));

    await act(async () => requiredButton("Regenerate").click());
    expect(actions).toEqual([{
      type: "regenerate-conversation",
      input: { sessionId: "session_react" },
    }]);
  });

  it("continues a current image capability request through the trusted host", async () => {
    const snapshot = capabilitySnapshot(baseSnapshot());
    const requests: unknown[] = [];
    const client: Client = {
      async readSnapshot() {
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      async setupImageGenerationAndContinue(request) {
        requests.push(request);
        return { kind: "web.capability-setup", snapshot: baseSnapshot() };
      },
    };
    await mount(client);
    const form = requiredElement<HTMLFormElement>("[data-ui-capability-form]");
    const model = form.querySelector<HTMLInputElement>("input")!;
    await setInput(model, "gpt-image-1");
    await submitForm(form);

    expect(requests).toEqual([{
      operationId: "operation_react",
      sessionId: "session_react",
      operation: "image.generate",
      imageGenerationModelId: "gpt-image-1",
    }]);
  });

  it("submits human-readable recovery review while preserving the exact revision contract", async () => {
    const snapshot = recoverySnapshot(baseSnapshot());
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot: baseSnapshot() };
    }));
    const attempts = requiredElement<HTMLDetailsElement>("[data-ui-recovery-attempts]");
    expect(attempts.open).toBe(false);
    expect(attempts.textContent).toContain("Attempt 1");
    expect(attempts.textContent).toContain("Needs review");
    expect(document.body.textContent).toContain("This tool needs a quick review");
    expect(document.body.textContent).toContain("I saw it finish");
    expect(document.body.textContent).not.toContain("Wanex");
    expect(document.body.textContent).not.toContain("Observed result JSON");
    expect(document.body.textContent).not.toContain("operator recovery decision");
    const form = requiredElement<HTMLFormElement>("[data-ui-recovery-item] form");
    await submitForm(form);

    expect(actions).toEqual([{
      type: "resolve-conversation-recovery",
      input: {
        sessionId: "session_react",
        recoveryId: "recovery_react",
        expectedRecoveryRevision: 2,
        decision: "confirm_succeeded",
        reason: "Reviewed the interrupted step",
        content: [{
          type: "text",
          text: "I verified that the tool finished successfully.",
        }],
      },
    }]);
  });

  it("does not attach observed content to retry or end-turn recovery decisions", async () => {
    const initial = recoverySnapshot(baseSnapshot());
    const operation = initial.conversation.operation!;
    const recovery = operation.recovery!;
    const snapshot: Snapshot = {
      ...initial,
      conversation: {
        ...initial.conversation,
        operation: {
          ...operation,
          recovery: {
            ...recovery,
            items: [{
              ...recovery.items[0]!,
              availableDecisions: ["retry", "abandon_turn"],
            }],
          },
        },
      },
    };
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot: baseSnapshot() };
    }));
    const form = requiredElement<HTMLFormElement>("[data-ui-recovery-item] form");
    const decision = requiredElement<HTMLSelectElement>("[data-ui-recovery-item] select");
    await act(async () => {
      decision.value = "retry";
      decision.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await submitForm(form);

    expect(actions).toEqual([{
      type: "resolve-conversation-recovery",
      input: {
        sessionId: "session_react",
        recoveryId: "recovery_react",
        expectedRecoveryRevision: 2,
        decision: "retry",
        reason: "Reviewed the interrupted step",
      },
    }]);
  });

  it("submits Guide current through the Product operation without lower identities", async () => {
    const snapshot = runningSnapshot();
    const actions: Action[] = [];
    const client = createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot };
    });
    await mount(client);

    const guide = requiredButton("Guide current");
    await act(async () => guide.click());
    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    await setTextarea(textarea, "Focus on the API boundary");
    await submitComposer();

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      type: "steer-current-response",
      input: {
        operationId: "operation_react",
        sessionId: "session_react",
        text: "Focus on the API boundary",
      },
    });
    expect(JSON.stringify(actions[0])).not.toContain("attemptId");
    expect(JSON.stringify(actions[0])).not.toContain("controlId");
    expect(JSON.stringify(actions[0])).not.toContain("idempotencyKey");
  });

  it("allows guided follow-up while submit remains in flight without regressing the snapshot", async () => {
    const initial = {
      ...baseSnapshot(),
      eventStreamId: "stream_react",
      generatedAt: 1,
      eventCursor: 0,
    };
    const running = {
      ...runningSnapshot(),
      eventStreamId: "stream_react",
      generatedAt: 2,
      eventCursor: 1,
    };
    const queued = {
      ...pendingFollowUpSnapshot(running),
      generatedAt: 3,
      eventCursor: 2,
    };
    const staleParent = {
      ...initial,
      generatedAt: 4,
      eventCursor: 3,
    };
    const actions: Action[] = [];
    let listener: ((event: ClientEvent) => void) | undefined;
    let resolveSubmit: ((result: {
      readonly ok: true;
      readonly action: "submit-conversation";
      readonly snapshot: Snapshot;
    }) => void) | undefined;
    let resolveQueue: ((result: {
      readonly ok: true;
      readonly action: "queue-guided-follow-up";
      readonly snapshot: Snapshot;
    }) => void) | undefined;
    const client: Client = {
      async readSnapshot() {
        return running;
      },
      dispatchAction(action) {
        actions.push(action);
        if (action.type === "submit-conversation") {
          return new Promise((resolve) => {
            resolveSubmit = resolve;
          });
        }
        if (action.type === "queue-guided-follow-up") {
          return new Promise((resolve) => {
            resolveQueue = resolve;
          });
        }
        return Promise.resolve({ ok: true, action: action.type, snapshot: running });
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    await mount(client, initial);
    await waitFor(() => listener !== undefined);

    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    await setTextarea(textarea, "Start the long response");
    await submitComposer();
    await waitFor(() => resolveSubmit !== undefined);

    await act(async () => listener?.({ kind: "snapshot-invalidated" }));
    await waitFor(() => document.querySelector("[data-ui-mode-switch]") !== null);
    await act(async () => listener?.({
      kind: "assistant-text-delta",
      operationId: "operation_react",
      sessionId: "session_react",
      text: "Partial response remains visible",
    }));
    await waitFor(() => document.querySelector("[data-ui-transient-assistant]") !== null);
    expect(requiredButton("Stop").disabled).toBe(false);

    await act(async () => requiredButton("Queue after current").click());
    await setTextarea(textarea, "Check the release notes next");
    await submitComposer();
    await waitFor(() => resolveQueue !== undefined);

    expect(actions.map((action) => action.type)).toEqual([
      "submit-conversation",
      "queue-guided-follow-up",
    ]);
    await act(async () => resolveQueue?.({
      ok: true,
      action: "queue-guided-follow-up",
      snapshot: queued,
    }));
    await waitFor(() => document.querySelector('[data-ui-pending="queued-follow-up"]') !== null);
    expect(document.querySelector("[data-ui-transient-assistant]")?.textContent)
      .toContain("Partial response remains visible");

    await act(async () => resolveSubmit?.({
      ok: true,
      action: "submit-conversation",
      snapshot: staleParent,
    }));

    expect(document.querySelector("[data-ui-conversation-timeline]")?.getAttribute(
      "data-ui-conversation-state",
    )).toBe("running");
    expect(document.querySelector('[data-ui-pending="queued-follow-up"]')?.textContent)
      .toContain("Check the release notes next");
  });

  it("shows assistant working state only while streamed text is transient", async () => {
    const running = runningSnapshot();
    const completed = baseSnapshot();
    let listener: ((event: ClientEvent) => void) | undefined;
    const client: Client = {
      async readSnapshot() {
        return completed;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot: completed };
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    await mount(client, running);
    await waitFor(() => listener !== undefined);

    await act(async () => listener?.({
      kind: "assistant-text-delta",
      operationId: "operation_react",
      sessionId: "session_react",
      text: "Streaming response",
    }));

    const transient = requiredElement<HTMLElement>("[data-ui-transient-assistant]");
    expect(transient.querySelector("[data-ui-message-header]")?.textContent)
      .toContain("Working");
    expect(transient.textContent).toContain("Streaming response");

    await act(async () => listener?.({ kind: "snapshot-invalidated" }));
    await waitFor(() => document.querySelector("[data-ui-transient-assistant]") === null);

    const assistant = requiredElement<HTMLElement>(
      "[data-ui-conversation-row=row_assistant]",
    );
    expect(assistant.querySelector("[data-ui-message-header]")).toBeNull();
    expect(assistant.textContent).not.toContain("Working");
  });

  it("renders a queued follow-up with its opaque Product operation identity", async () => {
    const snapshot = pendingFollowUpSnapshot(runningSnapshot());
    await mount(createClient(snapshot));

    const pending = requiredElement<HTMLElement>(
      '[data-ui-pending="queued-follow-up"]',
    );
    expect(pending.getAttribute("data-ui-pending-operation-id"))
      .toBe("operation_follow_up_react");
    expect(pending.getAttribute("data-ui-pending-state")).toBe("queued");
    expect(pending.textContent).toContain("Check the release notes next");
    expect(document.body.innerHTML).not.toContain("attemptId");
    expect(document.body.innerHTML).not.toContain("jobId");
  });

  it("renders pending same-turn steering without exposing lower execution identities", async () => {
    const snapshot = pendingSteeringSnapshot(runningSnapshot());
    await mount(createClient(snapshot));

    const pending = requiredElement<HTMLElement>(
      '[data-ui-pending="steering"]',
    );
    expect(pending.getAttribute("data-ui-pending-operation-id")).toBeNull();
    expect(pending.getAttribute("data-ui-pending-state")).toBe("Pending");
    expect(pending.textContent).toContain("Focus on the stable public boundary");
    expect(document.body.innerHTML).not.toContain("steering_react");
    expect(document.body.innerHTML).not.toContain("attemptId");
  });

  it("renders approval evidence and dispatches exact independent decisions", async () => {
    const snapshot = approvalSnapshot(runningSnapshot());
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      const remaining = action.type === "resolve-conversation-approval" &&
        action.input.approvalId === "approval_react"
        ? ["approval_react_2"]
        : [];
      return {
        ok: true,
        action: action.type,
        snapshot: approvalSnapshot(runningSnapshot(), remaining),
      };
    }));

    const approval = requiredElement<HTMLElement>(
      '[data-ui-approval-item="approval_react"]',
    );
    expect(approval.textContent).toContain("Apply workspace change");
    expect(approval.textContent).toContain("Update two reviewed files");
    const details = requiredElement<HTMLDetailsElement>("[data-ui-approval-details]");
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("Files");
    expect(details.textContent).toContain("src/app.ts");

    await act(async () => requiredButton("Allow once").click());
    await waitFor(() => actions.length === 1);
    await act(async () => requiredButton("Deny").click());
    await waitFor(() => actions.length === 2);

    expect(actions).toEqual([
      {
        type: "resolve-conversation-approval",
        input: {
          sessionId: "session_react",
          approvalId: "approval_react",
          expectedApprovalRevision: 4,
          decision: "approve_once",
          reason: "User allowed this request once",
        },
      },
      {
        type: "resolve-conversation-approval",
        input: {
          sessionId: "session_react",
          approvalId: "approval_react_2",
          expectedApprovalRevision: 5,
          decision: "deny",
          reason: "User denied this request",
        },
      },
    ]);
  });

  it("keeps approval actions independent and suppresses duplicate clicks per item", async () => {
    const snapshot = approvalSnapshot(runningSnapshot());
    const actions: Action[] = [];
    const pending = new Map<string, (result: ActionResult) => void>();
    await mount(createClient(snapshot, (action) => {
      actions.push(action);
      return new Promise<ActionResult>((resolve) => {
        if (action.type !== "resolve-conversation-approval") {
          throw new Error("unexpected action");
        }
        pending.set(action.input.approvalId, resolve);
      });
    }));

    const first = requiredElement<HTMLElement>('[data-ui-approval-item="approval_react"]');
    const second = requiredElement<HTMLElement>('[data-ui-approval-item="approval_react_2"]');
    const firstAllow = first.querySelector<HTMLButtonElement>('[data-ui-approval-decision="approve_once"]');
    const secondDeny = second.querySelector<HTMLButtonElement>('[data-ui-approval-decision="deny"]');
    if (firstAllow === null || secondDeny === null) throw new Error("approval controls missing");

    await act(async () => firstAllow.click());
    await waitFor(() => actions.length === 1);
    await act(async () => firstAllow.click());
    expect(actions).toHaveLength(1);
    expect(firstAllow.disabled).toBe(true);
    expect(secondDeny.disabled).toBe(false);

    await act(async () => secondDeny.click());
    await waitFor(() => actions.length === 2);
    expect(secondDeny.disabled).toBe(true);

    await act(async () => pending.get("approval_react")?.({
      ok: true,
      action: "resolve-conversation-approval",
      snapshot: approvalSnapshot(runningSnapshot(), ["approval_react_2"]),
    }));
    await waitFor(() => document.querySelector('[data-ui-approval-item="approval_react"]') === null);
    expect(document.querySelector('[data-ui-approval-item="approval_react_2"]')).not.toBeNull();

    await act(async () => pending.get("approval_react_2")?.({
      ok: true,
      action: "resolve-conversation-approval",
      snapshot: runningSnapshot(),
    }));
    await waitFor(() => document.querySelector("[data-ui-approval]") === null);
  });

  it("restores an approval item after a failed decision and allows retry", async () => {
    const snapshot = approvalSnapshot(runningSnapshot());
    const actions: Action[] = [];
    let resolveDecision: ((result: ActionResult) => void) | undefined;
    await mount(createClient(snapshot, (action) => {
      actions.push(action);
      return new Promise<ActionResult>((resolve) => {
        resolveDecision = resolve;
      });
    }));

    const deny = requiredElement<HTMLButtonElement>(
      '[data-ui-approval-item="approval_react"] [data-ui-approval-decision="deny"]',
    );
    await act(async () => deny.click());
    await waitFor(() => deny.disabled);
    expect(actions).toHaveLength(1);

    await act(async () => resolveDecision?.({
      ok: false,
      action: "resolve-conversation-approval",
      message: "Approval revision is stale",
      snapshot,
    }));
    await waitFor(() => !deny.disabled);
    expect(deny.isConnected).toBe(true);

    await act(async () => deny.click());
    await waitFor(() => actions.length === 2);
    expect(actions[1]).toEqual(actions[0]);
  });

  it("keeps the canonical conversation usable when live updates are unavailable", async () => {
    let listener: ((event: ClientEvent) => void) | undefined;
    let unsubscribeCount = 0;
    let subscribeCount = 0;
    let readCount = 0;
    const snapshot = baseSnapshot();
    const client: Client = {
      async readSnapshot() {
        readCount += 1;
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      subscribe(nextListener) {
        subscribeCount += 1;
        listener = nextListener;
        return () => {
          unsubscribeCount += 1;
        };
      },
    };
    await mount(client);
    await waitFor(() => listener !== undefined);

    await act(async () => listener?.({ kind: "stream-unavailable" }));

    expect(document.body.textContent).toContain("Live updates paused");
    expect(document.querySelector("[role=alert]")).toBeNull();
    expect(document.querySelector("[data-ui-conversation-row=row_assistant]")?.textContent)
      .toContain("No <script> can execute.");
    expect(requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]").disabled)
      .toBe(false);

    await act(async () => requiredButton("Reconnect live updates").click());
    await waitFor(() => document.querySelector(
      '[data-ui-action="reconnect-live-updates"]',
    ) === null);
    expect(readCount).toBe(2);
    expect(subscribeCount).toBe(2);

    await act(async () => mounted.pop()?.unmount());
    expect(unsubscribeCount).toBe(2);
  });

  it("preserves the current timeline and draft across a refresh failure and retry", async () => {
    const snapshot = baseSnapshot();
    let listener: ((event: ClientEvent) => void) | undefined;
    let readCount = 0;
    let subscribeCount = 0;
    const client: Client = {
      async readSnapshot() {
        readCount += 1;
        if (readCount === 1) throw new Error("Snapshot refresh failed");
        return snapshot;
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      subscribe(nextListener) {
        subscribeCount += 1;
        listener = nextListener;
        return () => {};
      },
    };
    await mount(client, snapshot);
    await waitFor(() => listener !== undefined);

    const textarea = requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]");
    await setTextarea(textarea, "Keep this draft during refresh recovery");
    await act(async () => listener?.({ kind: "snapshot-invalidated" }));
    await waitFor(() => document.querySelector(
      '[data-ui-availability-state="degraded"]',
    ) !== null);

    expect(document.querySelector('[data-ui-conversation-row="row_user"]')?.textContent)
      .toContain("What changed?");
    expect(textarea.value).toBe("Keep this draft during refresh recovery");

    await act(async () => requiredButton("Retry").click());
    await waitFor(() => document.querySelector(
      '[data-ui-availability-state="degraded"]',
    ) === null);

    expect(readCount).toBe(2);
    expect(subscribeCount).toBe(2);
    expect(requiredElement<HTMLTextAreaElement>("textarea[aria-label=Message]").value)
      .toBe("Keep this draft during refresh recovery");
    expect(document.querySelector('[data-ui-conversation-row="row_assistant"]')?.textContent)
      .toContain("No <script> can execute.");
  });

  it("coalesces invalidations without losing a wakeup at refresh completion", async () => {
    let listener: ((event: ClientEvent) => void) | undefined;
    let readCount = 0;
    let activeReads = 0;
    let maximumActiveReads = 0;
    const resolutions: Array<(snapshot: Snapshot) => void> = [];
    const snapshot = baseSnapshot();
    const client: Client = {
      readSnapshot() {
        readCount += 1;
        activeReads += 1;
        maximumActiveReads = Math.max(maximumActiveReads, activeReads);
        return new Promise((resolve) => {
          resolutions.push((next) => {
            activeReads -= 1;
            resolve(next);
          });
        });
      },
      async dispatchAction(action) {
        return { ok: true, action: action.type, snapshot };
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    await mount(client, snapshot);
    await waitFor(() => listener !== undefined);

    await act(async () => {
      listener?.({ kind: "snapshot-invalidated" });
      listener?.({ kind: "snapshot-invalidated" });
      listener?.({ kind: "snapshot-invalidated" });
    });
    await waitFor(() => readCount === 1);
    await act(async () => resolutions.shift()?.(snapshot));
    await waitFor(() => readCount === 2);
    await act(async () => {
      resolutions.shift()?.(snapshot);
      queueMicrotask(() => listener?.({ kind: "snapshot-invalidated" }));
    });
    await waitFor(() => readCount === 3);
    await act(async () => resolutions.shift()?.(snapshot));
    await waitFor(() => activeReads === 0);

    expect(readCount).toBe(3);
    expect(maximumActiveReads).toBe(1);
    expect(document.querySelector("[role=alert]")).toBeNull();
  });

  it("continues an SSE cursor from the canonical snapshot and reports stream closure", async () => {
    const snapshot = {
      ...baseSnapshot(),
      eventStreamId: "react_stream",
      eventCursor: 3,
    };
    const encoder = new TextEncoder();
    const streamReads = [
      {
        done: false as const,
        value: encoder.encode(
          [
            'data: {"kind":"product.surface-stream.event","streamId":"react_stream","event":{"type":"product.surface.conversation.assistant-text-delta","sequence":3,"conversation":{"operationId":"operation_react","sessionId":"session_react","text":"covered"}}}',
            "",
            'data: {"kind":"product.surface-stream.event","streamId":"react_stream","event":{"type":"product.surface.conversation.assistant-text-delta","sequence":4,"conversation":{"operationId":"operation_react","sessionId":"session_react","text":"next"}}}',
            "",
            "",
          ].join("\n"),
        ),
      },
      { done: true as const, value: undefined },
    ];
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), ...(init === undefined ? {} : { init }) });
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              kind: "web.response",
              ok: true,
              operation: "refresh",
              snapshot,
            };
          },
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        body: {
          getReader() {
            return {
              async read() {
                return streamReads.shift() ?? { done: true as const, value: undefined };
              },
            };
          },
        },
      } as unknown as Response;
    }) as typeof globalThis.fetch;
    const client = createHttpClient({
      requestPath: "/request",
      eventStreamPath: "/events",
      hostSessionToken: "host-session",
      fetch: fetchImpl,
    });

    expect(await client.readSnapshot()).toBe(snapshot);
    const events: ClientEvent[] = [];
    const unsubscribe = client.subscribe?.((event) => events.push(event));
    await waitFor(() => events.length === 2);

    expect(requests[1]?.url).toBe("/events");
    expect(new Headers(requests[1]?.init?.headers).get("last-event-id"))
      .toBe("react_stream:3");
    expect(events).toEqual([
      {
        kind: "assistant-text-delta",
        operationId: "operation_react",
        sessionId: "session_react",
        text: "next",
        sequence: 4,
      },
      { kind: "stream-unavailable" },
    ]);
    unsubscribe?.();
  });

  it("adopts a successful action cursor before admitting later SSE events", async () => {
    const initial = {
      ...baseSnapshot(),
      eventStreamId: "react_stream",
      eventCursor: 3,
    };
    const actionSnapshot = {
      ...initial,
      generatedAt: 2,
      eventCursor: 7,
    };
    const encoder = new TextEncoder();
    const streamReads = [
      {
        done: false as const,
        value: encoder.encode(
          [4, 5, 6, 7, 8, 9]
            .map((sequence) =>
              `data: {"kind":"product.surface-stream.event","streamId":"react_stream","event":{"type":"${sequence === 9 ? "product.surface.conversation.operation-invalidated" : sequence === 8 ? "product.surface.team.invalidated" : "product.surface.state_changed"}","sequence":${sequence}}}\n`,
            )
            .join("\n") + "\n",
        ),
      },
      { done: true as const, value: undefined },
    ];
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), ...(init === undefined ? {} : { init }) });
      if (init?.method === "POST") {
        const request = JSON.parse(String(init.body)) as { readonly operation: string };
        if (request.operation === "refresh") {
          return jsonResponse(200, {
            kind: "web.response",
            ok: true,
            operation: "refresh",
            snapshot: initial,
          });
        }
        return jsonResponse(200, {
          kind: "web.response",
          ok: true,
          operation: "dispatchAction",
          actionResult: {
            ok: true,
            action: "start-new-conversation",
            snapshot: actionSnapshot,
          },
        });
      }
      return {
        ok: true,
        status: 200,
        body: {
          getReader() {
            return {
              async read() {
                return streamReads.shift() ?? { done: true as const, value: undefined };
              },
            };
          },
        },
      } as unknown as Response;
    }) as typeof globalThis.fetch;
    const client = createHttpClient({
      requestPath: "/request",
      eventStreamPath: "/events",
      hostSessionToken: "host-session",
      fetch: fetchImpl,
    });

    expect(await client.readSnapshot()).toEqual(initial);
    expect(await client.dispatchAction(
      { type: "start-new-conversation" },
      { requestId: "request_action_cursor" },
    )).toMatchObject({ ok: true, snapshot: actionSnapshot });
    const events: ClientEvent[] = [];
    const unsubscribe = client.subscribe?.((event) => events.push(event));
    await waitFor(() => events.length === 3);

    expect(new Headers(requests[2]?.init?.headers).get("last-event-id"))
      .toBe("react_stream:7");
    expect(events).toEqual([
      { kind: "snapshot-invalidated" },
      { kind: "snapshot-invalidated" },
      { kind: "stream-unavailable" },
    ]);
    unsubscribe?.();
  });

  it("aborts the shared SSE request after the final subscriber leaves", async () => {
    let streamSignal: AbortSignal | undefined;
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      streamSignal = init?.signal ?? undefined;
      return await new Promise<Response>((_resolve, reject) => {
        streamSignal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    }) as typeof globalThis.fetch;
    const client = createHttpClient({
      requestPath: "/request",
      eventStreamPath: "/events",
      hostSessionToken: "host-session",
      fetch: fetchImpl,
    });
    const events: ClientEvent[] = [];
    const unsubscribe = client.subscribe?.((event) => events.push(event));
    await waitFor(() => streamSignal !== undefined);

    unsubscribe?.();
    await waitFor(() => streamSignal?.aborted === true);

    expect(events).toEqual([]);
  });

  it("maps trusted host attachment and Provider endpoints without exposing the host token in bodies", async () => {
    const snapshot = attachmentSnapshot(baseSnapshot());
    const providerList = {
      kind: "local-host.configured-provider-list" as const,
      providers: [],
    };
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), ...(init === undefined ? {} : { init }) });
      if (String(input) === "/attachments") {
        return jsonResponse(201, {
          ok: true,
          upload: {
            attachment: snapshot.view.conversationAttachments[0],
            attachments: {
              kind: "product.conversation-attachments",
              draftKey: "session:session_react",
              sessionId: "session_react",
              attachments: snapshot.view.conversationAttachments,
            },
          },
          snapshot,
        });
      }
      if (String(input) === "/providers" && init?.method === "GET") {
        return jsonResponse(200, { ok: true, providers: providerList });
      }
      throw new Error(`unexpected request ${String(input)}`);
    }) as typeof globalThis.fetch;
    const client = createHttpClient({
      requestPath: "/request",
      attachmentPath: "/attachments",
      providerManagementPath: "/providers",
      hostSessionToken: "trusted-host-token",
      fetch: fetchImpl,
    });

    const upload = await client.uploadAttachment?.({
      content: new Uint8Array([4, 5]),
      mediaType: "image/png",
      label: "proof.png",
      sessionId: "session_react",
    });
    expect(upload?.snapshot).toEqual(snapshot);
    expect(await client.listProviders?.()).toEqual(providerList);
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("x-wanex-host-session")).toBe("trusted-host-token");
    expect(headers.get("x-wanex-media-type")).toBe("image%2Fpng");
    expect(Array.from(requests[0]?.init?.body as Uint8Array)).toEqual([4, 5]);
    expect(JSON.stringify(requests[0]?.init?.body)).not.toContain("trusted-host-token");
  });

  it("prepares and explicitly releases scoped Resource delivery through the trusted host", async () => {
    const delivery: PreparedResourceDelivery = {
      kind: "web.resource-delivery",
      url: "/resource-delivery?token=opaque",
      resourceId: "resource_audio",
      sha256: "c".repeat(64),
      resourceKind: "audio",
      mediaType: "audio/mpeg",
      sizeBytes: 2_048,
      purpose: "media",
      sessionId: "session_react",
      expiresAt: 90_000,
    };
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), ...(init === undefined ? {} : { init }) });
      if (String(input) === "/resource-delivery/prepare") {
        return jsonResponse(200, { ok: true, delivery });
      }
      if (String(input) === delivery.url && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected request ${String(input)}`);
    }) as typeof globalThis.fetch;
    const client = createHttpClient({
      requestPath: "/request",
      resourceDeliveryPreparePath: "/resource-delivery/prepare",
      hostSessionToken: "trusted-host-token",
      fetch: fetchImpl,
    });

    expect(await client.prepareResourceDelivery?.({
      resourceId: delivery.resourceId,
      sha256: delivery.sha256,
      purpose: "media",
      sessionId: "session_react",
    })).toEqual(delivery);
    await client.releaseResourceDelivery?.(delivery);

    expect(requests.map((request) => [request.url, request.init?.method])).toEqual([
      ["/resource-delivery/prepare", "POST"],
      [delivery.url, "DELETE"],
    ]);
    expect(new Headers(requests[1]?.init?.headers).get("x-wanex-host-session"))
      .toBe("trusted-host-token");

    await client.releaseResourceDelivery?.(delivery);
    expect(requests).toHaveLength(2);
  });

  it("rejects unscoped Resource delivery URLs before retaining or releasing them", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      ok: true,
      delivery: {
        kind: "web.resource-delivery",
        url: "https://example.invalid/resource?token=opaque",
        resourceId: "resource_audio",
        sha256: "c".repeat(64),
        resourceKind: "audio",
        mediaType: "audio/mpeg",
        sizeBytes: 2_048,
        purpose: "media",
        sessionId: "session_react",
        expiresAt: 90_000,
      },
    })) as typeof globalThis.fetch;
    const client = createHttpClient({
      requestPath: "/request",
      resourceDeliveryPreparePath: "/resource-delivery/prepare",
      hostSessionToken: "trusted-host-token",
      fetch: fetchImpl,
    });

    await expect(client.prepareResourceDelivery?.({
      resourceId: "resource_audio",
      sha256: "c".repeat(64),
      purpose: "media",
      sessionId: "session_react",
    })).rejects.toThrow("Resource delivery response is invalid");
    await client.releaseResourceDelivery?.({
      kind: "web.resource-delivery",
      url: "https://example.invalid/resource?token=opaque",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("renders a selected group as a dedicated public timeline without session-only controls", async () => {
    const snapshot = teamSnapshot();
    await mount(createClient(snapshot), snapshot);

    expect(requiredElement<HTMLElement>("[data-ui-selected-session-title]").textContent)
      .toBe("Architecture review");
    expect(document.querySelector("[data-ui-team-timeline]")).not.toBeNull();
    expect(document.querySelector("[data-ui-conversation-timeline]")).toBeNull();
    expect(document.querySelector("[data-ui-team-composer]")).not.toBeNull();
    expect(document.querySelector("[data-ui-composer]")).toBeNull();
    expect(document.body.textContent).toContain("Please review the storage boundary.");
    expect(document.body.textContent).toContain("Reviewer");
    expect(document.body.textContent).toContain("1 replied");
    expect(document.body.textContent).not.toContain("Add attachment");
    expect(document.body.textContent).not.toContain("Regenerate");
    expect(document.body.textContent).not.toContain("agent_session_private");
    expect(document.body.innerHTML).not.toContain("agentSessionId");
    expect(document.querySelector("[data-ui-product-shell]")?.getAttribute("data-ui-operation-id"))
      .toBeNull();
  });

  it("preserves a rejected group draft and reuses its idempotency key until acceptance", async () => {
    const snapshot = teamSnapshot();
    const actions: Action[] = [];
    let attempt = 0;
    const client = createClient(snapshot, async (action) => {
      actions.push(action);
      if (action.type !== "submit-team-round") {
        return { ok: true, action: action.type, snapshot };
      }
      attempt += 1;
      return attempt === 1
        ? { ok: false, action: action.type, message: "Round admission failed", snapshot }
        : { ok: true, action: action.type, snapshot };
    });
    await mount(client, snapshot);
    const textarea = requiredElement<HTMLTextAreaElement>('textarea[name="team-message"]');
    const form = requiredElement<HTMLFormElement>("[data-ui-team-composer]");

    await setTextarea(textarea, "Compare both implementations");
    await submitForm(form);
    await waitFor(() => document.body.textContent?.includes("Round admission failed") === true);
    expect(textarea.value).toBe("Compare both implementations");

    await submitForm(form);
    await waitFor(() => textarea.value === "");
    const submissions = actions.filter((action): action is Extract<Action, { type: "submit-team-round" }> =>
      action.type === "submit-team-round",
    );
    expect(submissions).toHaveLength(2);
    expect(submissions[0]?.input.text).toBe("Compare both implementations");
    expect(submissions[1]?.input.idempotencyKey).toBe(submissions[0]?.input.idempotencyKey);
  });

  it("creates and selects groups from the shared navigation library", async () => {
    const snapshot = teamSnapshot();
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot };
    }), snapshot);

    await act(async () => requiredButton("New group").click());
    const coordinatedMode = requiredElement<HTMLInputElement>(
      'input[name="group-mode"][value="coordinated"]',
    );
    expect(coordinatedMode.checked).toBe(true);
    const title = requiredElement<HTMLInputElement>('input[aria-label="Group name"]');
    await setInput(title, "Release review");
    await submitForm(requiredElement<HTMLFormElement>('input[aria-label="Group name"]').closest("form")!);
    await act(async () => requiredElement<HTMLButtonElement>("[data-ui-team-row]").click());

    const create = actions.find((action): action is Extract<Action, { type: "create-team-conversation" }> =>
      action.type === "create-team-conversation",
    );
    expect(create?.input.mode).toBe("coordinated");
    expect(create?.input.title).toBe("Release review");
    expect(create?.input.idempotencyKey).toMatch(/^team-create:/u);
    expect(actions).toContainEqual({
      type: "select-team-conversation",
      conversationId: "team_review",
    });
    expect(document.querySelector("[data-ui-team-context]")).not.toBeNull();
  });

  it("creates a discussion group with one explicit mode change", async () => {
    const snapshot = teamSnapshot();
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot };
    }), snapshot);

    await act(async () => requiredButton("New group").click());
    await act(async () => requiredElement<HTMLInputElement>(
      'input[name="group-mode"][value="discussion"]',
    ).click());
    await setInput(
      requiredElement<HTMLInputElement>('input[aria-label="Group name"]'),
      "Open review",
    );
    await submitForm(
      requiredElement<HTMLInputElement>('input[aria-label="Group name"]').closest("form")!,
    );

    expect(actions).toContainEqual(expect.objectContaining({
      type: "create-team-conversation",
      input: expect.objectContaining({
        mode: "discussion",
        title: "Open review",
      }),
    }));
  });

  it("keeps a coordinated group without a coordinator visibly blocked", async () => {
    const snapshot = teamSnapshot({ mode: "coordinated" });
    await mount(createClient(snapshot), snapshot);

    expect(document.body.textContent).toContain("Choose a coordinator before sending");
    expect(requiredElement<HTMLButtonElement>('[aria-label="Send to group"]').disabled)
      .toBe(true);
  });

  it("manages group participants through public Product identities", async () => {
    const snapshot = teamSnapshot();
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot };
    }), snapshot);

    await act(async () => requiredButton("Toggle context panel").click());
    expect(document.querySelector("[data-ui-team-context]")).not.toBeNull();
    expect(document.querySelector('button[aria-label^="Make "][aria-label$=" coordinator"]'))
      .toBeNull();
    await submitForm(requiredButton("Add").closest("form")!);
    await act(async () => requiredButton("Mute Reviewer").click());
    const initialClose = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Close group",
    );
    if (!(initialClose instanceof HTMLButtonElement)) throw new Error("close group action was not rendered");
    await act(async () => initialClose.click());
    expect(document.body.textContent).toContain("Close this group?");
    const closeButtons = Array.from(document.querySelectorAll("button"))
      .filter((button) => button.textContent?.includes("Close group"));
    await act(async () => closeButtons.at(-1)?.click());
    await waitFor(() => document.querySelector("[data-ui-team-context]") === null);

    expect(actions).toContainEqual({
      type: "add-team-participant",
      input: {
        conversationId: "team_review",
        agentSessionId: "session_react",
        displayName: "Renderer architecture",
        idempotencyKey: "team-participant:team_review:session_react",
      },
    });
    expect(actions).toContainEqual({
      type: "update-team-participant",
      input: {
        conversationId: "team_review",
        participantId: "participant_reviewer",
        state: "muted",
      },
    });
    expect(actions).toContainEqual({
      type: "close-team-conversation",
      input: { conversationId: "team_review" },
    });
  });

  it("assigns and reassigns a coordinator with the canonical expected identity", async () => {
    const initial = teamSnapshot({ mode: "coordinated" });
    const initialActions: Action[] = [];
    await mount(createClient(initial, async (action) => {
      initialActions.push(action);
      return { ok: true, action: action.type, snapshot: initial };
    }), initial);
    await act(async () => requiredButton("Toggle context panel").click());
    await act(async () => requiredButton("Make Reviewer coordinator").click());
    expect(initialActions).toContainEqual({
      type: "set-team-coordinator",
      input: {
        conversationId: "team_review",
        expectedCoordinatorParticipantId: null,
        coordinatorParticipantId: "participant_reviewer",
      },
    });
    await act(async () => mounted.pop()?.unmount());

    const assigned = teamSnapshot({
      mode: "coordinated",
      coordinatorParticipantId: "participant_reviewer",
      secondAgent: true,
    });
    const reassignmentActions: Action[] = [];
    await mount(createClient(assigned, async (action) => {
      reassignmentActions.push(action);
      return { ok: true, action: action.type, snapshot: assigned };
    }), assigned);
    await act(async () => requiredButton("Toggle context panel").click());
    expect(requiredElement<HTMLButtonElement>(
      'button[aria-label="Reassign the coordinator before muting Reviewer"]',
    ).disabled).toBe(true);
    expect(requiredElement<HTMLButtonElement>(
      'button[aria-label="Reassign the coordinator before removing Reviewer"]',
    ).disabled).toBe(true);
    await act(async () => requiredButton("Make Specialist coordinator").click());
    expect(reassignmentActions).toContainEqual({
      type: "set-team-coordinator",
      input: {
        conversationId: "team_review",
        expectedCoordinatorParticipantId: "participant_reviewer",
        coordinatorParticipantId: "participant_specialist",
      },
    });
  });

  it("keeps coordinator management open after a stale assignment failure", async () => {
    const snapshot = teamSnapshot({ mode: "coordinated" });
    await mount(createClient(snapshot, async (action) => action.type === "set-team-coordinator"
      ? {
          ok: false,
          action: action.type,
          message: "Coordinator changed concurrently",
          snapshot,
        }
      : { ok: true, action: action.type, snapshot }), snapshot);

    await act(async () => requiredButton("Toggle context panel").click());
    await act(async () => requiredButton("Make Reviewer coordinator").click());
    await waitFor(() => document.body.textContent?.includes(
      "Coordinator changed elsewhere. Review the current group and try again.",
    ) === true);
    expect(document.querySelector("[data-ui-team-context]")).not.toBeNull();
    expect(document.body.textContent).toContain("Coordinator changed concurrently");
    expect(snapshot.team.page?.conversation.coordinatorParticipantId).toBeUndefined();
  });

  it("loads earlier group history and disables admission with a contextual reason", async () => {
    const snapshot = teamSnapshot({ activeRound: true, nextCursor: "team-cursor" });
    const actions: Action[] = [];
    await mount(createClient(snapshot, async (action) => {
      actions.push(action);
      return { ok: true, action: action.type, snapshot };
    }), snapshot);

    const textarea = requiredElement<HTMLTextAreaElement>('textarea[name="team-message"]');
    await setTextarea(textarea, "A follow-up while agents are busy");
    expect(requiredButton("Send to group").disabled).toBe(true);
    expect(document.body.textContent).toContain("Waiting for the current round to finish");
    await act(async () => requiredButton("Load earlier messages").click());
    await waitFor(() => actions.some((action) => action.type === "load-earlier-team-history"));
    expect(actions).toContainEqual({
      type: "load-earlier-team-history",
      input: {
        conversationId: "team_review",
        cursor: "team-cursor",
        limit: 50,
      },
    });
  });
});

async function mount(
  client: Client,
  initialSnapshot?: Snapshot,
): Promise<void> {
  const root = document.createElement("div");
  document.body.append(root);
  await act(async () => {
    mounted.push(mountClient({
      root,
      client,
      ...(initialSnapshot === undefined ? {} : { initialSnapshot }),
    }));
  });
}

function createClient(
  snapshot: Snapshot,
  dispatch: Client["dispatchAction"] = async (action) => ({
    ok: true,
    action: action.type,
    snapshot,
  }),
): Client {
  return {
    async readSnapshot() {
      return snapshot;
    },
    dispatchAction: dispatch,
  };
}

function baseSnapshot(): Snapshot {
  return {
    kind: "web.snapshot",
    generatedAt: 1,
    eventCursor: 0,
    descriptor: { ok: true },
    status: { ok: true },
    home: { ok: true },
    settings: { ok: true },
    modelEndpoints: { ok: true },
    commandCatalog: { ok: true },
    pluginManagement: {
      ok: true,
      command: "readPluginManagement",
      value: {
        kind: "product.plugin-management.unavailable",
        reason: "not_configured",
        message: "Plugin management is not configured.",
      },
      event: { sequence: 0 },
    },
    teamList: {
      ok: true,
      command: "listTeamConversations",
      value: {
        kind: "product.team-conversation-list",
        availability: {
          kind: "product.team-availability",
          state: "ready",
          reason: "configured",
          capabilities: {
            canList: true,
            canCreateDiscussion: true,
            canCreateCoordinated: true,
            canManageParticipants: true,
            canAssignCoordinator: true,
            canSubmitRound: true,
          },
        },
        conversations: [],
      },
      event: { sequence: 0 },
    },
    events: { ok: true, events: [], latestSequence: 0, truncated: false },
    operationStatus: {
      kind: "web.operation-status",
      state: "idle",
      message: "No operation yet",
    },
    commandPreview: { state: "idle" },
    commandExecution: { state: "idle" },
    executionActivity: { state: "idle" },
    conversation: {
      kind: "web.conversation",
      state: "succeeded",
      operationId: "operation_react",
      sessionId: "session_react",
      historyRows: [
        {
          id: "row_user",
          kind: "message",
          role: "user",
          status: "completed",
          createdAt: 1,
          updatedAt: 1,
          parts: [{ key: "user-text", type: "text", text: "What changed?" }],
          capabilityRequests: [],
        },
        {
          id: "row_assistant",
          kind: "message",
          role: "assistant",
          status: "completed",
          createdAt: 2,
          updatedAt: 2,
          parts: [{
            key: "assistant-text",
            type: "text",
            text: "## Result\n\nNo `<script>` can execute.",
          }],
          capabilityRequests: [],
        },
      ],
      historyPage: {
        limit: 100,
        hasMore: false,
        liveRowsTruncated: false,
      },
      historyExpanded: false,
      canSubmit: true,
      canQueueFollowUp: false,
      canSteer: false,
      canCancel: false,
      canRegenerate: true,
    },
    sideQuery: { kind: "web.side-query", state: "idle" },
    plan: {
      kind: "web.plan",
      proposal: { kind: "product.plan-proposal.no-selection" },
    },
    goal: {
      kind: "web.goal",
      state: "missing",
      sessionId: "session_react",
    },
    team: {
      kind: "web.team",
      state: "no-selection",
      availability: {
        kind: "product.team-availability",
        state: "ready",
        reason: "configured",
        capabilities: {
          canList: true,
          canCreateDiscussion: true,
          canCreateCoordinated: true,
          canManageParticipants: true,
          canAssignCoordinator: true,
          canSubmitRound: true,
        },
      },
      conversations: [],
    },
    attachments: { ok: true },
    workbench: { kind: "web.workbench", state: "idle" },
    diagnostics: [],
    view: {
      title: "Renderer architecture",
      ready: true,
      mode: "chat",
      layout: "single",
      selection: { kind: "session", sessionId: "session_react" },
      selectedSessionTitle: "Renderer architecture",
      theme: "system",
      density: "comfortable",
      settings: {
        profile: {
          activeModelEndpointId: "endpoint_react",
          agentContextConfigured: true,
          agentContextRevision: 1,
          readiness: {
            status: "ready",
            canRun: true,
            attentionRequired: false,
            message: "Ready",
          },
          endpointCount: 1,
          endpoints: [{
            id: "endpoint_react",
            connection: { id: "connection_react", providerId: "openai" },
            protocol: { id: "openai-responses" },
            model: {
              id: "gpt-react",
              operations: ["conversation"],
              inputModalities: ["text"],
              outputModalities: ["text"],
              features: [],
            },
            credentialConfigured: true,
            active: true,
          }],
        },
        renderer: {
          layout: "single",
          mode: "chat",
          theme: "system",
          density: "comfortable",
          availableLayouts: ["single"],
          availableModes: ["chat"],
          availableThemes: ["system"],
          availableDensities: ["comfortable"],
        },
        privacy: {
          exposesStorePath: false,
          exposesServiceBinaryPath: false,
          exposesSecrets: false,
        },
        integration: {
          rendererCalls: "surface-client",
          rendererMayOpenStorage: false,
          rendererMayReceiveStorePath: false,
          rendererMayReceiveServiceBinaryPath: false,
        },
        plugins: {
          state: "unavailable",
          installs: [],
          message: "Plugin management is not configured.",
        },
      },
      sessionCount: 1,
      recentSessions: [{
        sessionId: "session_react",
        label: "Renderer architecture",
        kind: "chat",
        status: "active",
        revision: 1,
        createdAt: 1,
        updatedAt: 2,
        selected: true,
        archived: false,
      }],
      archivedSessions: [],
      commandCount: 1,
      commandPaletteCount: 1,
      eventCount: 0,
      workbenchState: "idle",
      workbenchRowCount: 0,
      conversationCanSubmit: true,
      conversationCanQueueFollowUp: false,
      conversationCanSteer: false,
      conversationCanCancel: false,
      conversationCanRegenerate: true,
      conversationState: "succeeded",
      sideQueryCanStart: false,
      sideQueryState: "idle",
      planGenerationState: "idle",
      planCanGenerate: true,
      goalState: "missing",
      goalCanStart: true,
      groupCount: 0,
      teamState: "no-selection",
      teamCanSubmit: false,
      team: {
        kind: "web.team",
        state: "no-selection",
        availability: {
          kind: "product.team-availability",
          state: "ready",
          reason: "configured",
          capabilities: {
            canList: true,
            canCreateDiscussion: true,
            canCreateCoordinated: true,
            canManageParticipants: true,
            canAssignCoordinator: true,
            canSubmitRound: true,
          },
        },
        conversations: [],
      },
      conversationAttachments: [],
      conversationAttachmentCanUpload: true,
      conversationAttachmentAccept: "image/*",
      conversationAttachmentMessage: "Images and documents",
      latestAssistantText: "No script can execute.",
      latestUserText: "What changed?",
      operationStatus: {
        kind: "web.operation-status",
        state: "idle",
        message: "No operation yet",
      },
      commandPreview: {
        kind: "web.command-preview",
        state: "empty",
        message: "No command preview yet",
        inputAccepted: false,
      },
      commandExecution: {
        kind: "web.command-execution",
        state: "empty",
        message: "No command execution yet",
        references: [],
      },
      executionActivity: { state: "idle" },
      commandPalette: {
        kind: "web.command-palette",
        state: "ready",
        message: "No commands available",
        rows: [],
        diagnostics: [],
      },
      providerRunGate: {
        state: "ready",
        canRun: true,
        attentionRequired: false,
        message: "Ready",
      },
      diagnostics: [],
      actions: [],
    },
  } as unknown as Snapshot;
}

function extensionSnapshot(
  snapshot: Snapshot,
  override: Partial<{
    readonly state: "installed" | "disabled" | "removed";
    readonly runtimeState: "loaded" | "inactive" | "attention_required";
    readonly diagnostic: {
      readonly code: "catalog_refresh_failed";
      readonly message: string;
    };
  }> = {},
): Snapshot {
  const install = {
    pluginId: "plugin.example",
    displayName: "Example Extension",
    version: "1.0.0",
    state: override.state ?? "installed",
    runtimeState: override.runtimeState ?? "loaded",
    capabilities: ["config.read" as const],
    sourceKind: "local" as const,
    signatureStatus: "unsigned" as const,
    artifactSha256: "e".repeat(64),
    totalBytes: 1_024,
    fileCount: 3,
    commandCount: 1,
    updatedAt: 6_000,
    ...(override.diagnostic === undefined
      ? {}
      : { diagnostic: override.diagnostic }),
  };
  const value = {
    kind: "plugin.management.snapshot" as const,
    revision: `plugin-management:sha256:${"a".repeat(64)}`,
    installs: [install],
  };
  return {
    ...snapshot,
    pluginManagement: {
      ok: true,
      command: "readPluginManagement",
      value,
      event: {
        id: "surface-plugin-management-read",
        sequence: 0,
        type: "product.surface.command_completed",
        command: "readPluginManagement",
        at: 1,
      },
    },
    view: {
      ...snapshot.view,
      settings: {
        ...snapshot.view.settings,
        plugins: {
          state: "ready",
          revision: value.revision,
          installs: value.installs,
        },
      },
    },
  };
}

function localExtensionReview() {
  return {
    kind: "plugin.management.review-ready" as const,
    review: {
      kind: "plugin.management.local-review" as const,
      reviewId: "review_example",
      expiresAt: Date.now() + 600_000,
      pluginId: "plugin.example",
      displayName: "Example Extension",
      version: "1.0.0",
      sourceKind: "local" as const,
      signatureStatus: "unsigned" as const,
      artifactSha256: "e".repeat(64),
      totalBytes: 1_024,
      fileCount: 3,
      capabilities: ["config.read" as const],
      commands: [{ id: "plugin.example.echo", title: "Echo" }],
      dependencies: [{
        name: "host-api",
        distribution: "peer" as const,
        loading: "startup" as const,
        observedBytes: 0,
      }],
    },
  };
}

function pluginMutationAction(
  action:
    | "set-plugin-install-state"
    | "retry-plugin-refresh",
  snapshot: Snapshot,
): ActionResult {
  const value = snapshot.pluginManagement;
  if (!value.ok || value.value.kind !== "plugin.management.snapshot") {
    throw new Error("configured Plugin management snapshot is missing");
  }
  return {
    ok: true,
    action,
    output: {
      kind: "web.plugin-management-action",
      action,
      result: {
        kind: "plugin.management.applied",
        operation: action === "retry-plugin-refresh" ? "retry_refresh" : "set_state",
        snapshot: value.value,
        catalogRevision: "plugin-catalog:sha256:test",
      },
    },
    snapshot,
  };
}

function teamSnapshot(options: {
  readonly activeRound?: boolean;
  readonly activeAgentCount?: number;
  readonly nextCursor?: string;
  readonly mode?: "discussion" | "coordinated";
  readonly coordinatorParticipantId?: string;
  readonly secondAgent?: boolean;
} = {}): Snapshot {
  const base = baseSnapshot();
  const activeRound = options.activeRound ?? false;
  const activeAgentCount = options.activeAgentCount ?? (options.secondAgent ? 2 : 1);
  const conversation = {
    conversationId: "team_review",
    title: "Architecture review",
    mode: options.mode ?? "discussion",
    state: "open" as const,
    ...(options.coordinatorParticipantId === undefined
      ? {}
      : { coordinatorParticipantId: options.coordinatorParticipantId }),
    participantCount: options.secondAgent ? 3 : 2,
    activeAgentCount,
    activeRound,
    createdAt: 1,
    updatedAt: 8,
  };
  const team = {
    kind: "web.team" as const,
    state: "ready" as const,
    availability: base.team.availability,
    conversations: [conversation],
    conversationId: conversation.conversationId,
    page: {
      kind: "product.team-conversation-page" as const,
      conversation,
      participants: [
        {
          participantId: "participant_user",
          kind: "user" as const,
          state: "active" as const,
          displayName: "You",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          participantId: "participant_reviewer",
          kind: "agent" as const,
          state: "active" as const,
          displayName: "Reviewer",
          role: "Architecture",
          createdAt: 2,
          updatedAt: 2,
        },
        ...(options.secondAgent ? [{
          participantId: "participant_specialist",
          kind: "agent" as const,
          state: "active" as const,
          displayName: "Specialist",
          role: "Implementation",
          createdAt: 2,
          updatedAt: 2,
        }] : []),
      ],
      messages: [
        {
          messageId: "team_message_user",
          authorParticipantId: "participant_user",
          roundId: "team_round",
          kind: "message" as const,
          status: "sent" as const,
          content: [{
            type: "text" as const,
            partId: "team_part_user",
            text: "Please review the storage boundary.",
          }],
          revision: 1,
          createdAt: 3,
          updatedAt: 3,
        },
        {
          messageId: "team_message_agent",
          authorParticipantId: "participant_reviewer",
          parentMessageId: "team_message_user",
          roundId: "team_round",
          kind: "message" as const,
          status: "sent" as const,
          content: [{
            type: "text" as const,
            partId: "team_part_agent",
            text: "The storage boundary remains Product-owned.",
          }],
          revision: 1,
          createdAt: 6,
          updatedAt: 6,
        },
      ],
      rounds: [{
        roundId: "team_round",
        sourceMessageId: "team_message_user",
        status: activeRound ? "running" as const : "completed" as const,
        expected: 1,
        replied: activeRound ? 0 : 1,
        passed: 0,
        failed: 0,
        cancelled: 0,
        createdAt: 4,
        updatedAt: 7,
        ...(activeRound ? {} : { finishedAt: 7 }),
      }],
      deliveries: [{
        deliveryId: "team_delivery",
        sourceMessageId: "team_message_user",
        roundId: "team_round",
        participantId: "participant_reviewer",
        status: activeRound ? "responding" as const : "replied" as const,
        ...(activeRound ? {} : { replyMessageId: "team_message_agent", finishedAt: 6 }),
        createdAt: 4,
        updatedAt: 6,
      }],
      observedAt: 8,
      ...(options.nextCursor === undefined ? {} : { nextCursor: options.nextCursor }),
    },
  };
  return {
    ...base,
    status: {
      ...base.status,
      value: { state: { selection: { kind: "team", conversationId: conversation.conversationId } } },
    },
    teamList: {
      ...base.teamList,
      value: {
        kind: "product.team-conversation-list",
        availability: base.team.availability,
        conversations: [conversation],
      },
    },
    team,
    view: {
      ...base.view,
      title: conversation.title,
      selection: { kind: "team", conversationId: conversation.conversationId },
      recentSessions: base.view.recentSessions.map((session) => ({ ...session, selected: false })),
      groupCount: 1,
      teamState: "ready",
      teamCanSubmit: activeAgentCount > 0 && !activeRound &&
        (conversation.mode === "discussion" ||
          conversation.coordinatorParticipantId !== undefined),
      team,
    },
  } as unknown as Snapshot;
}

function commandPaletteSnapshot(): Snapshot {
  const snapshot = baseSnapshot();
  const rows: Snapshot["view"]["commandPalette"]["rows"] = [
    {
      id: "product.status",
      name: "status",
      title: "Show status",
      handlerRef: "wanex.product.backend.status",
      sourceKind: "builtin",
      sourceId: "wanex.product",
      trust: "trusted",
      category: "diagnostics",
      input: { mode: "none" },
    },
    {
      id: "product.memory.inspect",
      name: "memory",
      title: "Inspect memory",
      handlerRef: "wanex.product.backend.memory.inspect",
      sourceKind: "builtin",
      sourceId: "wanex.product",
      trust: "trusted",
      category: "memory",
      input: {
        mode: "generated",
        root: {
          kind: "object",
          path: "/",
          label: "Input",
          required: true,
          minProperties: 0,
          maxProperties: 2,
          properties: [
            {
              kind: "string",
              path: "/query",
              label: "Query",
              required: true,
              minLength: 1,
            },
            {
              kind: "integer",
              path: "/limit",
              label: "Limit",
              required: false,
              minimum: 1,
              maximum: 100,
            },
          ],
        },
      },
    },
    {
      id: "product.unsupported",
      name: "unsupported",
      title: "Unsupported input",
      handlerRef: "wanex.product.backend.unsupported",
      sourceKind: "builtin",
      sourceId: "wanex.product",
      trust: "trusted",
      input: {
        mode: "unsupported",
        reason: "open_object",
        message: "This command input cannot be represented safely",
      },
    },
  ];
  return {
    ...snapshot,
    view: {
      ...snapshot.view,
      commandCount: rows.length,
      commandPaletteCount: rows.length,
      commandPalette: {
        kind: "web.command-palette",
        state: "ready",
        message: `${rows.length} commands available`,
        rows,
        diagnostics: [],
      },
    },
  };
}

function commandPreviewSnapshot(
  snapshot: Snapshot,
  state: "runnable" | "rejected",
  updatedAt: number,
): Snapshot {
  const commandPreview: Snapshot["view"]["commandPreview"] = state === "runnable"
    ? {
        kind: "web.command-preview",
        state,
        message: "Command is runnable",
        commandId: "product.memory.inspect",
        commandName: "memory",
        commandTitle: "Inspect memory",
        handlerRef: "wanex.product.backend.memory.inspect",
        inputAccepted: true,
        updatedAt,
      }
    : {
        kind: "web.command-preview",
        state,
        message: "Input needs attention",
        commandId: "product.memory.inspect",
        commandName: "memory",
        commandTitle: "Inspect memory",
        handlerRef: "wanex.product.backend.memory.inspect",
        reason: "invalid_input",
        inputAccepted: false,
        inputValidation: {
          source: "schema",
          issues: [{
            path: "/query",
            keyword: "minLength",
            message: "Query is required",
          }],
        },
        updatedAt,
      };
  return {
    ...snapshot,
    commandPreview,
    view: { ...snapshot.view, commandPreview },
  };
}

function commandExecutionSnapshot(
  snapshot: Snapshot,
  state: "completed" | "rejected",
  updatedAt: number,
): Snapshot {
  const commandExecution: Snapshot["view"]["commandExecution"] = state === "completed"
    ? {
        kind: "web.command-execution",
        state,
        message: "Command completed",
        commandId: "product.memory.inspect",
        handlerRef: "wanex.product.backend.memory.inspect",
        valueKind: "object",
        references: [],
        updatedAt,
      }
    : {
        kind: "web.command-execution",
        state,
        message: "Execution failed",
        commandId: "product.memory.inspect",
        handlerRef: "wanex.product.backend.memory.inspect",
        reason: "execution_failed",
        references: [],
        updatedAt,
      };
  return {
    ...snapshot,
    commandExecution,
    view: { ...snapshot.view, commandExecution },
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function sessionLibrarySnapshot(): Snapshot {
  const snapshot = baseSnapshot();
  return {
    ...snapshot,
    view: {
      ...snapshot.view,
      sessionCount: 2,
      recentSessions: [
        { ...snapshot.view.recentSessions[0]!, revision: 7 },
        {
          sessionId: "session_secondary",
          label: "Provider investigation",
          kind: "chat",
          status: "active",
          revision: 3,
          createdAt: 2,
          updatedAt: 3,
          selected: false,
          archived: false,
        },
      ],
      archivedSessions: [{
        sessionId: "session_archived",
        label: "Release history",
        kind: "chat",
        status: "archived",
        revision: 5,
        createdAt: 1,
        updatedAt: 4,
        selected: false,
        archived: true,
      }],
    },
  };
}

function renameLibrarySession(
  snapshot: Snapshot,
  sessionId: string,
  title: string,
): Snapshot {
  return {
    ...snapshot,
    view: {
      ...snapshot.view,
      recentSessions: snapshot.view.recentSessions.map((session) =>
        session.sessionId === sessionId
          ? { ...session, label: title, revision: session.revision + 1 }
          : session,
      ),
    },
  };
}

function moveLibrarySession(
  snapshot: Snapshot,
  sessionId: string,
  archived: boolean,
): Snapshot {
  const source = archived
    ? snapshot.view.recentSessions
    : snapshot.view.archivedSessions;
  const moved = source.find((session) => session.sessionId === sessionId);
  if (moved === undefined) throw new Error(`missing library session ${sessionId}`);
  const next = {
    ...moved,
    archived,
    selected: false,
    status: archived ? "archived" : "active",
    revision: moved.revision + 1,
  };
  const recentSessions = archived
    ? snapshot.view.recentSessions.filter((session) => session.sessionId !== sessionId)
    : [...snapshot.view.recentSessions, next];
  const archivedSessions = archived
    ? [...snapshot.view.archivedSessions, next]
    : snapshot.view.archivedSessions.filter((session) => session.sessionId !== sessionId);
  return {
    ...snapshot,
    view: {
      ...snapshot.view,
      sessionCount: recentSessions.length,
      recentSessions,
      archivedSessions,
    },
  };
}

function runningSnapshot(): Snapshot {
  const snapshot = baseSnapshot();
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      state: "running",
      canSubmit: false,
      canQueueFollowUp: true,
      canSteer: true,
      canCancel: true,
      operation: {
        kind: "product.conversation-operation",
        operationId: "operation_react",
        sessionId: "session_react",
        state: "running",
        createdAt: 1,
        updatedAt: 2,
        transcript: { rows: [], totalRows: 0, truncated: false },
        capabilities: {
          steerable: true,
          cancellable: true,
          regeneratable: false,
          terminal: false,
        },
        steering: { pending: [], truncated: false },
      },
    },
    view: {
      ...snapshot.view,
      conversationCanSubmit: false,
      conversationCanQueueFollowUp: true,
      conversationCanSteer: true,
      conversationCanCancel: true,
      conversationCanRegenerate: false,
      conversationState: "running",
    },
  };
}

function pendingFollowUpSnapshot(
  snapshot: Snapshot,
): Snapshot {
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      canQueueFollowUp: false,
      pendingFollowUp: {
        kind: "product.conversation-guided-follow-up.pending",
        operationId: "operation_follow_up_react",
        sessionId: "session_react",
        state: "queued",
        text: "Check the release notes next",
        createdAt: 3,
        updatedAt: 3,
      },
    },
  } as Snapshot;
}

function pendingSteeringSnapshot(
  snapshot: Snapshot,
): Snapshot {
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      operation: {
        ...snapshot.conversation.operation!,
        steering: {
          pending: [{
            steeringId: "steering_react",
            text: "Focus on the stable public boundary",
            textTruncated: false,
            createdAt: 3,
            updatedAt: 3,
          }],
          truncated: false,
        },
      },
    },
  } as Snapshot;
}

function reasoningSnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      historyRows: snapshot.conversation.historyRows.map((row) =>
        row.id === "row_assistant"
          ? {
              ...row,
              parts: [
                {
                  key: "assistant-reasoning",
                  type: "reasoning" as const,
                  text: "Inspect the stable boundary first.",
                },
                ...row.parts,
              ],
            }
          : row
      ),
    },
  };
}

function contentActionsSnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      historyRows: snapshot.conversation.historyRows.map((row) =>
        row.id !== "row_assistant"
          ? row
          : {
              ...row,
              parts: [
                {
                  key: "assistant-private-reasoning",
                  type: "reasoning" as const,
                  text: "private reasoning",
                },
                {
                  key: "assistant-primary-text",
                  type: "text" as const,
                  text: "## Result\n\n```ts\nconst answer = 42;\n```",
                },
                {
                  key: "assistant-private-tool",
                  type: "tool" as const,
                  name: "workspace.private",
                  state: "succeeded" as const,
                },
                {
                  key: "assistant-private-resource",
                  type: "resource" as const,
                  resourceId: "resource_private",
                  sha256: "f".repeat(64),
                  sizeBytes: 32,
                  kind: "artifact" as const,
                  mediaType: "application/json",
                },
                {
                  key: "assistant-secondary-text",
                  type: "text" as const,
                  text: "Final **note**.",
                },
              ],
            }
      ),
    },
  };
}

function toolActivitySnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      historyRows: snapshot.conversation.historyRows.map((row) =>
        row.id !== "row_assistant"
          ? row
          : {
              ...row,
              parts: [
                {
                  key: "tool-read",
                  type: "tool" as const,
                  name: "workspace.read",
                  state: "succeeded" as const,
                },
                {
                  key: "tool-search",
                  type: "tool" as const,
                  name: "workspace.search",
                  state: "succeeded" as const,
                },
                {
                  key: "tool-separator-one",
                  type: "text" as const,
                  text: "The first inspection finished.",
                },
                {
                  key: "tool-pending",
                  type: "tool" as const,
                  name: "workspace.pending",
                  state: "running" as const,
                },
                {
                  key: "tool-failed",
                  type: "tool" as const,
                  name: "workspace.write",
                  state: "failed" as const,
                },
                {
                  key: "tool-separator-two",
                  type: "text" as const,
                  text: "A final independent step follows.",
                },
                {
                  key: "tool-finalize",
                  type: "tool" as const,
                  name: "workspace.finalize",
                  state: "succeeded" as const,
                  presentation: {
                    summary: "Workspace updated",
                    details: [{ label: "Files", value: "2 changed" }],
                  },
                },
              ],
            }
      ),
    },
  };
}

function truthfulToolStateSnapshot(snapshot: Snapshot): Snapshot {
  const states = [
    ["workspace.waiting", "waiting"],
    ["workspace.cancelled", "cancelled"],
    ["workspace.recovery", "needs_attention"],
  ] as const;
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      historyRows: snapshot.conversation.historyRows.map((row) =>
        row.id !== "row_assistant"
          ? row
          : {
              ...row,
              parts: states.flatMap(([name, state], index) => [
                {
                  key: `tool-state-${index}`,
                  type: "tool" as const,
                  name,
                  state,
                },
                ...(index === states.length - 1
                  ? []
                  : [{
                      key: `tool-state-separator-${index}`,
                      type: "text" as const,
                      text: "Next tool state.",
                    }]),
              ]),
            }
      ),
    },
  };
}

function approvalSnapshot(
  snapshot: Snapshot,
  approvalIds: readonly string[] = ["approval_react", "approval_react_2"],
): Snapshot {
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      operation: {
        ...snapshot.conversation.operation!,
        approvals: {
          truncated: false,
          items: approvalIds.map((approvalId, index) => ({
            approvalId,
            approvalRevision: index === 0 && approvalId === "approval_react" ? 4 : 5,
            tool: {
              name: index === 0 ? "workspace.apply" : "workspace.write",
              title: index === 0 ? "Apply workspace change" : "Write workspace file",
              risk: "mutating" as const,
              idempotent: false,
            },
            presentation: {
              summary: index === 0
                ? "Update two reviewed files"
                : "Write one reviewed file",
              summaryTruncated: false,
              details: [{
                label: "Files",
                labelTruncated: false,
                value: index === 0 ? "src/app.ts\nsrc/app.test.ts" : "src/README.md",
                valueTruncated: false,
              }],
              detailsTruncated: false,
            },
            attemptCount: 1,
            createdAt: 3,
            updatedAt: 3,
            availableDecisions: ["approve_once", "deny"] as const,
          })),
        },
      },
    },
  } as Snapshot;
}

function attachmentSnapshot(snapshot: Snapshot): Snapshot {
  const attachment = {
    kind: "product.attachment" as const,
    resourceId: "resource_react",
    resourceKind: "image" as const,
    previewKind: "image" as const,
    state: "available" as const,
    sizeBytes: 3,
    sha256: "a".repeat(64),
    label: "diagram.png",
    mediaType: "image/png",
    addedAt: 3,
  };
  return {
    ...snapshot,
    view: {
      ...snapshot.view,
      conversationAttachments: [attachment],
    },
  };
}

function generatedResourceSnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      historyRows: snapshot.conversation.historyRows.map((row) =>
        row.id !== "row_assistant" ? row : {
          ...row,
          parts: [
            ...row.parts,
            {
              key: "generated-resource",
              type: "resource" as const,
              resourceId: "generated_resource_react",
              sha256: "b".repeat(64),
              sizeBytes: 4,
              kind: "image" as const,
              mediaType: "image/png",
            },
          ],
        }
      ),
    },
  };
}

function nonImageResourceSnapshot(
  snapshot: Snapshot,
): Snapshot {
  const resources = [
    ["file", "application/octet-stream"],
    ["video", "video/mp4"],
    ["audio", "audio/mpeg"],
    ["document", "application/pdf"],
    ["artifact", "application/json"],
    ["log", "text/plain"],
    ["patch", "text/x-diff"],
    ["url", "text/uri-list"],
  ] as const;
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      historyRows: snapshot.conversation.historyRows.map((row) =>
        row.id !== "row_assistant"
          ? row
          : {
              ...row,
              parts: [
                ...row.parts,
                ...resources.map(([kind, mediaType]) => ({
                  key: `non-image-resource-${kind}`,
                  type: "resource" as const,
                  resourceId: `resource_${kind}`,
                  sha256: "c".repeat(64),
                  sizeBytes: 2_048,
                  kind,
                  mediaType,
                })),
              ],
            },
      ),
    },
  };
}

function mediaDelivery(
  request: {
    readonly resourceId: string;
    readonly sha256: string;
    readonly purpose: "preview" | "media";
    readonly sessionId?: string;
  },
  options: {
    readonly url: string;
    readonly resourceKind: "audio" | "video";
    readonly mediaType: string;
    readonly expiresAt: number;
  },
): PreparedResourceDelivery {
  return {
    kind: "web.resource-delivery",
    url: options.url,
    resourceId: request.resourceId,
    sha256: request.sha256,
    resourceKind: options.resourceKind,
    mediaType: options.mediaType,
    sizeBytes: 2_048,
    purpose: request.purpose,
    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    expiresAt: options.expiresAt,
  };
}

function capabilitySnapshot(snapshot: Snapshot): Snapshot {
  const request = {
    kind: "product.capability-request",
    operation: "image.generate",
    requirements: [{
      requirement: { kind: "model-operation", operation: "image.generate" },
      status: "unconfigured",
      reason: "No image generation endpoint is configured",
    }],
    setupRequired: true,
  };
  const rows = snapshot.conversation.historyRows.map((row) =>
    row.id === "row_assistant" ? { ...row, capabilityRequests: [request] } : row
  );
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      historyRows: rows,
      operation: {
        kind: "product.conversation-operation",
        operationId: "operation_react",
        sessionId: "session_react",
        state: "succeeded",
        createdAt: 1,
        updatedAt: 2,
        transcript: {
          rows: [{
            key: "row_assistant",
            kind: "message",
            role: "assistant",
            status: "completed",
            parts: [],
            capabilityRequests: [request],
            createdAt: 2,
            updatedAt: 2,
          }],
          totalRows: 1,
          truncated: false,
        },
        capabilities: {
          steerable: false,
          cancellable: false,
          regeneratable: true,
          terminal: true,
        },
        steering: { pending: [], truncated: false },
      },
    },
  } as unknown as Snapshot;
}

function recoverySnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    conversation: {
      ...snapshot.conversation,
      state: "recovery_required",
      canSubmit: false,
      canRegenerate: false,
      operation: {
        kind: "product.conversation-operation",
        operationId: "operation_react",
        sessionId: "session_react",
        state: "recovery_required",
        createdAt: 1,
        updatedAt: 2,
        transcript: { rows: [], totalRows: 0, truncated: false },
        capabilities: {
          steerable: false,
          cancellable: false,
          regeneratable: false,
          terminal: false,
        },
        steering: { pending: [], truncated: false },
        recovery: {
          truncated: false,
          items: [{
            recoveryId: "recovery_react",
            recoveryRevision: 2,
            tool: {
              name: "workspace.apply",
              title: "Apply workspace change",
              risk: "mutating",
              idempotent: false,
            },
            evidence: {
              message: "Tool process exited before a durable result was recorded",
              messageTruncated: false,
            },
            attemptCount: 1,
            attempts: [{
              attemptNumber: 1,
              state: "recovery_required",
              startedAt: 1,
              updatedAt: 2,
            }],
            attemptsTruncated: false,
            availableDecisions: ["confirm_succeeded", "confirm_failed", "abandon_turn"],
          }],
        },
      },
    },
  } as unknown as Snapshot;
}

function streamingSnapshot(
  snapshot: Snapshot,
  transientAssistantText: string,
  generatedAt: number,
): Snapshot {
  return {
    ...snapshot,
    generatedAt,
    conversation: {
      ...snapshot.conversation,
      state: "running",
      transientAssistantText,
    },
    view: {
      ...snapshot.view,
      conversationState: "running",
    },
  };
}

function installScrollGeometry(
  element: HTMLDivElement,
  initial: {
    readonly clientHeight: number;
    readonly scrollHeight: number;
    readonly scrollTop: number;
  },
): {
  readonly scrollTop: () => number;
  readonly setScrollHeight: (height: number) => void;
} {
  let scrollHeight = initial.scrollHeight;
  let scrollTop = initial.scrollTop;
  Object.defineProperties(element, {
    clientHeight: {
      configurable: true,
      get: () => initial.clientHeight,
    },
    scrollHeight: {
      configurable: true,
      get: () => scrollHeight,
    },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(
          0,
          Math.min(value, Math.max(0, scrollHeight - initial.clientHeight)),
        );
      },
    },
  });
  return {
    scrollTop: () => scrollTop,
    setScrollHeight: (height) => {
      scrollHeight = height;
    },
  };
}

async function setTextarea(
  textarea: HTMLTextAreaElement,
  value: string,
): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitComposer(): Promise<void> {
  const form = requiredElement<HTMLFormElement>("[data-ui-composer]");
  await act(async () => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
}

async function submitForm(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
}

async function setInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function requiredButton(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) =>
      candidate.textContent?.includes(text) ||
      candidate.getAttribute("aria-label")?.includes(text),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`button ${text} was not rendered`);
  }
  return button;
}

function installClipboard(writeText?: (text: string) => Promise<void>): void {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const navigatorWithClipboard = Object.create(globalThis.navigator) as Navigator;
  Object.defineProperty(navigatorWithClipboard, "clipboard", {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  });
  vi.stubGlobal("navigator", navigatorWithClipboard);
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (element === null) throw new Error(`missing element ${selector}`);
  return element as T;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not reached");
}
