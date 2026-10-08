import { describe, expect, it } from "vitest";
import type { PreparedResourceDelivery as RemotePreparedResourceDelivery } from "@wanex/assistant-host";
import {
  createDesktopAssistantResourceRelay,
  DESKTOP_RESOURCE_SCHEME,
  installDesktopResourceProtocol,
  type DesktopResourceProtocol,
} from "../src/assistant/resource-relay.js";
import type {
  DesktopServerResourceBinding,
  DesktopServerResourceTransport,
} from "../src/server/resource-transport.js";

const binding: DesktopServerResourceBinding = {
  profileId: "office",
  serverUrl: "https://office.example.test",
};

describe("Desktop Assistant resource relay", () => {
  it("projects only a local capability and forwards bounded delivery headers", async () => {
    const opened: Array<{
      readonly method: string;
      readonly range?: string;
      readonly ifNoneMatch?: string;
      readonly grant: string;
    }> = [];
    const transport = fakeTransport(async (request) => {
      opened.push(request);
      return response(200, "hello", {
        "content-type": "image/png",
        etag: '"sha256-' + "a".repeat(64) + '"',
        digest: `sha-256=${Buffer.from("a".repeat(64), "hex").toString("base64")}`,
      });
    });
    const relay = createDesktopAssistantResourceRelay({ transport });
    const delivery = relay.prepare({
      generation: 3,
      binding,
      delivery: remoteDelivery({ sizeBytes: 5 }),
      revoke: async () => {},
    });

    expect(delivery.url).toMatch(
      new RegExp(`^${DESKTOP_RESOURCE_SCHEME}://delivery/wrc_[A-Za-z0-9_-]{43}$`),
    );
    expect(delivery.url).not.toContain("Bearer");
    expect(delivery).not.toHaveProperty("token");

    const result = await relay.handle(new Request(delivery.url, {
      headers: {
        Range: "bytes=0-4",
        "If-None-Match": '"stale"',
      },
    }));
    expect(result.status).toBe(200);
    expect(await result.text()).toBe("hello");
    expect(opened).toEqual([expect.objectContaining({
      method: "GET",
      range: "bytes=0-4",
      ifNoneMatch: '"stale"',
      grant: "wrd_" + "b".repeat(43),
    })]);
  });

  it("rejects malformed capability URLs and unsupported methods", async () => {
    const relay = createDesktopAssistantResourceRelay({
      transport: fakeTransport(async () => response(200, "hello", evidenceHeaders())),
    });
    const delivery = relay.prepare({
      generation: 1,
      binding,
      delivery: remoteDelivery(),
      revoke: async () => {},
    });
    await expect(relay.handle(new Request(`${delivery.url}?token=secret`))).resolves.toMatchObject({
      status: 400,
    });
    await expect(relay.handle(new Request(delivery.url, { method: "POST" }))).resolves.toMatchObject({
      status: 405,
    });
    const unknown = delivery.url.replace(/wrc_[A-Za-z0-9_-]{43}$/u, `wrc_${"c".repeat(43)}`);
    await expect(relay.handle(new Request(unknown))).resolves.toMatchObject({
      status: 404,
    });
  });

  it("revokes delivery grants on release, retirement, expiry, and close", async () => {
    const revoked: string[] = [];
    let now = 100;
    const relay = createDesktopAssistantResourceRelay({
      now: () => now,
      transport: fakeTransport(async () => response(200, "hello", evidenceHeaders())),
    });
    const make = (generation: number, profileId = "office") => relay.prepare({
      generation,
      binding: { ...binding, profileId },
      delivery: remoteDelivery({ expiresAt: 200 }),
      revoke: async () => { revoked.push(`${generation}:${profileId}`); },
    });
    const released = make(1);
    await relay.release({ generation: 1, delivery: released });
    const generation = make(2);
    const profile = make(3, "home");
    const expired = make(4);
    now = 201;
    expect((await relay.handle(new Request(expired.url))).status).toBe(410);
    await relay.retireGeneration(2);
    await relay.retireProfile("home");
    await relay.close();
    expect(revoked.sort()).toEqual(["1:office", "2:office", "3:home", "4:office"]);
    expect((await relay.handle(new Request(generation.url))).status).toBe(410);
  });

  it("removes the protocol handler exactly once", async () => {
    const protocol = new TestProtocol();
    const relay = createDesktopAssistantResourceRelay({
      transport: fakeTransport(async () => response(200, "hello", evidenceHeaders())),
    });
    const remove = installDesktopResourceProtocol(protocol, relay);
    expect(protocol.handlers.has(DESKTOP_RESOURCE_SCHEME)).toBe(true);
    remove();
    remove();
    expect(protocol.removed).toEqual([DESKTOP_RESOURCE_SCHEME]);
  });

  it("rejects remote response evidence before exposing a body", async () => {
    const relay = createDesktopAssistantResourceRelay({
      transport: fakeTransport(async () => response(200, "hello", {
        ...evidenceHeaders(),
        digest: "sha-256=invalid",
      })),
    });
    const delivery = relay.prepare({
      generation: 1,
      binding,
      delivery: remoteDelivery({ sizeBytes: 5 }),
      revoke: async () => {},
    });
    const result = await relay.handle(new Request(delivery.url));
    expect(result.status).toBe(502);
    expect(await result.text()).toBe("");
  });
});

function remoteDelivery(
  overrides: Partial<RemotePreparedResourceDelivery> = {},
): RemotePreparedResourceDelivery {
  return {
    kind: "assistant-host.resource-delivery",
    token: "wrd_" + "b".repeat(43),
    resourceId: "resource-image",
    sha256: "a".repeat(64),
    resourceKind: "image",
    mediaType: "image/png",
    sizeBytes: 5,
    purpose: "preview",
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

function evidenceHeaders(): Record<string, string> {
  return {
    "content-type": "image/png",
    etag: '"sha256-' + "a".repeat(64) + '"',
    digest: `sha-256=${Buffer.from("a".repeat(64), "hex").toString("base64")}`,
  };
}

function response(
  status: number,
  body: string,
  headers: Record<string, string>,
): Response {
  return new Response(body, {
    status,
    headers: { ...headers, "content-length": String(body.length) },
  });
}

function fakeTransport(
  open: (request: {
    readonly method: "GET" | "HEAD";
    readonly grant: string;
    readonly range?: string;
    readonly ifNoneMatch?: string;
    readonly signal: AbortSignal;
    readonly binding: DesktopServerResourceBinding;
  }) => Promise<Response>,
): DesktopServerResourceTransport {
  return { open };
}

class TestProtocol implements DesktopResourceProtocol {
  readonly handlers = new Map<string, (request: Request) => Promise<Response>>();
  readonly removed: string[] = [];
  handle(scheme: string, handler: (request: Request) => Response | Promise<Response>): void {
    this.handlers.set(scheme, async (request) => await handler(request));
  }
  unhandle(scheme: string): void {
    this.handlers.delete(scheme);
    this.removed.push(scheme);
  }
}
