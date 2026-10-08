import { describe, expect, it } from "vitest";
import type { ResolvedSecret } from "@wanex/runtime/secrets";
import { createDesktopServerAttachmentTransport } from "../src/server/attachment-transport.js";
import type { DesktopServerProfileCatalog } from "../src/server/profile-catalog.js";

describe("Desktop Server attachment transport", () => {
  it("keeps credentials in main and validates a bounded canonical response", async () => {
    const secret = testSecret("server-bearer");
    const observed: Array<{ readonly url: string; readonly init: RequestInit }> = [];
    const transport = createDesktopServerAttachmentTransport({
      profiles: profiles(secret),
      fetch: async (input, init) => {
        observed.push({ url: String(input), init: init ?? {} });
        return new Response(JSON.stringify(successPayload()), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const content = new Uint8Array([1, 2, 3]);
    const attachment = await transport.upload({
      binding: {
        profileId: "office",
        serverUrl: "https://office.example.test/",
      },
      attachment: {
        content,
        mediaType: "image/png",
        kind: "image",
        label: "screen.png",
        sessionId: "ses_office",
      },
      signal: new AbortController().signal,
    });

    expect(attachment.resourceId).toBe("res_remote_upload");
    expect(observed).toHaveLength(1);
    expect(observed[0]?.url).toBe(
      "https://office.example.test/v1/assistant/attachment",
    );
    expect(new Headers(observed[0]?.init.headers).get("authorization")).toBe(
      "Bearer server-bearer",
    );
    expect(new Headers(observed[0]?.init.headers).get("x-wanex-media-type"))
      .toBe("image%2Fpng");
    expect(new Headers(observed[0]?.init.headers).get("content-length"))
      .toBe(String(content.byteLength));
    expect(observed[0]?.init.body).toBe(content);
    expect(secret.disposed).toBe(true);
    expect(JSON.stringify(attachment)).not.toContain("server-bearer");
  });

  it("rejects stale bindings, oversized responses, and malformed evidence", async () => {
    let fetchCalls = 0;
    const stale = createDesktopServerAttachmentTransport({
      profiles: profiles(testSecret("unused")),
      fetch: async () => {
        fetchCalls += 1;
        return new Response();
      },
    });
    await expect(stale.upload({
      binding: {
        profileId: "office",
        serverUrl: "https://stale.example.test/",
      },
      attachment: request(),
      signal: new AbortController().signal,
    })).rejects.toThrow("binding is no longer current");
    expect(fetchCalls).toBe(0);

    const oversizedSecret = testSecret("oversized");
    const oversized = createDesktopServerAttachmentTransport({
      profiles: profiles(oversizedSecret),
      fetch: async () => new Response("x", {
        status: 201,
        headers: {
          "content-length": String(64 * 1024 + 1),
          "content-type": "application/json",
        },
      }),
    });
    await expect(oversized.upload({
      binding,
      attachment: request(),
      signal: new AbortController().signal,
    })).rejects.toThrow("response is too large");
    expect(oversizedSecret.disposed).toBe(true);

    const malformed = createDesktopServerAttachmentTransport({
      profiles: profiles(testSecret("malformed")),
      fetch: async () => new Response(JSON.stringify({
        ...successPayload(),
        remoteUrl: "https://secret.example.test/blob",
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    });
    await expect(malformed.upload({
      binding,
      attachment: request(),
      signal: new AbortController().signal,
    })).rejects.toThrow("response is invalid");

    const wrongMediaType = createDesktopServerAttachmentTransport({
      profiles: profiles(testSecret("wrong-media-type")),
      fetch: async () => new Response(JSON.stringify(successPayload()), {
        status: 201,
        headers: { "content-type": "text/html" },
      }),
    });
    await expect(wrongMediaType.upload({
      binding,
      attachment: request(),
      signal: new AbortController().signal,
    })).rejects.toThrow("response media type is invalid");
  });
});

const binding = {
  profileId: "office",
  serverUrl: "https://office.example.test/",
} as const;

function request() {
  return {
    content: new Uint8Array([1]),
    mediaType: "image/png",
    kind: "image" as const,
  };
}

function successPayload() {
  return {
    kind: "wanex.server.attachment-uploaded",
    attachment: {
      kind: "assistant.attachment",
      resourceId: "res_remote_upload",
      resourceKind: "image",
      previewKind: "image",
      state: "available",
      sizeBytes: 3,
      sha256: "a".repeat(64),
      label: "screen.png",
      mediaType: "image/png",
      addedAt: 10,
    },
  };
}

interface TestSecret extends ResolvedSecret {
  readonly disposed: boolean;
}

function testSecret(value: string): TestSecret {
  let disposed = false;
  return {
    ref: "wanex-keychain://test/server",
    provider: "test",
    get disposed() { return disposed; },
    reveal() {
      if (disposed) throw new Error("secret is disposed");
      return value;
    },
    dispose() { disposed = true; },
    toJSON() { throw new Error("secret must not be serialized"); },
  };
}

function profiles(secret: TestSecret): DesktopServerProfileCatalog {
  return {
    async list() { return []; },
    async read(profileId) {
      return profileId === "office"
        ? {
            profileId,
            name: "Office",
            serverUrl: "https://office.example.test/",
            credentialConfigured: true,
            createdAt: 1,
            updatedAt: 1,
          }
        : null;
    },
    async resolveCredential(profileId) {
      return profileId === "office" ? secret : null;
    },
    async reconcileCredentialRetirement() { return false; },
    async save() { throw new Error("not used"); },
    async remove() {},
  };
}
