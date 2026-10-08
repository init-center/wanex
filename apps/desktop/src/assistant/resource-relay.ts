import { randomBytes } from "node:crypto";
import type { PreparedResourceDelivery as RemotePreparedResourceDelivery } from "@wanex/assistant-host";
import type { PreparedResourceDelivery } from "@wanex/assistant-ui/client";
import type {
  DesktopServerResourceBinding,
  DesktopServerResourceTransport,
} from "../server/resource-transport.js";

export const DESKTOP_RESOURCE_SCHEME = "wanex-resource" as const;
export const DESKTOP_RESOURCE_PROTOCOL_PRIVILEGES = Object.freeze({
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true,
  bypassCSP: true,
});

const DELIVERY_HOST = "delivery";
const CAPABILITY_PATTERN = /^wrc_[A-Za-z0-9_-]{43}$/u;
const MAX_FORWARD_HEADER_BYTES = 4 * 1024;
const MAX_CAPABILITY_ATTEMPTS = 32;

export interface DesktopAssistantResourceRelay {
  prepare(request: {
    readonly generation: number;
    readonly binding: DesktopServerResourceBinding;
    readonly delivery: RemotePreparedResourceDelivery;
    readonly revoke: () => Promise<unknown>;
  }): PreparedResourceDelivery;
  release(request: {
    readonly generation: number;
    readonly delivery: Pick<PreparedResourceDelivery, "kind" | "url">;
  }): Promise<void>;
  retireGeneration(generation: number): Promise<void>;
  retireProfile(profileId: string): Promise<void>;
  handle(request: Request): Promise<Response>;
  close(): Promise<void>;
}

export interface DesktopAssistantResourceRelayOptions {
  readonly transport: DesktopServerResourceTransport;
  readonly now?: () => number;
  readonly createCapability?: () => string;
}

interface ResourceRelayEntry {
  readonly capability: string;
  readonly url: string;
  readonly generation: number;
  readonly binding: DesktopServerResourceBinding;
  readonly delivery: RemotePreparedResourceDelivery;
  readonly revoke: () => Promise<unknown>;
  readonly active: Set<AbortController>;
  retirement?: Promise<void>;
}

export interface DesktopResourceProtocol {
  handle(
    scheme: string,
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
  unhandle(scheme: string): void;
}

export function installDesktopResourceProtocol(
  protocol: DesktopResourceProtocol,
  relay: DesktopAssistantResourceRelay,
): () => void {
  protocol.handle(DESKTOP_RESOURCE_SCHEME, (request) => relay.handle(request));
  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    protocol.unhandle(DESKTOP_RESOURCE_SCHEME);
  };
}

export function createDesktopAssistantResourceRelay(
  options: DesktopAssistantResourceRelayOptions,
): DesktopAssistantResourceRelay {
  const now = options.now ?? Date.now;
  const createCapability = options.createCapability ?? defaultCapability;
  const entries = new Map<string, ResourceRelayEntry>();
  let closed = false;

  const relay: DesktopAssistantResourceRelay = {
    prepare(request) {
      assertOpen();
      validateGeneration(request.generation);
      validateDelivery(request.delivery, now());
      let capability: string | undefined;
      for (let attempt = 0; attempt < MAX_CAPABILITY_ATTEMPTS; attempt += 1) {
        const candidate = createCapability();
        if (CAPABILITY_PATTERN.test(candidate) && !entries.has(candidate)) {
          capability = candidate;
          break;
        }
      }
      if (capability === undefined) {
        throw new Error("Desktop Resource capability could not be allocated");
      }
      const url = `${DESKTOP_RESOURCE_SCHEME}://${DELIVERY_HOST}/${capability}`;
      entries.set(capability, {
        capability,
        url,
        generation: request.generation,
        binding: request.binding,
        delivery: request.delivery,
        revoke: request.revoke,
        active: new Set(),
      });
      return projectDelivery(request.delivery, url);
    },
    async release(request) {
      validateGeneration(request.generation);
      const capability = parseDeliveryUrl(request.delivery);
      const entry = entries.get(capability);
      if (entry === undefined) return;
      if (
        entry.generation !== request.generation ||
        entry.url !== request.delivery.url
      ) {
        throw new Error("Desktop Resource capability generation is stale");
      }
      await retire(entry);
    },
    async retireGeneration(generation) {
      validateGeneration(generation);
      await retireMatching((entry) => entry.generation === generation);
    },
    async retireProfile(profileId) {
      await retireMatching((entry) => entry.binding.profileId === profileId);
    },
    async handle(request) {
      if (closed) return emptyResponse(410);
      const parsed = parseProtocolRequest(request);
      if (parsed instanceof Response) return parsed;
      const entry = entries.get(parsed.capability);
      if (entry === undefined || entry.url !== parsed.url) {
        return emptyResponse(404);
      }
      const selected = entry;
      if (selected.delivery.expiresAt <= now()) {
        void retire(selected).catch(() => undefined);
        return emptyResponse(410);
      }
      const abort = new AbortController();
      selected.active.add(abort);
      const onRequestAbort = (): void => abort.abort();
      request.signal.addEventListener("abort", onRequestAbort, { once: true });
      try {
        const remote = await options.transport.open({
          binding: selected.binding,
          grant: selected.delivery.token,
          method: parsed.method,
          ...(parsed.range === undefined ? {} : { range: parsed.range }),
          ...(parsed.ifNoneMatch === undefined
            ? {}
            : { ifNoneMatch: parsed.ifNoneMatch }),
          signal: abort.signal,
        });
        return await projectRemoteResponse({
          requestMethod: parsed.method,
          remote,
          entry: selected,
          abort,
          finish,
        });
      } catch {
        finish();
        return emptyResponse(abort.signal.aborted ? 410 : 502);
      }

      function finish(): void {
        request.signal.removeEventListener("abort", onRequestAbort);
        selected.active.delete(abort);
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      await retireMatching(() => true);
    },
  };
  return Object.freeze(relay);

  async function retireMatching(
    predicate: (entry: ResourceRelayEntry) => boolean,
  ): Promise<void> {
    const selected = [...entries.values()].filter(predicate);
    await Promise.all(selected.map(retire));
  }

  async function retire(entry: ResourceRelayEntry): Promise<void> {
    if (entry.retirement !== undefined) return await entry.retirement;
    entries.delete(entry.capability);
    for (const active of entry.active) active.abort();
    entry.active.clear();
    entry.retirement = Promise.resolve(entry.revoke()).then(
      () => undefined,
      () => undefined,
    );
    return await entry.retirement;
  }

  function assertOpen(): void {
    if (closed) throw new Error("Desktop Resource relay is closed");
  }
}

function parseProtocolRequest(request: Request):
  | {
      readonly capability: string;
      readonly url: string;
      readonly method: "GET" | "HEAD";
      readonly range?: string;
      readonly ifNoneMatch?: string;
    }
  | Response {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return emptyResponse(400);
  }
  if (
    url.protocol !== `${DESKTOP_RESOURCE_SCHEME}:` ||
    url.hostname !== DELIVERY_HOST ||
    url.port.length !== 0 ||
    url.username.length !== 0 ||
    url.password.length !== 0 ||
    url.search.length !== 0 ||
    url.hash.length !== 0
  ) return emptyResponse(400);
  const capability = url.pathname.slice(1);
  if (
    url.pathname !== `/${capability}` ||
    !CAPABILITY_PATTERN.test(capability)
  ) return emptyResponse(400);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return emptyResponse(405, { allow: "GET, HEAD" });
  }
  const range = boundedHeader(request.headers.get("range"));
  const ifNoneMatch = boundedHeader(request.headers.get("if-none-match"));
  if (range === null || ifNoneMatch === null) return emptyResponse(400);
  return {
    capability,
    url: url.toString(),
    method: request.method,
    ...(range === undefined ? {} : { range }),
    ...(ifNoneMatch === undefined ? {} : { ifNoneMatch }),
  };
}

async function projectRemoteResponse(request: {
  readonly requestMethod: "GET" | "HEAD";
  readonly remote: Response;
  readonly entry: ResourceRelayEntry;
  readonly abort: AbortController;
  readonly finish: () => void;
}): Promise<Response> {
  const { remote, entry } = request;
  if (remote.status === 416) {
    request.finish();
    await remote.body?.cancel().catch(() => undefined);
    const contentRange = remote.headers.get("content-range");
    return emptyResponse(
      416,
      contentRange === `bytes */${entry.delivery.sizeBytes}`
        ? { "content-range": contentRange }
        : undefined,
    );
  }
  if (![200, 206, 304].includes(remote.status)) {
    request.finish();
    await remote.body?.cancel().catch(() => undefined);
    return emptyResponse(remote.status === 404 || remote.status === 410 ? 410 : 502);
  }
  const expectedEtag = `"sha256-${entry.delivery.sha256}"`;
  const expectedDigest = `sha-256=${Buffer.from(
    entry.delivery.sha256,
    "hex",
  ).toString("base64")}`;
  if (
    remote.headers.get("content-type") !== entry.delivery.mediaType ||
    remote.headers.get("etag") !== expectedEtag ||
    remote.headers.get("digest") !== expectedDigest
  ) {
    request.finish();
    await remote.body?.cancel().catch(() => undefined);
    return emptyResponse(502);
  }
  const headers = securityHeaders();
  headers.set("accept-ranges", "bytes");
  headers.set("content-type", entry.delivery.mediaType);
  headers.set("etag", expectedEtag);
  headers.set("digest", expectedDigest);
  if (remote.status === 304) {
    request.finish();
    await remote.body?.cancel().catch(() => undefined);
    return new Response(null, { status: 304, headers });
  }
  const contentLength = parseContentLength(remote.headers.get("content-length"));
  if (
    contentLength === undefined ||
    (remote.status === 200 && contentLength !== entry.delivery.sizeBytes) ||
    (remote.status === 206 && contentLength > entry.delivery.sizeBytes)
  ) {
    request.finish();
    await remote.body?.cancel().catch(() => undefined);
    return emptyResponse(502);
  }
  headers.set("content-length", String(contentLength));
  if (remote.status === 206) {
    const contentRange = remote.headers.get("content-range");
    if (!validContentRange(contentRange, contentLength, entry.delivery.sizeBytes)) {
      request.finish();
      await remote.body?.cancel().catch(() => undefined);
      return emptyResponse(502);
    }
    headers.set("content-range", contentRange);
  }
  if (request.requestMethod === "HEAD") {
    request.finish();
    await remote.body?.cancel().catch(() => undefined);
    return new Response(null, { status: remote.status, headers });
  }
  if (remote.body === null) {
    request.finish();
    return emptyResponse(502);
  }
  const reader = remote.body.getReader();
  let delivered = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          if (delivered !== contentLength) {
            controller.error(new Error("Server Resource body length is invalid"));
          } else {
            controller.close();
          }
          request.finish();
          return;
        }
        delivered += chunk.value.byteLength;
        if (delivered > contentLength) {
          request.abort.abort();
          controller.error(new Error("Server Resource body exceeds its evidence"));
          request.finish();
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
        request.finish();
      }
    },
    async cancel(reason) {
      request.abort.abort();
      try {
        await reader.cancel(reason);
      } finally {
        request.finish();
      }
    },
  });
  return new Response(body, { status: remote.status, headers });
}

function parseDeliveryUrl(
  delivery: Pick<PreparedResourceDelivery, "kind" | "url">,
): string {
  if (delivery.kind !== "web.resource-delivery") {
    throw new Error("Desktop Resource delivery kind is invalid");
  }
  const parsed = parseProtocolRequest(new Request(delivery.url));
  if (parsed instanceof Response) {
    throw new Error("Desktop Resource delivery URL is invalid");
  }
  return parsed.capability;
}

function projectDelivery(
  delivery: RemotePreparedResourceDelivery,
  url: string,
): PreparedResourceDelivery {
  return {
    kind: "web.resource-delivery",
    url,
    resourceId: delivery.resourceId,
    sha256: delivery.sha256,
    resourceKind: delivery.resourceKind,
    mediaType: delivery.mediaType,
    sizeBytes: delivery.sizeBytes,
    purpose: delivery.purpose,
    ...(delivery.sessionId === undefined
      ? {}
      : { sessionId: delivery.sessionId }),
    expiresAt: delivery.expiresAt,
  };
}

function validateDelivery(
  delivery: RemotePreparedResourceDelivery,
  now: number,
): void {
  if (
    delivery.kind !== "assistant-host.resource-delivery" ||
    !/^wrd_[A-Za-z0-9_-]{43}$/u.test(delivery.token) ||
    typeof delivery.resourceId !== "string" ||
    delivery.resourceId.length === 0 ||
    !/^[a-f0-9]{64}$/u.test(delivery.sha256) ||
    (delivery.resourceKind !== "image" &&
      delivery.resourceKind !== "audio" &&
      delivery.resourceKind !== "video") ||
    typeof delivery.mediaType !== "string" ||
    delivery.mediaType.length === 0 ||
    !Number.isSafeInteger(delivery.sizeBytes) ||
    delivery.sizeBytes <= 0 ||
    (delivery.purpose !== "preview" && delivery.purpose !== "media") ||
    !Number.isSafeInteger(delivery.expiresAt) ||
    delivery.expiresAt <= now ||
    (delivery.sessionId !== undefined &&
      (typeof delivery.sessionId !== "string" || delivery.sessionId.length === 0))
  ) throw new Error("Remote Resource delivery evidence is invalid");
}

function validateGeneration(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Desktop Resource generation is invalid");
  }
}

function boundedHeader(value: string | null): string | undefined | null {
  if (value === null) return undefined;
  return value.length > 0 && Buffer.byteLength(value, "utf8") <= MAX_FORWARD_HEADER_BYTES
    ? value
    : null;
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function validContentRange(
  value: string | null,
  contentLength: number,
  totalSize: number,
): value is string {
  const match = /^bytes ([0-9]+)-([0-9]+)\/([0-9]+)$/u.exec(value ?? "");
  if (match === null) return false;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) &&
    Number.isSafeInteger(total) && start >= 0 && end >= start &&
    total === totalSize && end - start + 1 === contentLength && end < total;
}

function securityHeaders(): Headers {
  return new Headers({
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
}

function emptyResponse(
  status: number,
  additional?: Readonly<Record<string, string>>,
): Response {
  const headers = securityHeaders();
  for (const [name, value] of Object.entries(additional ?? {})) {
    headers.set(name, value);
  }
  return new Response(null, { status, headers });
}

function defaultCapability(): string {
  return `wrc_${randomBytes(32).toString("base64url")}`;
}
