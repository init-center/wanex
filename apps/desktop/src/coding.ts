import { isAbsolute } from "node:path";
import {
  createCodingTransportEndpoint,
  startCodingApplication,
  type CodingApplicationHost,
  type CodingHostDiagnostics,
  type CodingExecutionEnvironmentFactory,
} from "@wanex/coding/host";
import type {
  CodingCommandRequest,
  CodingEventUnsubscribe,
  CodingProjectReadModel,
  CodingTransportEndpoint,
} from "@wanex/coding";
import type { LocalStorageConfig } from "@wanex/assistant-host";
import type { WanexBootstrapStorageConfig } from "@wanex/runtime/bootstrap";
import type { SecretResolverPort } from "@wanex/runtime/secrets";
import {
  createToolRuntimeBinding,
  type ToolPermissionDecision,
  type ToolPermissionPolicy,
  type ToolPermissionRequest,
} from "@wanex/runtime/tools";
import type { PreparedAgentContext } from "@wanex/runtime/context";
import { ExactWorkspaceProgramPolicy } from "@wanex/workspace/tools";

export type DesktopCodingState =
  | "idle"
  | "starting"
  | "open"
  | "closing"
  | "closed";

export interface DesktopCodingCompositionOptions {
  readonly storage: LocalStorageConfig;
  readonly dataDir: string;
  readonly serviceBin: string;
  readonly secretResolver: SecretResolverPort;
  readonly resolveModelEndpointId: () => Promise<string | undefined>;
  readonly executionEnvironmentFactory?: CodingExecutionEnvironmentFactory;
  readonly baseAgentContext?: PreparedAgentContext;
  readonly start?: typeof startCodingApplication;
}

export interface DesktopCodingComposition {
  readonly state: DesktopCodingState;
  openProject(repositoryPath: string): Promise<CodingProjectReadModel>;
  readDiagnostics(): Promise<CodingHostDiagnostics | undefined>;
  send(request: CodingCommandRequest): Promise<unknown>;
  subscribe(listener: (event: unknown) => void): CodingEventUnsubscribe;
  close(): Promise<void>;
}

/**
 * Trusted Desktop owner for the repository-scoped Coding domain. The Host is
 * deliberately created only after the native picker returns a project path.
 */
export function createDesktopCodingComposition(
  options: DesktopCodingCompositionOptions,
): DesktopCodingComposition {
  const startHost = options.start ?? startCodingApplication;
  let state: DesktopCodingState = "idle";
  let host: CodingApplicationHost | undefined;
  let endpoint: CodingTransportEndpoint | undefined;
  let startPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  const listeners = new Map<
    (event: unknown) => void,
    CodingEventUnsubscribe
  >();

  const composition: DesktopCodingComposition = {
    get state() {
      return state;
    },
    async openProject(repositoryPath) {
      await ensureStarted();
      assertStarted();
      return await host!.openProject({ repositoryPath });
    },
    async readDiagnostics() {
      return await host?.readDiagnostics();
    },
    async send(request) {
      assertStarted();
      return await endpoint!.send(request);
    },
    subscribe(listener) {
      if (listeners.has(listener)) return () => {};
      const unsubscribe = endpoint?.subscribe(listener) ?? (() => {});
      listeners.set(listener, unsubscribe);
      return () => {
        const current = listeners.get(listener);
        if (current === undefined) return;
        current();
        listeners.delete(listener);
      };
    },
    async close() {
      if (closePromise !== undefined) return await closePromise;
      state = "closing";
      closePromise = (async () => {
        await startPromise?.catch(() => {});
        for (const unsubscribe of listeners.values()) unsubscribe();
        listeners.clear();
        try {
          await host?.close();
        } finally {
          host = undefined;
          endpoint = undefined;
          state = "closed";
        }
      })();
      return await closePromise;
    },
  };

  async function ensureStarted(): Promise<void> {
    if (state === "closed" || state === "closing") {
      throw new Error("Desktop Coding composition is closed");
    }
    if (host !== undefined && endpoint !== undefined) return;
    if (startPromise !== undefined) return await startPromise;
    state = "starting";
    startPromise = (async () => {
      try {
        host = await startHost({
          dataDir: options.dataDir,
          storage: codingStorageConfig(options.storage, options.serviceBin),
          artifacts: { explicitPath: options.serviceBin },
          execution: {
            toolPermissionPolicy: new DesktopCodingToolPermissionPolicy(),
            programPolicy: new ExactWorkspaceProgramPolicy({
              git: "git",
              node: process.execPath,
            }),
            secretResolver: options.secretResolver,
            ...(options.baseAgentContext === undefined
              ? {}
              : { baseAgentContext: options.baseAgentContext }),
            workerCount: 1,
            resolveModelEndpointId: async () =>
              await options.resolveModelEndpointId(),
          },
          ...(options.executionEnvironmentFactory === undefined
            ? {}
            : { executionEnvironmentFactory: options.executionEnvironmentFactory }),
        });
        endpoint = createCodingTransportEndpoint(host.application);
        for (const [listener] of listeners) {
          const unsubscribe = endpoint.subscribe(listener);
          listeners.set(listener, unsubscribe);
        }
        if (state !== "starting") {
          await host.close();
          host = undefined;
          endpoint = undefined;
          throw new Error("Desktop Coding composition is closing");
        }
        state = "open";
      } catch (error) {
        host = undefined;
        endpoint = undefined;
        if (state === "starting" || state === "open") state = "idle";
        throw error;
      } finally {
        startPromise = undefined;
      }
    })();
    return await startPromise;
  }

  function assertStarted(): void {
    if (state === "closed" || state === "closing") {
      throw new Error("Desktop Coding composition is closed");
    }
    if (host === undefined || endpoint === undefined) {
      throw new Error("Desktop Coding project has not been selected");
    }
  }

  return Object.freeze(composition);
}

export function codingStorageConfig(
  storage: LocalStorageConfig,
  serviceBin: string,
): WanexBootstrapStorageConfig {
  const artifact = { serviceBin };
  if (storage.kind === "profile") {
    return {
      kind: "local-profile",
      ...(storage.mode === undefined ? {} : { mode: storage.mode }),
      rootDir: storage.rootDir,
      ...(storage.profileId === undefined ? {} : { profileId: storage.profileId }),
      ...artifact,
    };
  }
  return {
    kind: "local-system-service",
    ...(storage.mode === undefined ? {} : { mode: storage.mode }),
    storeDir: storage.storeDir,
    ...artifact,
  };
}

/**
 * The packaged Desktop proof cannot interact with a native directory picker.
 * Keep its serialized selection path strictly proof-only and hand the path
 * directly to the trusted main-process composition.
 */
export function createDesktopCodingProofSelectionQueue(options: {
  readonly proofEnabled: boolean;
  readonly serializedSelections: string | undefined;
}): (() => Promise<string | undefined>) | undefined {
  const { serializedSelections } = options;
  if (!options.proofEnabled) {
    if (serializedSelections !== undefined) {
      throw new Error("Desktop Coding proof selections require proof mode");
    }
    return undefined;
  }
  if (serializedSelections === undefined) return undefined;
  if (Buffer.byteLength(serializedSelections, "utf8") > 16_384) {
    throw new Error("Desktop Coding proof selections exceed 16384 bytes");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedSelections);
  } catch {
    throw new Error("Desktop Coding proof selections must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 4) {
    throw new Error("Desktop Coding proof selections must contain 1 to 4 paths");
  }
  const selections = parsed.map((value) => {
    if (typeof value !== "string") {
      throw new Error("Desktop Coding proof selection must be a string");
    }
    const path = value.trim();
    if (path.length === 0 || path.includes("\0") || !isAbsolute(path)) {
      throw new Error("Desktop Coding proof selection must be an absolute path");
    }
    return path;
  });
  let index = 0;
  return async () => {
    const selected = selections[index];
    if (selected === undefined) {
      throw new Error("Desktop Coding proof selection queue is exhausted");
    }
    index += 1;
    return selected;
  };
}

class DesktopCodingToolPermissionPolicy implements ToolPermissionPolicy {
  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.desktop.coding.tool-policy",
      implementationRevision: "1",
      configuration: {
        readOnly: "allow",
        mutating: "approval_required",
        external: "deny",
      },
    });
  }

  async authorize(
    request: ToolPermissionRequest,
  ): Promise<ToolPermissionDecision> {
    if (request.descriptor.risk === "read_only") {
      return { status: "allow", reason: "desktop_coding_read_only_tool" };
    }
    if (request.descriptor.risk === "mutating") {
      return {
        status: "approval_required",
        reason: "desktop_coding_mutation_requires_review",
        presentation: {
          summary: `Review ${request.descriptor.name}`,
        },
      };
    }
    return { status: "deny", reason: "desktop_coding_external_tool_denied" };
  }
}
