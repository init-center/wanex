import { buildSupportBundle as buildColdSupportBundle } from "./diagnostics/index.js";
import { resolveRuntimeHostDiagnostics } from "@wanex/runtime/host";
import {
  projectWanexAppRecentSessionsReadModel,
  projectWanexAppSessionInputProvenanceReadModel,
  projectWanexAppSessionTranscriptReadModel,
} from "./read-model.js";
import { runWanexAppSafeCommand } from "./result-envelope.js";
import type { WanexAppCommandContext } from "./command-context.js";
import type { WanexAppDiagnosticsCommands } from "./types-diagnostics.js";
import type { WanexAppLifecycleCommands } from "./types-lifecycle.js";
import type { WanexAppReadModelCommands } from "./types-read-model.js";
import type { WanexAppResultEnvelopeCommands } from "./types-result-envelope.js";
import type { SessionInputState } from "@wanex/protocol";

const DEFAULT_SESSION_TRANSCRIPT_LIMIT = 100;
const MAX_SESSION_TRANSCRIPT_LIMIT = 200;
const MAX_TRANSCRIPT_INPUTS_PER_STATE = 100;
const MAX_TOOL_ACTIVITY_SOURCE_IDS = 200;
const visibleInputStates = [
  "admitted",
  "control_pending",
  "failed",
  "cancelled",
  "rejected",
] as const satisfies readonly SessionInputState[];

export type WanexAppSystemCommandGroup = WanexAppDiagnosticsCommands &
  WanexAppReadModelCommands &
  WanexAppResultEnvelopeCommands &
  WanexAppLifecycleCommands;

export function createWanexAppSystemCommands(
  context: WanexAppCommandContext,
  isDisposed: () => boolean,
): WanexAppSystemCommandGroup {
  return {
    async readDiagnostics(diagnosticsOptions = {}) {
      context.assertActive();
      return await context.runtime.app.getDiagnostics({
        jobLimit: 50,
        pluginLimit: 50,
        ...(diagnosticsOptions.runtimeHost === undefined
          ? {}
          : { runtimeHost: diagnosticsOptions.runtimeHost }),
        ...(diagnosticsOptions.now === undefined
          ? {}
          : { now: diagnosticsOptions.now }),
      });
    },
    async buildSupportBundle(bundleOptions = {}) {
      context.assertActive();
      const activeModelEndpointId =
        await context.refreshActiveModelEndpointId();
      const runtimeHostDiagnostics =
        bundleOptions.runtimeHost === undefined
          ? undefined
          : await resolveRuntimeHostDiagnostics(bundleOptions.runtimeHost, {
              ...(bundleOptions.now === undefined
                ? {}
                : { now: bundleOptions.now }),
              jobLimit: bundleOptions.jobLimit ?? 20,
            });
      return await buildColdSupportBundle({
        storage: context.runtime.app.storage,
        modelEndpointIds: [activeModelEndpointId],
        eventLimit: bundleOptions.eventLimit ?? 20,
        jobLimit: bundleOptions.jobLimit ?? 20,
        pluginLimit: 20,
        ...(runtimeHostDiagnostics === undefined
          ? {}
          : {
              runtimeHost: runtimeHostDiagnostics.summary,
              ...(runtimeHostDiagnostics.health === undefined
                ? {}
                : { runtimeHostHealth: runtimeHostDiagnostics.health }),
            }),
        ...(bundleOptions.now === undefined ? {} : { now: bundleOptions.now }),
      });
    },
    async readRecentSessions(request = {}) {
      context.assertActive();
      const limit = normalizeRecentSessionLimit(request.limit);
      const sessions = await context.runtime.storage.listSessions({
        ...(request.kind === undefined ? {} : { kind: request.kind }),
        ...(request.status === undefined ? {} : { status: request.status }),
        limit,
      });
      return projectWanexAppRecentSessionsReadModel(sessions, limit);
    },
    async readSessionInputProvenance(request) {
      context.assertActive();
      const inputs = await context.runtime.storage.listSessionInputs({
        sessionId: request.sessionId,
      });
      return projectWanexAppSessionInputProvenanceReadModel(
        request.sessionId,
        inputs,
      );
    },
    async readSessionTranscript(request) {
      context.assertActive();
      const limit = normalizeSessionTranscriptLimit(request.limit);
      const [messageWindow, inputWindows] = await Promise.all([
        context.runtime.storage.listSessionMessages({
          sessionId: request.sessionId,
          ...(request.beforeSequence === undefined
            ? {}
            : { beforeSequence: request.beforeSequence }),
          limit: limit + 1,
        }),
        request.beforeSequence === undefined
          ? Promise.all(
              visibleInputStates.map((status) =>
                context.runtime.storage.listSessionInputs({
                  sessionId: request.sessionId,
                  status,
                  limit: MAX_TRANSCRIPT_INPUTS_PER_STATE + 1,
                }),
              ),
            )
          : Promise.resolve(visibleInputStates.map(() => [])),
      ]);
      const candidateMessages =
        messageWindow.length > limit ? messageWindow.slice(1) : messageWindow;
      const boundaryTurnIds = [
        candidateMessages[0]?.turnId,
        candidateMessages.at(-1)?.turnId,
      ].filter((turnId): turnId is string => turnId !== undefined);
      const boundaryMessages =
        boundaryTurnIds.length === 0
          ? []
          : await context.runtime.storage.listSessionMessages({
              sessionId: request.sessionId,
              turnIds: [...new Set(boundaryTurnIds)],
            });
      const messages = mergeSessionMessages(candidateMessages, boundaryMessages);
      const turnIds = [...new Set(messages.map((message) => message.turnId))];
      const sourceMessageIds = messages.flatMap((message) =>
        message.content.some((part) => part.type === "tool_call")
          ? [message.id]
          : [],
      );
      const [turns, toolActivityWindows] = await Promise.all([
        turnIds.length === 0
          ? Promise.resolve([])
          : context.runtime.storage.listSessionTurns({
              sessionId: request.sessionId,
              turnIds,
            }),
        Promise.all(
          chunk(sourceMessageIds, MAX_TOOL_ACTIVITY_SOURCE_IDS).map(
            (sourceMessageIds) =>
              context.runtime.storage.listToolActivities({
                sessionId: request.sessionId,
                sourceMessageIds,
              }),
          ),
        ),
      ]);
      const liveInputsTruncated =
        inputWindows.some(
          (inputs) => inputs.length > MAX_TRANSCRIPT_INPUTS_PER_STATE,
        );
      const inputs = inputWindows.flatMap((rows) =>
        rows.slice(-MAX_TRANSCRIPT_INPUTS_PER_STATE),
      );
      const nextBeforeSequence = messages[0]?.sequence;
      const hasMore = nextBeforeSequence !== undefined && nextBeforeSequence > 1;
      return projectWanexAppSessionTranscriptReadModel(request.sessionId, {
        inputs,
        messages,
        turns,
        toolActivities: toolActivityWindows.flat(),
      }, {
        limit,
        hasMore,
        ...(hasMore ? { nextBeforeSequence } : {}),
        liveInputsTruncated,
      });
    },
    async readExtensionContributions() {
      context.assertActive();
      return context.extensions.readModel();
    },
    async safeCommand(request) {
      return await runWanexAppSafeCommand(request);
    },
    async shutdown() {
      const repeated = isDisposed();
      await context.dispose();
      return {
        disposed: true,
        repeated,
      };
    },
  };
}

function chunk<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

function normalizeRecentSessionLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 10;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("recent session limit must be a positive integer");
  }
  return limit;
}

function normalizeSessionTranscriptLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_SESSION_TRANSCRIPT_LIMIT;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_SESSION_TRANSCRIPT_LIMIT
  ) {
    throw new Error(
      `session transcript limit must be an integer between 1 and ${MAX_SESSION_TRANSCRIPT_LIMIT}`,
    );
  }
  return limit;
}

function mergeSessionMessages<T extends { readonly id: string; readonly sequence: number }>(
  first: readonly T[],
  second: readonly T[],
): readonly T[] {
  const byId = new Map<string, T>();
  for (const message of [...first, ...second]) byId.set(message.id, message);
  return [...byId.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
}
