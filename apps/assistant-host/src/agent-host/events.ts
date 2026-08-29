import type {
  AgentHostEvent,
  AgentHostEventPage,
  AgentHostEventReplayRequest,
} from "@wanex/protocol";
import type { SurfaceAdapter, SurfaceEventPage } from "@wanex/assistant";

const STREAM_PREFIX = "assistant:";

export interface AssistantAgentHostEventBridge {
  readonly subscribe: (
    listener: (event: AgentHostEvent) => void,
  ) => () => void;
}

export function createAssistantAgentHostEventBridge(
  surface: SurfaceAdapter,
): AssistantAgentHostEventBridge {
  return {
    subscribe(listener) {
      return surface.subscribeSurfaceEvents((event) => listener(project(event)));
    },
  };
}

export function createAssistantReplayResult(
  surface: SurfaceAdapter,
  request: AgentHostEventReplayRequest,
):
  | {
      readonly outcome: "replayed";
      readonly page: AgentHostEventPage;
    }
  | {
      readonly outcome: "gap";
      readonly gap: {
        readonly reason: "cursor_before_window" | "stream_replaced";
        readonly canonicalReadRequired: true;
      };
    } {
  const page = surface.readSurfaceEvents({
    streamId: rawStreamId(request.streamId),
    afterSequence: request.afterSequence,
    limit: request.limit,
  });
  if (!page.gap) {
    return {
      outcome: "replayed",
      page: {
        streamId: hostStreamId(page.streamId),
        events: page.events.map(project),
        earliestSequence: page.earliestSequence,
        latestSequence: page.latestSequence,
        hasMore: page.hasMore,
      },
    };
  }
  return {
    outcome: "gap",
    gap: {
      reason:
        request.streamId === hostStreamId(page.streamId)
          ? "cursor_before_window"
          : "stream_replaced",
      canonicalReadRequired: true,
    },
  };
}

function project(event: SurfaceEventPage["events"][number]): AgentHostEvent {
  const separator = event.id.lastIndexOf(":");
  const streamId = separator > 0 ? event.id.slice(0, separator) : event.id;
  return {
    kind: "wanex.agent-host.event",
    streamId: hostStreamId(streamId),
    sequence: event.sequence,
    eventId: event.id,
    domain: "assistant",
    type: event.type,
    payload: jsonValue(event),
    occurredAt: event.at,
  };
}

function hostStreamId(streamId: string): string {
  return `${STREAM_PREFIX}${streamId}`;
}

function rawStreamId(streamId: string): string {
  return streamId.startsWith(STREAM_PREFIX)
    ? streamId.slice(STREAM_PREFIX.length)
    : streamId;
}

function jsonValue(value: unknown): import("@wanex/protocol").JsonValue {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? null : JSON.parse(encoded);
}
