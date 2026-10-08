// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { runWanexDesktopRendererProof } from "../src/proof.js";
import type { WanexDesktopRendererLayoutProofFactory } from "../src/renderer-layout-proof.js";

afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("installed command acceptance readiness", () => {
  it("waits for enabled Execute and Done controls without replaying an action", async () => {
    const fixture = startProof();
    await vi.advanceTimersByTimeAsync(50);
    const execute = required<HTMLButtonElement>('[data-ui-command-preview] button');
    await vi.advanceTimersByTimeAsync(50);
    expect(execute.disabled).toBe(true);
    expect(fixture.executeClick).not.toHaveBeenCalled();
    expect(fixture.executions).toBe(0);

    execute.disabled = false;
    await vi.advanceTimersByTimeAsync(50);
    const done = required<HTMLButtonElement>('[data-ui-command-execution] button');
    await vi.advanceTimersByTimeAsync(50);
    expect(done.disabled).toBe(true);
    expect(fixture.doneClick).not.toHaveBeenCalled();
    expect(fixture.closures).toBe(0);

    done.disabled = false;
    await vi.advanceTimersByTimeAsync(50);
    expect(await fixture.result).toMatchObject({
      ok: true,
      canonicalCommandPreviewed: true,
      canonicalCommandExecuted: true,
      commandCompletionVisible: true,
    });
    expect(fixture.executeClick).toHaveBeenCalledTimes(1);
    expect(fixture.doneClick).toHaveBeenCalledTimes(1);
    expect(fixture.executions).toBe(1);
    expect(fixture.closures).toBe(1);
  });

  it("fails at preview readiness when Execute never becomes enabled", async () => {
    const fixture = startProof();
    await vi.advanceTimersByTimeAsync(20_100);
    expect(await fixture.result).toMatchObject({ ok: false, failureStage: "command_preview" });
    expect(fixture.executions).toBe(0);
    expect(fixture.closures).toBe(0);
  });

  it("fails at result readiness when Done never becomes enabled", async () => {
    const fixture = startProof(true);
    await vi.advanceTimersByTimeAsync(20_100);
    expect(await fixture.result).toMatchObject({ ok: false, failureStage: "command_execution" });
    expect(fixture.executions).toBe(1);
    expect(fixture.closures).toBe(0);
  });
});

// Controlled DOM deliberately isolates the real acceptance driver from React,
// Provider and layout timing; the installed journey separately proves integration.
function startProof(executeInitiallyEnabled = false) {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404 })));
  document.body.innerHTML = `
    <main data-ui-assistant-shell>
      <section data-ui-settings-panel><button aria-label="Close settings">Close</button></section>
      <span data-ui-provider-state="ready"></span>
      <nav data-ui-session-drawer aria-label="Conversation navigation"><div data-ui-session-list></div></nav>
      <section data-ui-conversation-main aria-label="Conversation">
        <span data-ui-selected-session-title></span>
        <div data-ui-composer-dock><form data-ui-composer data-ui-composer-mode="submit">
          <textarea name="text" aria-label="Message"></textarea>
          <button type="submit" aria-label="Send message">Send</button>
          <button type="button" data-ui-model-selector></button>
          <button type="button" data-ui-action="open-add-menu">Add</button>
          <input data-ui-attachment-input type="file">
        </form></div>
      </section>
    </main>`;
  let executions = 0;
  let closures = 0;
  let executeClick: ReturnType<typeof vi.spyOn> | undefined;
  let doneClick: ReturnType<typeof vi.spyOn> | undefined;
  required('[aria-label="Close settings"]').addEventListener("click", () => {
    required('[data-ui-settings-panel]').remove();
  });
  const model = required<HTMLButtonElement>('[data-ui-model-selector]');
  model.addEventListener("pointerdown", () => {
    const item = document.createElement("button");
    item.dataset.uiEndpoint = "selected";
    item.addEventListener("click", () => {
      model.dataset.uiActiveEndpoint = "selected";
      item.remove();
    });
    document.body.append(item);
  });
  required('textarea').addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Enter") return;
    event.preventDefault();
    required('[data-ui-selected-session-title]').textContent = expected.heading;
    required('[data-ui-session-list]').innerHTML = `
      <button data-ui-session-select="session" aria-current="true">
        <span data-ui-session-title>${expected.heading}</span><small>active</small>
      </button>`;
    const timeline = document.createElement("div");
    timeline.setAttribute("role", "log");
    timeline.setAttribute("aria-label", "Conversation messages");
    timeline.dataset.uiConversationTimeline = "";
    timeline.dataset.uiConversationState = "succeeded";
    timeline.dataset.uiOperationId = "operation";
    timeline.innerHTML = `
      <article data-ui-conversation-row="user" data-ui-role="user">
        <div data-ui-rich-text><h1>${expected.heading}</h1><pre><code>${expected.code}</code></pre></div>
      </article>
      <article data-ui-conversation-row="assistant" data-ui-role="assistant">${expected.selectedResponse}</article>`;
    required('[data-ui-conversation-main]').prepend(timeline);
  });
  required('[data-ui-action="open-add-menu"]').addEventListener("pointerdown", () => {
    const menu = document.createElement("div");
    menu.dataset.uiAddMenu = "";
    menu.innerHTML = '<button data-ui-action="open-commands">Commands</button>';
    menu.firstElementChild?.addEventListener("click", () => {
      menu.remove();
      const palette = document.createElement("section");
      palette.dataset.uiCommandPalette = "";
      palette.setAttribute("role", "dialog");
      palette.setAttribute("aria-label", "Commands");
      palette.innerHTML = '<button data-ui-command="assistant.status">Status</button>';
      palette.firstElementChild?.addEventListener("click", () => {
        palette.innerHTML = `<div data-ui-command-preview="runnable"><button ${executeInitiallyEnabled ? "" : "disabled"}>Execute</button></div>`;
        executeClick = vi.spyOn(required<HTMLButtonElement>('[data-ui-command-preview] button'), "click");
        palette.querySelector("button")?.addEventListener("click", () => {
          executions += 1;
          palette.innerHTML = '<div data-ui-command-execution="completed">Command completed<button disabled>Done</button></div>';
          doneClick = vi.spyOn(required<HTMLButtonElement>('[data-ui-command-execution] button'), "click");
          palette.querySelector("button")?.addEventListener("click", () => {
            closures += 1;
            palette.remove();
          });
        });
      });
      required('[data-ui-assistant-shell]').append(palette);
    });
    document.body.append(menu);
  });

  const result = runWanexDesktopRendererProof(expected, () => ({
    async configure() {
      return {
        providerConfigured: true,
        providerEditedWithoutCredential: true,
        configuredProviderCount: 2,
        selectedEndpointId: "selected",
      };
    },
    async removeSelectedAndRunFallback() {
      return {
        activeProviderRemoved: true,
        fallbackProviderReady: true,
        fallbackModelId: expected.primaryModelId,
        fallbackModelResponseVisible: true,
      };
    },
  }), layoutFactory);
  return {
    result,
    get executions() { return executions; },
    get closures() { return closures; },
    get executeClick() { return executeClick; },
    get doneClick() { return doneClick; },
  };
}

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing proof fixture: ${selector}`);
  return element;
}

const expected = {
  source: "# Proof heading", heading: "Proof heading", code: "proof code",
  primaryBaseUrl: "https://primary.invalid", selectedBaseUrl: "https://selected.invalid",
  credential: "fixture-credential", primaryModelId: "primary", selectedDraftModelId: "draft",
  selectedModelId: "selected", selectedResponse: "Selected reply", fallbackResponse: "Fallback reply",
};

const layoutFactory: WanexDesktopRendererLayoutProofFactory = () => ({
  captureInitialLayout: () => emptyLayout,
  emptyInitialLayout: () => emptyLayout,
  intersectsViewport: () => true,
  isTimelineScrollOwner: () => true,
});
const emptyLayout = {
  viewportWidth: 0, viewportHeight: 0, shellTop: 0, shellBottom: 0, sidebarWidth: 0,
  timelineHeight: 0, composerDockHeight: 0, composerHeight: 0,
  shellStartsAtViewportTop: false, shellFitsViewport: false, noHorizontalOverflow: false,
  settingsTriggerFullyVisible: false, settingsPanelInitiallyClosed: false, sidebarVisible: false,
  composerFullyVisible: false, initialScrollPolicyValid: false,
};
