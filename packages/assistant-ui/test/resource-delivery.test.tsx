// @vitest-environment happy-dom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, PreparedResourceDelivery } from "../src/client/contracts.js";
import { ResourceImagePreview } from "../src/ui/resources/preview.js";
import { ResourceMediaPlayback } from "../src/ui/resources/media.js";

type Kind = "image" | "audio" | "video";
type Prepare = NonNullable<Client["prepareResourceDelivery"]>;
interface Props {
  client: Client;
  resourceId: string;
  sha256: string;
  sessionId: string;
  label: string;
}
let root: Root | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("resource delivery lifetime", () => {
  it.each<Kind>(["image", "audio", "video"])(
    "%s releases pending deliveries after unmount without publishing errors",
    async (kind) => {
      const pending: Array<ReturnType<typeof deferred<PreparedResourceDelivery>>> = [];
      const target = client(async () => {
        const request = deferred<PreparedResourceDelivery>();
        pending.push(request);
        return await request.promise;
      });
      await mount(kind, target);
      await start(kind);
      await act(async () => root?.unmount());
      root = undefined;
      await act(async () => {
        for (const [index, request] of pending.entries()) request.resolve(delivery(kind, `late-${index}`));
      });
      expect(target.releaseResourceDelivery).toHaveBeenCalledTimes(pending.length);
      expect(document.body.textContent).toBe("");
    },
  );

  it.each<Kind>(["image", "audio", "video"])(
    "%s releases late preparation through the original Client exactly once",
    async (kind) => {
      const pending: Array<ReturnType<typeof deferred<PreparedResourceDelivery>>> = [];
      const prepare = vi.fn<Prepare>().mockImplementation(async () => {
        const request = deferred<PreparedResourceDelivery>();
        pending.push(request);
        return await request.promise;
      });
      const original = client(prepare);
      const props = await mount(kind, original);
      await start(kind);
      const replacement = client(vi.fn<Prepare>().mockResolvedValue(delivery(kind, "next")));
      await render(kind, { ...props, client: replacement });
      for (const [index, request] of pending.entries()) {
        await act(async () => request.resolve(delivery(kind, `old-${index}`)));
      }
      expect(original.releaseResourceDelivery).toHaveBeenCalledTimes(pending.length);
      expect(replacement.releaseResourceDelivery).not.toHaveBeenCalled();
      expect(document.body.innerHTML).not.toContain("old-");
      await act(async () => root?.unmount());
      root = undefined;
      expect(original.releaseResourceDelivery).toHaveBeenCalledTimes(pending.length);
    },
  );

  it.each(["resource", "digest", "session", "client"])(
    "does not reuse image nodes or let stale errors release the new %s delivery",
    async (change) => {
      let count = 0;
      const prepare = vi.fn<Prepare>().mockImplementation(async () => delivery("image", `image-${++count}`));
      const original = client(prepare);
      const props = await mount("image", original);
      const old = element<HTMLImageElement>("img");
      const nextClient = change === "client" ? client(prepare) : original;
      await render("image", { ...props, client: nextClient,
        ...(change === "resource" ? { resourceId: "resource-2" } : {}),
        ...(change === "digest" ? { sha256: "b".repeat(64) } : {}),
        ...(change === "session" ? { sessionId: "session-2" } : {}),
      });
      const next = element<HTMLImageElement>("img");
      expect(next).not.toBe(old);
      expect(old.isConnected).toBe(false);
      const releases = vi.mocked(original.releaseResourceDelivery!).mock.calls.length;
      await act(async () => {
        old.dispatchEvent(new Event("error"));
        old.dispatchEvent(new Event("load"));
      });
      expect(element("img")).toBe(next);
      expect(vi.mocked(original.releaseResourceDelivery!).mock.calls.length).toBe(releases);
      await act(async () => next.dispatchEvent(new Event("load")));
      expect(element("[data-ui-preview-state]").getAttribute("data-ui-preview-state")).toBe("ready");
      await act(async () => root?.unmount());
      root = undefined;
      const all = nextClient === original ? vi.mocked(original.releaseResourceDelivery!).mock.calls
        : [...vi.mocked(original.releaseResourceDelivery!).mock.calls, ...vi.mocked(nextClient.releaseResourceDelivery!).mock.calls];
      expect(all.map(([value]) => value.url).sort()).toEqual(
        Array.from({ length: count }, (_, index) => delivery("image", `image-${index + 1}`).url).sort(),
      );
    },
  );

  it.each<"audio" | "video">(["audio", "video"])(
    "%s replacement requires explicit play and does not inherit position or intent",
    async (kind) => {
      let count = 0;
      const prepare = vi.fn<Prepare>().mockImplementation(async () => delivery(kind, `media-${++count}`));
      const props = await mount(kind, client(prepare));
      await start(kind);
      const old = element<HTMLMediaElement>(kind);
      old.currentTime = 37;
      await act(async () => old.dispatchEvent(new Event("pause")));
      await render(kind, { ...props, resourceId: "resource-2" });
      expect(document.querySelector(kind)).toBeNull();
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(element("[data-ui-media-state]").getAttribute("data-ui-media-state")).toBe("idle");
      await start(kind);
      const next = element<HTMLMediaElement>(kind);
      expect(next).not.toBe(old);
      await act(async () => {
        old.dispatchEvent(new Event("pause"));
        old.dispatchEvent(new Event("error"));
        next.dispatchEvent(new Event("loadedmetadata"));
        next.dispatchEvent(new Event("canplay"));
      });
      expect(next.currentTime).toBe(0);
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledExactlyOnceWith();
      expect(prepare).toHaveBeenCalledTimes(2);
    },
  );

  it.each<Kind>(["image", "audio", "video"])(
    "%s retains keyboard focus across explicit retry and hides raw error credentials",
    async (kind) => {
      const prepare = vi.fn<Prepare>()
        .mockRejectedValue(new Error("https://host/private?token=secret"));
      const props = await mount(kind, client(prepare));
      await start(kind);
      expect(document.body.textContent).not.toContain("secret");
      const retry = element<HTMLButtonElement>("button");
      retry.focus();
      const pending = deferred<PreparedResourceDelivery>();
      prepare.mockImplementation(async () => await pending.promise);
      await act(async () => retry.click());
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement?.isConnected).toBe(true);
      await act(async () => pending.resolve(delivery(kind, "retried")));
      const native = element<HTMLImageElement | HTMLMediaElement>(kind === "image" ? "img" : kind);
      await act(async () => native.dispatchEvent(new Event(kind === "image" ? "load" : "loadedmetadata")));
      expect(document.activeElement).not.toBe(document.body);
      expect(props.client.releaseResourceDelivery).not.toHaveBeenCalled();
    },
  );

  it.each<"audio" | "video">(["audio", "video"])(
    "%s renews expiry only once, preserves paused position, then requires explicit retry",
    async (kind) => {
      const prepare = vi.fn<Prepare>().mockImplementation(async () => ({
        ...delivery(kind, `expired-${prepare.mock.calls.length}`), expiresAt: 1,
      }));
      const target = client(prepare);
      await mount(kind, target);
      await start(kind);
      const first = element<HTMLMediaElement>(kind);
      await act(async () => first.dispatchEvent(new Event("loadedmetadata")));
      vi.mocked(HTMLMediaElement.prototype.play).mockClear();
      first.currentTime = 19;
      await act(async () => {
        first.dispatchEvent(new Event("pause"));
        first.dispatchEvent(new Event("error"));
        first.dispatchEvent(new Event("error"));
      });
      expect(prepare).toHaveBeenCalledTimes(2);
      const renewed = element<HTMLMediaElement>(kind);
      expect(renewed).not.toBe(first);
      await act(async () => {
        first.dispatchEvent(new Event("play"));
        renewed.dispatchEvent(new Event("loadedmetadata"));
        renewed.dispatchEvent(new Event("canplay"));
      });
      expect(renewed.currentTime).toBe(19);
      expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
      await act(async () => renewed.dispatchEvent(new Event("error")));
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(target.releaseResourceDelivery).toHaveBeenCalledTimes(2);
      expect(element<HTMLButtonElement>("button").getAttribute("aria-label")).toBe("Retry Example");
      await act(async () => element<HTMLButtonElement>("button").click());
      expect(prepare).toHaveBeenCalledTimes(3);
      await act(async () => element(kind).dispatchEvent(new Event("loadedmetadata")));
      expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
      await act(async () => root?.unmount());
      root = undefined;
      expect(target.releaseResourceDelivery).toHaveBeenCalledTimes(3);
    },
  );

  it.each<Kind>(["image", "audio", "video"])(
    "%s exposes capability unavailability without retry or I/O",
    async (kind) => {
      const target = client(vi.fn<Prepare>());
      const { prepareResourceDelivery: _prepare, ...unavailable } = target;
      await mount(kind, unavailable);
      expect(document.body.textContent).toContain(kind === "image" ? "Preview unavailable" : "Playback unavailable");
      expect(document.querySelector("button, img, audio, video")).toBeNull();
      expect(target.prepareResourceDelivery).not.toHaveBeenCalled();
    },
  );

  it.each<Kind>(["image", "audio", "video"])(
    "%s readiness does not steal focus moved elsewhere during loading",
    async (kind) => {
      const pending = deferred<PreparedResourceDelivery>();
      await mount(kind, client(async () => await pending.promise));
      await start(kind);
      const input = document.createElement("input");
      document.body.append(input);
      input.focus();
      await act(async () => pending.resolve(delivery(kind, "ready")));
      await act(async () => element(kind === "image" ? "img" : kind).dispatchEvent(new Event(kind === "image" ? "load" : "loadedmetadata")));
      expect(document.activeElement).toBe(input);
    },
  );
});

async function mount(kind: Kind, target: Client): Promise<Props> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props = { client: target, resourceId: "resource-1", sha256: "a".repeat(64), sessionId: "session-1", label: "Example" };
  await render(kind, props);
  return props;
}
async function render(kind: Kind, props: Props): Promise<void> {
  await act(async () => root!.render(<StrictMode>{kind === "image"
    ? <ResourceImagePreview {...props} />
    : <ResourceMediaPlayback {...props} kind={kind} />}</StrictMode>));
}
async function start(kind: Kind): Promise<void> {
  if (kind !== "image") await act(async () => element<HTMLButtonElement>("button").click());
}
function element<T extends Element = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) throw new Error(`Missing ${selector}`);
  return found;
}
function client(prepare: Prepare): Client {
  return {
    prepareResourceDelivery: prepare,
    releaseResourceDelivery: vi.fn(async () => undefined),
    readSnapshot: async () => { throw new Error("Unexpected read"); },
    dispatchAction: async () => { throw new Error("Unexpected action"); },
  };
}
function delivery(kind: Kind, id: string): PreparedResourceDelivery {
  return {
    kind: "web.resource-delivery", url: `/resource-delivery?token=${id}`,
    resourceId: "resource-1", sha256: "a".repeat(64), resourceKind: kind,
    mediaType: kind === "image" ? "image/png" : kind === "audio" ? "audio/wav" : "video/webm",
    purpose: kind === "image" ? "preview" : "media", sessionId: "session-1",
    sizeBytes: 1, expiresAt: Date.now() + 60_000,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
