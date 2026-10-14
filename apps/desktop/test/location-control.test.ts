// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantLocationControl } from "../src/renderer/product.js";

let root: Root | undefined;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Desktop execution location control", () => {
  it("uses platform-neutral local copy in both the chip and opened menu", async () => {
    const onSelect = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(createElement(AssistantLocationControl, {
      location: { kind: "local" },
      profiles: [{ profileId: "office", name: "Office" }],
      pending: false,
      disabled: false,
      onSelect,
    })));
    const trigger = document.querySelector<HTMLButtonElement>("[data-ui-assistant-location-control]")!;
    expect(trigger.textContent).toContain("This computer");
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowDown", bubbles: true, cancelable: true,
    })));
    const local = document.querySelector('[data-ui-location="local"]')!;
    expect(local).not.toBeNull();
    expect(local.textContent).toContain("This computer");
    expect(local.getAttribute("aria-checked")).toBe("true");
    const remote = document.querySelector<HTMLElement>('[data-ui-location="server:office"]')!;
    expect(remote.textContent).toContain("Office");
    expect(document.body.textContent).not.toContain("This Mac");
    await act(async () => remote.click());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("server:office");
  });
});
