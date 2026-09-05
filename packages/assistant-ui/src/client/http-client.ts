import type {
  Action,
  Request,
  ApplicationResponse,
} from "../application/model.js";
import type {
  AttachmentUploadResult,
  CapabilitySetupResult,
  Client,
  ClientEvent,
  ModelCatalogRefreshResult,
  McpCredentialSetupResult,
  McpSaveServerRequest,
  McpServerList,
  McpServerMutationResult,
  McpSettingsClient,
  McpSettingsResultBase,
  PreparedResourceDelivery,
  ProviderList,
  ProviderMutationResult,
  SaveProviderRequest,
} from "./contracts.js";

export interface HttpClientOptions {
  readonly requestPath: string;
  readonly eventStreamPath?: string;
  readonly attachmentPath?: string;
  readonly resourceDeliveryPreparePath?: string;
  readonly providerManagementPath?: string;
  readonly modelCatalogRefreshPath?: string;
  readonly capabilitySetupPath?: string;
  readonly mcpSettingsPath?: string;
  readonly hostSessionToken: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createHttpClient(
  options: HttpClientOptions,
): Client {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (fetchImpl === undefined) {
    throw new Error("Web client requires fetch");
  }
  const listeners = new Set<(event: ClientEvent) => void>();
  const activeResourceDeliveryUrls = new Set<string>();
  let streamStarted = false;
  let streamAbort: AbortController | undefined;
  let streamId: string | undefined;
  let lastSequence: number | undefined;

  const mcpSettings = options.mcpSettingsPath === undefined
    ? undefined
    : createMcpSettingsClient(options.mcpSettingsPath);

  const client: Client = {
    async readSnapshot() {
      const response = await sendRequest({
        kind: "web.request",
        operation: "refresh",
      });
      if (!response.ok) throw new Error(response.error.message);
      if (response.operation === "dispatchAction") {
        throw new Error("The host returned an action response for a snapshot read");
      }
      adoptSnapshotCursor(response.snapshot);
      return response.snapshot;
    },
    async dispatchAction(action, dispatchOptions) {
      const response = await sendRequest({
        kind: "web.request",
        operation: "dispatchAction",
        ...(dispatchOptions?.requestId === undefined
          ? {}
          : { requestId: dispatchOptions.requestId }),
        action,
      });
      if (!response.ok) {
        adoptSnapshotCursor(response.snapshot);
        return {
          ok: false,
          action: action.type,
          message: response.error.message,
          snapshot: response.snapshot,
        };
      }
      if (response.operation !== "dispatchAction") {
        adoptSnapshotCursor(response.snapshot);
        return {
          ok: false,
          action: action.type,
          message: "The host returned a non-action response",
          snapshot: response.snapshot,
        };
      }
      adoptSnapshotCursor(response.actionResult.snapshot);
      return response.actionResult;
    },
    async uploadAttachment(request): Promise<AttachmentUploadResult> {
      const path = requiredHostPath(options.attachmentPath, "attachment upload");
      const response = await fetchImpl(path, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/octet-stream",
          "x-wanex-host-session": options.hostSessionToken,
          "x-wanex-media-type": encodeURIComponent(request.mediaType),
          ...(request.kind === undefined
            ? {}
            : { "x-wanex-resource-kind": encodeURIComponent(request.kind) }),
          ...(request.label === undefined
            ? {}
            : { "x-wanex-attachment-label": encodeURIComponent(request.label) }),
          ...(request.sessionId === undefined
            ? {}
            : { "x-wanex-session-id": encodeURIComponent(request.sessionId) }),
        },
        body: request.content as BodyInit,
      });
      const payload = await readHostJson<AttachmentUploadPayload>(response);
      if (
        !response.ok ||
        payload.ok !== true ||
        payload.upload === undefined ||
        payload.snapshot === undefined
      ) {
        throw hostResponseError(payload, response, "Attachment upload failed");
      }
      adoptSnapshotCursor(payload.snapshot);
      return {
        kind: "web.attachment-uploaded",
        attachment: payload.upload.attachment,
        attachments: payload.upload.attachments,
        snapshot: payload.snapshot,
      };
    },
    async prepareResourceDelivery(request): Promise<PreparedResourceDelivery> {
      const path = requiredHostPath(
        options.resourceDeliveryPreparePath,
        "resource delivery",
      );
      const response = await fetchImpl(path, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-wanex-host-session": options.hostSessionToken,
        },
        body: JSON.stringify(request),
      });
      const payload = await readHostJson<ResourceDeliveryPreparePayload>(response);
      if (!response.ok || payload.ok !== true || payload.delivery === undefined) {
        throw hostResponseError(payload, response, "Resource delivery prepare failed");
      }
      const delivery = validatePreparedResourceDelivery(payload.delivery, request);
      activeResourceDeliveryUrls.add(delivery.url);
      return delivery;
    },
    async releaseResourceDelivery(delivery): Promise<void> {
      if (delivery.kind !== "web.resource-delivery") {
      throw new Error("Resource delivery release is invalid");
      }
      if (!activeResourceDeliveryUrls.delete(delivery.url)) return;
      const response = await fetchImpl(delivery.url, {
        method: "DELETE",
        headers: {
          "x-wanex-host-session": options.hostSessionToken,
        },
      });
      if (!response.ok) {
        const payload = await readHostJson<HostPayload>(response);
        throw hostResponseError(payload, response, "Resource delivery release failed");
      }
    },
    async listProviders(): Promise<ProviderList> {
      const path = requiredHostPath(options.providerManagementPath, "Provider management");
      const response = await sendHostJson(path, "GET");
      const payload = await readHostJson<ProviderListPayload>(response);
      if (!response.ok || payload.ok !== true || payload.providers === undefined) {
        throw hostResponseError(payload, response, "Provider list failed");
      }
      return payload.providers;
    },
    async saveProvider(request): Promise<ProviderMutationResult> {
      return await mutateProvider("POST", request);
    },
    async removeProvider(request): Promise<ProviderMutationResult> {
      return await mutateProvider("DELETE", request);
    },
    async refreshModelCatalog(): Promise<ModelCatalogRefreshResult> {
      const path = requiredHostPath(options.modelCatalogRefreshPath, "model catalog refresh");
      const response = await sendHostJson(path, "POST", {});
      const payload = await readHostJson<ModelCatalogRefreshPayload>(response);
      if (
        !response.ok ||
        payload.ok !== true ||
        payload.refresh?.kind !== "assistant-host.model-catalog.refreshed" ||
        payload.suggestions === undefined
      ) {
        throw hostResponseError(payload, response, "Model catalog refresh failed");
      }
      return {
        kind: "web.model-catalog-refreshed",
        revision: payload.refresh.revision,
        providerCount: payload.refresh.providerCount,
        modelCount: payload.refresh.modelCount,
        suggestions: payload.suggestions.providers,
      };
    },
    async setupImageGenerationAndContinue(request): Promise<CapabilitySetupResult> {
      const path = requiredHostPath(options.capabilitySetupPath, "capability setup");
      const response = await sendHostJson(path, "POST", request);
      const payload = await readHostJson<CapabilitySetupPayload>(response);
      if (!response.ok || payload.ok !== true || payload.snapshot === undefined) {
        throw hostResponseError(payload, response, "Capability setup failed");
      }
      adoptSnapshotCursor(payload.snapshot);
      return {
        kind: "web.capability-setup",
        snapshot: payload.snapshot,
      };
    },
    ...(mcpSettings === undefined ? {} : { mcpSettings }),
    subscribe(listener) {
      listeners.add(listener);
      if (!streamStarted && options.eventStreamPath !== undefined) {
        streamStarted = true;
        streamAbort = new AbortController();
        void consumeEventStream(options.eventStreamPath);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          streamAbort?.abort();
          streamAbort = undefined;
          streamStarted = false;
        }
      };
    },
  };

  async function mutateProvider(
    method: "POST" | "DELETE",
    request:
      | SaveProviderRequest
      | { readonly connectionId: string },
  ): Promise<ProviderMutationResult> {
    const path = requiredHostPath(options.providerManagementPath, "Provider management");
    const response = await sendHostJson(path, method, request);
    const payload = await readHostJson<ProviderMutationPayload>(response);
    if (
      !response.ok ||
      payload.ok !== true ||
      payload.providers === undefined ||
      payload.snapshot === undefined
    ) {
      throw hostResponseError(payload, response, "Provider mutation failed");
    }
    adoptSnapshotCursor(payload.snapshot);
    return {
      kind: "web.provider-mutated",
      providers: payload.providers,
      snapshot: payload.snapshot,
    };
  }

  function createMcpSettingsClient(path: string): McpSettingsClient {
    return {
      async listServers() {
        const response = await sendHostJson(path, "GET");
        const payload = await readHostJson<McpServerListPayload>(response);
        if (!response.ok || payload.ok !== true ||
          !validMcpServerList(payload.servers)) {
          throw hostResponseError(payload, response, "MCP server list failed");
        }
        return payload.servers;
      },
      async stageCredential(request) {
        return await sendMcpCommand<McpCredentialSetupResult>(
          path,
          "stage-credential",
          request,
          (value): value is McpCredentialSetupResult =>
            isRecord(value) &&
            value.kind === "assistant-host.mcp-credential-setup" &&
            typeof value.setupId === "string" &&
            Number.isSafeInteger(value.expiresAt),
        );
      },
      async saveServer(request: McpSaveServerRequest) {
        return await sendMcpCommand<McpServerMutationResult>(
          path,
          "save-server",
          request,
          validMcpMutationResult,
        );
      },
      async updateServer(request) {
        return await sendMcpCommand<McpServerMutationResult>(
          path,
          "update-server",
          request,
          validMcpMutationResult,
        );
      },
      async setServerEnabled(request) {
        return await sendMcpCommand<McpServerMutationResult>(
          path,
          "set-server-enabled",
          request,
          validMcpMutationResult,
        );
      },
      async removeServer(request) {
        return await sendMcpCommand<McpServerMutationResult>(
          path,
          "remove-server",
          request,
          validMcpMutationResult,
        );
      },
      async reloadServers(request = {}) {
        return await sendMcpCommand<McpSettingsResultBase>(
          path,
          "reload-servers",
          request,
          validMcpSettingsResult,
        );
      },
    };
  }

  async function sendMcpCommand<T>(
    path: string,
    operation: string,
    request: unknown,
    validate: (value: unknown) => value is T,
  ): Promise<T> {
    const response = await sendHostJson(path, "POST", { operation, request });
    const payload = await readHostJson<McpCommandPayload>(response);
    if (!response.ok || payload.ok !== true ||
      payload.operation !== operation || !validate(payload.result)) {
      throw hostResponseError(payload, response, "MCP settings operation failed");
    }
    return payload.result;
  }

  async function sendHostJson(
    path: string,
    method: "GET" | "POST" | "DELETE",
    body?: unknown,
  ): Promise<Response> {
    return await fetchImpl(path, {
      method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-wanex-host-session": options.hostSessionToken,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function sendRequest(
    request: Request,
  ): Promise<ApplicationResponse> {
    const response = await fetchImpl(options.requestPath, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-wanex-host-session": options.hostSessionToken,
      },
      body: JSON.stringify({
        ...request,
        requestId: request.requestId ?? createRendererRequestId(),
      }),
    });
    const payload = (await response.json()) as ApplicationResponse;
    if (!response.ok && payload.ok) {
      throw new Error(`Request failed with HTTP ${response.status}`);
    }
    return payload;
  }

  async function consumeEventStream(path: string): Promise<void> {
    try {
      const abort = streamAbort;
      const response = await fetchImpl(path, {
        headers: {
          accept: "text/event-stream",
          "cache-control": "no-store",
          "x-wanex-host-session": options.hostSessionToken,
          ...(streamId === undefined || lastSequence === undefined
            ? {}
            : { "last-event-id": `${streamId}:${lastSequence}` }),
        },
        ...(abort === undefined ? {} : { signal: abort.signal }),
      });
      if (!response.ok || response.body === null) {
      throw new Error(`Live updates failed with HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = splitFrames(buffer);
        buffer = frames.remaining;
        for (const frame of frames.frames) emitFrame(frame);
      }
      buffer += decoder.decode();
      for (const frame of splitFrames(buffer).frames) emitFrame(frame);
      emit({ kind: "stream-unavailable" });
    } catch (error) {
      if (isAbortError(error)) return;
      emit({ kind: "stream-unavailable" });
    }
  }

  function emitFrame(frame: string): void {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data.length === 0) return;
    try {
      const payload = JSON.parse(data) as SurfaceStreamPayload;
      if (payload.kind === "assistant.surface-stream.reset") {
        if (validCursor(payload.streamId, payload.latestSequence)) {
          streamId = payload.streamId;
          lastSequence = payload.latestSequence;
        }
        emit({ kind: "snapshot-invalidated" });
        return;
      }
      const event = payload.event;
      if (
        payload.kind !== "assistant.surface-stream.event" ||
        payload.streamId === undefined ||
        event === undefined ||
        event.sequence === undefined ||
        !validCursor(payload.streamId, event.sequence)
      ) {
        emit({ kind: "snapshot-invalidated" });
        return;
      }
      const admission = admitStreamSequence(payload.streamId, event.sequence);
      if (admission === "covered") return;
      if (admission === "gap") {
        emit({ kind: "snapshot-invalidated" });
        return;
      }
      if (event?.type === "assistant.surface.conversation.assistant-text-delta") {
        if (
          event.conversation?.operationId === undefined ||
          event.conversation.sessionId === undefined ||
          event.conversation.text === undefined
        ) {
          emit({ kind: "snapshot-invalidated" });
          return;
        }
        emit({
          kind: "assistant-text-delta",
          operationId: event.conversation.operationId,
          sessionId: event.conversation.sessionId,
          text: event.conversation.text,
          sequence: event.sequence,
        });
        return;
      }
      if (event?.type === "assistant.surface.conversation.operation-invalidated") {
        emit({
          kind: "snapshot-invalidated",
          ...(event.conversation?.operationId === undefined
            ? {}
            : { operationId: event.conversation.operationId }),
          ...(event.conversation?.sessionId === undefined
            ? {}
            : { sessionId: event.conversation.sessionId }),
        });
        return;
      }
      if (surfaceEventInvalidatesSnapshot(event.type)) {
        emit({ kind: "snapshot-invalidated" });
      }
    } catch {
      emit({ kind: "snapshot-invalidated" });
    }
  }

  function emit(event: ClientEvent): void {
    for (const listener of listeners) listener(event);
  }

  function adoptSnapshotCursor(snapshot: {
    readonly eventStreamId?: string;
    readonly eventCursor: number;
  }): void {
    if (snapshot.eventStreamId === undefined) return;
    if (streamId === snapshot.eventStreamId && lastSequence !== undefined) {
      lastSequence = Math.max(lastSequence, snapshot.eventCursor);
      return;
    }
    streamId = snapshot.eventStreamId;
    lastSequence = snapshot.eventCursor;
  }

  function admitStreamSequence(
    nextStreamId: string,
    sequence: number,
  ): "admit" | "covered" | "gap" {
    if (streamId === undefined || lastSequence === undefined) {
      streamId = nextStreamId;
      lastSequence = sequence;
      return "admit";
    }
    if (nextStreamId !== streamId) return "gap";
    if (sequence <= lastSequence) return "covered";
    if (sequence !== lastSequence + 1) return "gap";
    lastSequence = sequence;
    return "admit";
  }

  return client;
}

function requiredHostPath(path: string | undefined, capability: string): string {
  if (path === undefined || path.length === 0) {
    throw new Error(`${capability} is unavailable in this host`);
  }
  return path;
}

function validatePreparedResourceDelivery(
  delivery: PreparedResourceDelivery,
  request: {
    readonly resourceId: string;
    readonly sha256: string;
    readonly purpose: "preview" | "media";
    readonly sessionId?: string;
  },
): PreparedResourceDelivery {
  if (
    delivery.kind !== "web.resource-delivery" ||
    delivery.resourceId !== request.resourceId ||
    delivery.sha256 !== request.sha256 ||
    delivery.purpose !== request.purpose ||
    delivery.sessionId !== request.sessionId ||
    !isScopedHostPath(delivery.url) ||
    !Number.isSafeInteger(delivery.expiresAt) ||
    delivery.expiresAt <= 0
  ) {
    throw new Error("Resource delivery response is invalid");
  }
  return delivery;
}

function isScopedHostPath(value: string): boolean {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2_048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) return false;
  try {
    const parsed = new URL(value, "http://wanex.invalid");
    return parsed.origin === "http://wanex.invalid" && parsed.hash.length === 0;
  } catch {
    return false;
  }
}

async function readHostJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    return {
      ok: false,
      error: { message: `Host returned HTTP ${response.status}` },
    } as T;
  }
}

function hostResponseError(
  payload: HostPayload,
  response: Response,
  fallback: string,
): Error {
  return new Error(payload.error?.message ?? `${fallback} with HTTP ${response.status}`);
}

interface HostPayload {
  readonly ok?: boolean;
  readonly error?: { readonly message?: string };
}

interface AttachmentUploadPayload extends HostPayload {
  readonly upload?: {
    readonly attachment: AttachmentUploadResult["attachment"];
    readonly attachments: AttachmentUploadResult["attachments"];
  };
  readonly snapshot?: AttachmentUploadResult["snapshot"];
}

interface ProviderListPayload extends HostPayload {
  readonly providers?: ProviderList;
}

interface ProviderMutationPayload extends HostPayload {
  readonly providers?: ProviderList;
  readonly snapshot?: ProviderMutationResult["snapshot"];
}

interface ModelCatalogRefreshPayload extends HostPayload {
  readonly refresh?: {
    readonly kind?: string;
    readonly revision: string;
    readonly providerCount: number;
    readonly modelCount: number;
  };
  readonly suggestions?: {
    readonly providers: Readonly<Record<string, readonly string[]>>;
  };
}

interface CapabilitySetupPayload extends HostPayload {
  readonly snapshot?: CapabilitySetupResult["snapshot"];
}

interface McpServerListPayload extends HostPayload {
  readonly servers?: unknown;
}

interface McpCommandPayload extends HostPayload {
  readonly operation?: string;
  readonly result?: unknown;
}

interface ResourceDeliveryPreparePayload extends HostPayload {
  readonly delivery?: PreparedResourceDelivery;
}

interface SurfaceStreamPayload {
  readonly kind?: string;
  readonly streamId?: string;
  readonly latestSequence?: number;
  readonly event?: {
    readonly type?: string;
    readonly sequence?: number;
    readonly conversation?: {
      readonly operationId?: string;
      readonly sessionId?: string;
      readonly text?: string;
    };
  };
}

function validCursor(
  streamId: string | undefined,
  sequence: number | undefined,
): streamId is string {
  return streamId !== undefined &&
    /^[A-Za-z0-9._-]{1,200}$/.test(streamId) &&
    Number.isSafeInteger(sequence) &&
    (sequence ?? -1) >= 0;
}

function surfaceEventInvalidatesSnapshot(type: string | undefined): boolean {
  return type === "assistant.surface.state_changed" ||
    type === "assistant.surface.command-catalog.invalidated" ||
    type === "assistant.surface.command-execution.invalidated" ||
    type === "assistant.surface.conversation.operation-invalidated" ||
    type === "assistant.surface.side-query.invalidated" ||
    type === "assistant.surface.plan.invalidated" ||
    type === "assistant.surface.goal.invalidated" ||
    type === "assistant.surface.team.invalidated";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function createRendererRequestId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid === undefined) {
    throw new Error("The browser client requires crypto.randomUUID");
  }
  return randomUuid.call(globalThis.crypto);
}

function splitFrames(input: string): {
  readonly frames: readonly string[];
  readonly remaining: string;
} {
  const frames: string[] = [];
  let remaining = input;
  for (;;) {
    const match = /\r?\n\r?\n/.exec(remaining);
    if (match === null || match.index === undefined) break;
    frames.push(remaining.slice(0, match.index));
    remaining = remaining.slice(match.index + match[0].length);
  }
  return { frames, remaining };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validMcpServerList(value: unknown): value is McpServerList {
  if (!isRecord(value) || value.kind !== "assistant-host.mcp-servers" ||
    !Array.isArray(value.servers)) return false;
  return value.servers.every((server) =>
    isRecord(server) &&
    typeof server.configurationState === "string" &&
    typeof server.runtimeState === "string" &&
    Number.isSafeInteger(server.toolCount) &&
    !Object.hasOwn(server, "command") &&
    !Object.hasOwn(server, "cwd") &&
    !Object.hasOwn(server, "headers") &&
    !Object.hasOwn(server, "environment") &&
    !Object.hasOwn(server, "secretRef")
  );
}

function validMcpSettingsResult(value: unknown): value is McpSettingsResultBase {
  return isRecord(value) &&
    (value.reloadOutcome === "unchanged" ||
      value.reloadOutcome === "published" ||
      value.reloadOutcome === "rejected" ||
      value.reloadOutcome === "failed") &&
    validMcpServerList(value.servers);
}

function validMcpMutationResult(value: unknown): value is McpServerMutationResult {
  if (!validMcpSettingsResult(value)) return false;
  const record = value as unknown as Readonly<Record<string, unknown>>;
  if ((record.kind !== "applied" && record.kind !== "conflict") ||
    typeof record.serverId !== "string") return false;
  return record.kind === "applied" ||
    (Number.isSafeInteger(record.expectedRevision) ||
      record.expectedRevision === null) &&
    (Number.isSafeInteger(record.currentRevision) || record.currentRevision === null);
}
