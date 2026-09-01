import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Client as AssistantClient } from "@wanex/assistant-ui/client";
import {
  ProductRenderer,
  WorkspaceRail,
} from "../src/renderer/product.js";

describe("Desktop product renderer", () => {
  it("renders stable left-side workspace navigation without the retired floating switch", () => {
    const html = renderToStaticMarkup(createElement(ProductRenderer, {
      assistantClient: assistantClient(),
      codingClient: undefined,
      remoteClient: undefined,
    }));

    expect(html).toContain('class="workspace-rail"');
    expect(html).toContain('aria-label="Workspaces"');
    expect(html).toContain('data-ui-product-surface="assistant"');
    expect(html).toContain('data-ui-product-surface="coding"');
    expect(html).toContain('aria-label="Open chat workspace"');
    expect(html).toContain('aria-label="Open code workspace"');
    expect(html).toContain('class="workspace-viewport"');
    expect(html).not.toContain("product-switcher");
  });

  it("makes every workspace control inert while the active surface owns a modal", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceRail, {
      surface: "assistant",
      inactive: true,
      onSelect: () => {},
    }));

    expect(html).toContain('inert=""');
    expect(html).toContain('data-ui-workspace-rail-inactive="true"');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

function assistantClient(): AssistantClient {
  return {
    readSnapshot: async () => {
      throw new Error("not used during server render");
    },
    dispatchAction: async () => {
      throw new Error("not used during server render");
    },
  };
}
