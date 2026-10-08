// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppProps, Client } from "@wanex/assistant-ui/client";
import { ProductRenderer } from "../src/renderer/product.js";

// Isolate Desktop's composition wiring; real App notification is tested by
// assistant-ui and the rendered browser fixture exercises both owners together.
vi.mock("@wanex/assistant-ui/client", async (original) => ({
  ...await original<typeof import("@wanex/assistant-ui/client")>(),
  App: ({ onThemeChange }: AppProps) => createElement("div", {},
    ...(["light", "dark", "system"] as const).map((theme) => createElement("button", {
      key: theme,
      "data-test-theme": theme,
      onClick: () => onThemeChange?.(theme),
    }, theme)),
  ),
}));

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("Desktop appearance composition", () => {
  it("defaults to system then consumes each canonical App notification on the outer root", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(createElement(ProductRenderer, {
      createLocalAssistantClient: () => ({} as Client),
      assistantLocationClient: undefined,
      serverProfileClient: undefined,
    })));
    const renderer = document.querySelector<HTMLElement>("[data-ui-product-renderer]")!;
    expect(renderer.dataset.theme).toBe("system");
    for (const theme of ["light", "dark", "system"]) {
      await act(async () => document.querySelector<HTMLButtonElement>(`[data-test-theme="${theme}"]`)!.click());
      expect(renderer.dataset.theme).toBe(theme);
    }
  });
});
