import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Client as AssistantClient } from "@wanex/assistant-ui/client";
import {
  AssistantLocationControl,
  ProductRenderer,
} from "../src/renderer/product.js";
import { ConnectionsDialog } from "../src/renderer/server/connections.js";

describe("desktop product renderer", () => {
  it("renders one immersive Assistant surface without a Coding rail", () => {
    const html = renderToStaticMarkup(
      createElement(ProductRenderer, {
        createLocalAssistantClient: () => assistantClient,
        assistantLocationClient: undefined,
        serverProfileClient: undefined,
      }),
    );

    expect(html).toContain('data-ui-product-renderer="true"');
    expect(html).toContain('data-ui-surface="assistant"');
    expect(html).toContain('class="workspace-viewport"');
    expect(html).toContain('<main class="assistant-location-loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain("workspace-rail");
    expect(html).not.toContain("data-ui-product-surface=\"coding\"");
    expect(html).not.toContain("wanexCoding");
  });

  it("offers local and remote conversation locations without exposing transport details", () => {
    const html = renderToStaticMarkup(
      createElement(AssistantLocationControl, {
        location: { kind: "server", profileId: "office", name: "Office" },
        profiles: [{ profileId: "office", name: "Office" }],
        pending: false,
        disabled: false,
        onSelect: () => {},
        onManageServers: () => {},
      }),
    );

    // The chip names the active location; the menu itself opens on demand.
    expect(html).toContain('aria-label="Chat execution location"');
    expect(html).toContain("<span>Office</span>");
    expect(html).not.toContain("agent-host");
    expect(html).not.toContain("https://");
  });

  it("keeps server profile management in one product-owned dialog", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionsDialog, {
        client: {
          listProfiles: async () => [],
          saveProfile: async () => profile,
          removeProfile: async () => {},
        },
        profiles: [profile],
        loading: false,
        loadError: undefined,
        onProfilesChanged: () => {},
        onClose: () => {},
      }),
    );

    expect(html).toContain('data-ui-connections-dialog="true"');
    expect(html).toContain('data-ui-server-profile-action="add"');
    expect(html).toContain('data-ui-server-profile="office"');
    expect(html).toContain("Servers available to chat");
  });
});

const profile = {
  profileId: "office",
  name: "Office",
  serverUrl: "https://office.example.test/",
  credentialConfigured: true,
  createdAt: 1,
  updatedAt: 1,
};

const assistantClient = {} as AssistantClient;
