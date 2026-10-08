import type { AssistantAgentHostClient } from "@wanex/assistant-host";
import {
  createController,
  parseRequest,
  projectSurfaceEvent,
  type ActionResult,
  type Controller,
  type Snapshot,
} from "@wanex/assistant-ui";
import type {
  AttachmentUploadRequest,
  AttachmentUploadResult,
  ClientEvent,
  PreparedResourceDelivery,
} from "@wanex/assistant-ui/client";
import type {
  DesktopServerAssistantConnection,
  DesktopServerConnectionEvent,
  DesktopServerConnectionManager,
} from "../server/connection-manager.js";
import type {
  DesktopAssistantActivation,
  DesktopAssistantEvent,
  DesktopAssistantLocalActivation,
} from "./bridge.js";
import type { DesktopAssistantResourceRelay } from "./resource-relay.js";
import type { DesktopServerAttachmentTransport } from "../server/attachment-transport.js";

export interface DesktopAssistantLocationOwner {
  readonly generation: number;
  readState(): Promise<DesktopAssistantActivation | DesktopAssistantLocalActivation>;
  activateServer(request: {
    readonly expectedGeneration: number;
    readonly profileId: string;
  }): Promise<DesktopAssistantActivation>;
  activateLocal(request: {
    readonly expectedGeneration: number;
  }): Promise<DesktopAssistantLocalActivation>;
  readSnapshot(generation: number): Promise<Snapshot>;
  dispatchAction(request: {
    readonly generation: number;
    readonly action: unknown;
    readonly requestId?: string;
  }): Promise<ActionResult>;
  uploadAttachment(request: AttachmentUploadRequest & {
    readonly generation: number;
  }): Promise<AttachmentUploadResult>;
  prepareResourceDelivery(request: {
    readonly generation: number;
    readonly resourceId: string;
    readonly sha256: string;
    readonly purpose: "preview" | "media";
    readonly sessionId?: string;
  }): Promise<PreparedResourceDelivery>;
  releaseResourceDelivery(request: {
    readonly generation: number;
    readonly delivery: Pick<PreparedResourceDelivery, "kind" | "url">;
  }): Promise<void>;
  subscribe(listener: (event: DesktopAssistantEvent) => void): () => void;
  close(): Promise<void>;
}

export interface DesktopAssistantLocationOwnerOptions {
  readonly connections: DesktopServerConnectionManager;
  readonly attachmentTransport: DesktopServerAttachmentTransport;
  readonly createController?: typeof createController;
  readonly resourceRelay: DesktopAssistantResourceRelay;
}

interface ActiveRemoteAssistant {
  readonly generation: number;
  readonly profileId: string;
  readonly name: string;
  readonly connection: DesktopServerAssistantConnection;
  readonly controller: Controller;
  readonly removeSurfaceListener: () => void;
  readonly removeConnectionListener: () => void;
  readonly uploadControllers: Set<AbortController>;
  resumePromise: Promise<void> | undefined;
}

type AssistantSurfaceEvent = Parameters<
  Parameters<AssistantAgentHostClient["subscribeSurfaceEvents"]>[0]
>[0];

const MAX_CANDIDATE_EVENTS = 256;

export function createDesktopAssistantLocationOwner(
  options: DesktopAssistantLocationOwnerOptions,
): DesktopAssistantLocationOwner {
  const createUiController = options.createController ?? createController;
  const listeners = new Set<(event: DesktopAssistantEvent) => void>();
  let generation = 0;
  let activationRevision = 0;
  let active: ActiveRemoteAssistant | undefined;
  let closed = false;

  return Object.freeze({
    get generation() {
      return generation;
    },
    async readState(): Promise<
      DesktopAssistantActivation | DesktopAssistantLocalActivation
    > {
      assertOpen();
      if (active === undefined) {
        return { generation, location: { kind: "local" } };
      }
      const selected = active;
      await resumeEventsIfUnavailable(selected);
      requireSameActive(selected);
      const snapshot = await selected.controller.refresh();
      requireSameActive(selected);
      return {
        generation,
        location: {
          kind: "server",
          profileId: selected.profileId,
          name: selected.name,
        },
        snapshot,
      };
    },
    activateServer,
    activateLocal,
    readSnapshot,
    dispatchAction,
    uploadAttachment,
    prepareResourceDelivery,
    releaseResourceDelivery,
    subscribe(listener: (event: DesktopAssistantEvent) => void) {
      assertOpen();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      if (closed) return;
      closed = true;
      activationRevision += 1;
      retire(active);
      active = undefined;
      listeners.clear();
      await options.resourceRelay.close();
    },
  });

  async function activateServer(request: {
    readonly expectedGeneration: number;
    readonly profileId: string;
  }): Promise<DesktopAssistantActivation> {
    assertOpen();
    assertExpectedGeneration(request.expectedGeneration);
    const revision = ++activationRevision;
    const connection = await options.connections.connectAssistant(request.profileId);
    const client = connection.client;
    if (client === undefined) throw new Error("Server Assistant is unavailable");

    const queuedEvents: AssistantSurfaceEvent[] = [];
    let candidateNeedsCanonicalRead = false;
    let candidateActive = false;
    let candidateGeneration = -1;
    const removeSurfaceListener = client.subscribeSurfaceEvents((event) => {
      if (!candidateActive) {
        if (queuedEvents.length >= MAX_CANDIDATE_EVENTS) {
          queuedEvents.shift();
          candidateNeedsCanonicalRead = true;
        }
        queuedEvents.push(event);
        return;
      }
      emitProjected(candidateGeneration, event);
    });
    const removeConnectionListener = connection.subscribe((event) => {
      if (!candidateActive) {
        if (event.kind === "canonical-read-required") {
          candidateNeedsCanonicalRead = true;
        }
        return;
      }
      handleConnectionEvent(candidateGeneration, connection, event);
    });

    try {
      const controller = await createUiController({
        client,
        attachmentUploadAvailable: true,
      });
      if (candidateNeedsCanonicalRead) {
        queuedEvents.length = 0;
        candidateNeedsCanonicalRead = false;
        await controller.refresh();
        if (candidateNeedsCanonicalRead) {
          throw new Error("Assistant location changed too quickly to activate");
        }
      }
      assertCandidateCurrent(revision, request.expectedGeneration);
      const nextGeneration = generation + 1;
      candidateGeneration = nextGeneration;
      candidateActive = true;
      const previous = active;
      active = {
        generation: nextGeneration,
        profileId: request.profileId,
        name: connection.profile.name,
        connection,
        controller,
        removeSurfaceListener,
        removeConnectionListener,
        uploadControllers: new Set(),
        resumePromise: undefined,
      };
      generation = nextGeneration;
      retire(previous);
      if (previous !== undefined) {
        await options.resourceRelay.retireGeneration(previous.generation);
      }
      for (const event of queuedEvents) {
        if (event.sequence > controller.snapshot().eventCursor) {
          emitProjected(nextGeneration, event);
        }
      }
      return {
        generation: nextGeneration,
        location: {
          kind: "server",
          profileId: connection.profile.profileId,
          name: connection.profile.name,
        },
        snapshot: controller.snapshot(),
      };
    } catch (error) {
      removeSurfaceListener();
      removeConnectionListener();
      throw error;
    }
  }

  async function activateLocal(request: {
    readonly expectedGeneration: number;
  }): Promise<DesktopAssistantLocalActivation> {
    assertOpen();
    assertExpectedGeneration(request.expectedGeneration);
    activationRevision += 1;
    const previous = active;
    active = undefined;
    generation += 1;
    retire(previous);
    if (previous !== undefined) {
      await options.resourceRelay.retireGeneration(previous.generation);
    }
    return { generation, location: { kind: "local" } };
  }

  async function readSnapshot(requestGeneration: number): Promise<Snapshot> {
    const selected = requireActive(requestGeneration);
    await resumeEventsIfUnavailable(selected);
    requireSameActive(selected);
    const snapshot = await selected.controller.refresh();
    requireSameActive(selected);
    return snapshot;
  }

  async function resumeEventsIfUnavailable(
    selected: ActiveRemoteAssistant,
  ): Promise<void> {
    if (selected.connection.state !== "unavailable") return;
    if (selected.resumePromise === undefined) {
      const operation = selected.connection.reconnectEvents();
      const resumed = operation.finally(() => {
        if (selected.resumePromise === resumed) {
          selected.resumePromise = undefined;
        }
      });
      selected.resumePromise = resumed;
    }
    await selected.resumePromise;
  }

  async function dispatchAction(request: {
    readonly generation: number;
    readonly action: unknown;
    readonly requestId?: string;
  }): Promise<ActionResult> {
    const selected = requireActive(request.generation);
    const parsed = parseRequest({
      kind: "web.request",
      operation: "dispatchAction",
      ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
      action: request.action,
    });
    if (!parsed.ok || parsed.request.operation !== "dispatchAction") {
      throw new Error("Assistant action is invalid");
    }
    const result = await selected.controller.dispatchAction(
      parsed.request.action,
      parsed.request.requestId === undefined
        ? undefined
        : { requestId: parsed.request.requestId },
    );
    requireSameActive(selected);
    return result;
  }

  async function uploadAttachment(
    request: AttachmentUploadRequest & { readonly generation: number },
  ): Promise<AttachmentUploadResult> {
    const selected = requireActive(request.generation);
    const abort = new AbortController();
    selected.uploadControllers.add(abort);
    try {
      const uploaded = await options.attachmentTransport.upload({
        binding: {
          profileId: selected.profileId,
          serverUrl: selected.connection.profile.serverUrl,
        },
        attachment: {
          content: request.content,
          mediaType: request.mediaType,
          ...(request.label === undefined ? {} : { label: request.label }),
          ...(request.sessionId === undefined
            ? {}
            : { sessionId: request.sessionId }),
          ...(request.kind === undefined ? {} : { kind: request.kind }),
        },
        signal: abort.signal,
      });
      requireSameActive(selected);
      const snapshot = await selected.controller.refresh();
      requireSameActive(selected);
      if (!snapshot.attachments.ok) {
        throw new Error("Remote attachment state is unavailable");
      }
      const canonical = snapshot.attachments.value.attachments.find(
        ({ resourceId }) => resourceId === uploaded.resourceId,
      );
      if (canonical === undefined || !sameAttachmentEvidence(canonical, uploaded)) {
        throw new Error("Remote attachment state does not match the upload");
      }
      return {
        kind: "web.attachment-uploaded",
        attachment: canonical,
        attachments: snapshot.attachments.value,
        snapshot,
      };
    } finally {
      selected.uploadControllers.delete(abort);
    }
  }

  async function prepareResourceDelivery(request: {
    readonly generation: number;
    readonly resourceId: string;
    readonly sha256: string;
    readonly purpose: "preview" | "media";
    readonly sessionId?: string;
  }): Promise<PreparedResourceDelivery> {
    const selected = requireActive(request.generation);
    const client = selected.connection.client;
    if (client === undefined) throw new Error("Server Assistant is unavailable");
    const remote = await client.prepareResourceDelivery({
      resourceId: request.resourceId,
      expectedSha256: request.sha256,
      purpose: request.purpose,
      ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    });
    try {
      requireSameActive(selected);
      return options.resourceRelay.prepare({
        generation: selected.generation,
        binding: {
          profileId: selected.profileId,
          serverUrl: selected.connection.profile.serverUrl,
        },
        delivery: remote,
        revoke: async () => client.revokeResourceDelivery(remote.token),
      });
    } catch (error) {
      await client.revokeResourceDelivery(remote.token).catch(() => {});
      throw error;
    }
  }

  async function releaseResourceDelivery(request: {
    readonly generation: number;
    readonly delivery: Pick<PreparedResourceDelivery, "kind" | "url">;
  }): Promise<void> {
    await options.resourceRelay.release(request);
  }

  function emitProjected(
    eventGeneration: number,
    event: AssistantSurfaceEvent,
  ): void {
    const projected = projectSurfaceEvent(event);
    if (projected !== undefined) publish(eventGeneration, projected);
  }

  function handleConnectionEvent(
    eventGeneration: number,
    connection: DesktopServerAssistantConnection,
    event: DesktopServerConnectionEvent,
  ): void {
    if (active?.generation !== eventGeneration) return;
    if (event.kind === "state-changed") {
      if (
        event.state === "reconnecting" ||
        event.state === "unavailable" ||
        event.state === "closed"
      ) {
        publish(eventGeneration, { kind: "stream-unavailable" });
        abortUploads(active);
        void options.resourceRelay.retireGeneration(eventGeneration).catch(() => {});
      }
      return;
    }
    if (event.reason === "unavailable") {
      publish(eventGeneration, { kind: "stream-unavailable" });
      abortUploads(active);
      void options.resourceRelay.retireGeneration(eventGeneration).catch(() => {});
      return;
    }
    const selected = active;
    if (selected === undefined || selected.generation !== eventGeneration) return;
    void selected.controller.refresh().then(
      () => {
        if (active === selected) {
          publish(eventGeneration, { kind: "snapshot-invalidated" });
        }
      },
      () => {
        if (active === selected && connection.state !== "closed") {
          publish(eventGeneration, { kind: "stream-unavailable" });
        }
      },
    );
  }

  function publish(eventGeneration: number, event: ClientEvent): void {
    if (active?.generation !== eventGeneration || closed) return;
    const envelope = { generation: eventGeneration, event };
    for (const listener of listeners) {
      try {
        listener(envelope);
      } catch {
        // One window observer cannot affect trusted Assistant ownership.
      }
    }
  }

  function assertCandidateCurrent(revision: number, expected: number): void {
    assertOpen();
    if (activationRevision !== revision || generation !== expected) {
      throw new Error("Assistant location activation is stale");
    }
  }

  function assertExpectedGeneration(expected: number): void {
    if (generation !== expected) {
      throw new Error("Assistant location generation is stale");
    }
  }

  function requireActive(requestGeneration: number): ActiveRemoteAssistant {
    assertOpen();
    const selected = active;
    if (selected === undefined || selected.generation !== requestGeneration) {
      throw new Error("Assistant location generation is stale");
    }
    return selected;
  }

  function requireSameActive(selected: ActiveRemoteAssistant): void {
    if (active !== selected || closed) {
      throw new Error("Assistant location generation is stale");
    }
  }

  function assertOpen(): void {
    if (closed) throw new Error("Assistant location owner is closed");
  }
}

function retire(active: ActiveRemoteAssistant | undefined): void {
  abortUploads(active);
  active?.removeSurfaceListener();
  active?.removeConnectionListener();
}

function abortUploads(active: ActiveRemoteAssistant | undefined): void {
  if (active === undefined) return;
  for (const controller of active.uploadControllers) controller.abort();
  active.uploadControllers.clear();
}

function sameAttachmentEvidence(
  left: AttachmentUploadResult["attachment"],
  right: AttachmentUploadResult["attachment"],
): boolean {
  return left.resourceId === right.resourceId &&
    left.sha256 === right.sha256 &&
    left.sizeBytes === right.sizeBytes &&
    left.resourceKind === right.resourceKind &&
    left.mediaType === right.mediaType;
}
