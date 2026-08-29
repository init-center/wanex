import type {
  AgentHostEvent,
  AgentHostEventPage,
  AgentHostEventReplayRequest,
} from "@wanex/protocol";
import type {
  CodingApplication,
  CodingApplicationEvent,
} from "../../application/model.js";

const STREAM_PREFIX = "coding:";

export async function createCodingAgentHostReplayResult(
  application: CodingApplication,
  request: AgentHostEventReplayRequest,
): Promise<
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
    }
> {
  const page = await application.readEvents({
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
        earliestSequence: page.firstRetainedSequence,
        latestSequence: page.lastSequence,
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

export function subscribeCodingAgentHostEvents(
  application: CodingApplication,
  listener: (event: AgentHostEvent) => void,
): () => void {
  return application.subscribe((event) => listener(project(event)));
}

function project(event: CodingApplicationEvent): AgentHostEvent {
  return {
    kind: "wanex.agent-host.event",
    streamId: hostStreamId(event.streamId),
    sequence: event.sequence,
    eventId: `${event.streamId}:${event.sequence}`,
    domain: "coding",
    type: `${event.kind}:${event.reason}`,
    payload: jsonValue(event),
    occurredAt: event.occurredAt,
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
