import { randomUUID } from "node:crypto";
import type {
  CodingApplicationEvent,
  CodingApplicationEventListener,
  CodingApplicationEventPage,
  CodingApplicationEventReason,
  ListCodingEventsRequest,
} from "./model.js";

const EVENT_CAPACITY = 256;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

type CodingEventInput = {
  readonly projectId: string;
  readonly reason: CodingApplicationEventReason;
} & (
  | { readonly kind: "project_invalidated" }
  | { readonly kind: "turn_invalidated"; readonly turnId: string }
  | {
      readonly kind: "turn_live_invalidated"
      readonly turnId: string
      readonly revision: number
    }
  | { readonly kind: "proposal_invalidated"; readonly proposalId: string }
);

export class CodingApplicationEventLog {
  readonly #streamId: string;
  readonly #events: CodingApplicationEvent[] = [];
  readonly #listeners = new Set<CodingApplicationEventListener>();
  #sequence = 0;

  constructor(streamId = `coding-events-${randomUUID()}`) {
    if (streamId.length === 0 || Buffer.byteLength(streamId, "utf8") > 512) {
      throw new Error("Coding event streamId is invalid");
    }
    this.#streamId = streamId;
  }

  publish(input: CodingEventInput): CodingApplicationEvent {
    const event = Object.freeze({
      ...input,
      streamId: this.#streamId,
      sequence: ++this.#sequence,
      occurredAt: Date.now(),
    } as CodingApplicationEvent);
    this.#events.push(event);
    if (this.#events.length > EVENT_CAPACITY) this.#events.shift();
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // Presentation listeners are advisory and cannot affect application state.
      }
    }
    return event;
  }

  read(request: ListCodingEventsRequest = {}): CodingApplicationEventPage {
    const requestedStreamId = normalizeStreamId(request.streamId);
    const afterSequence = normalizeSequence(request.afterSequence);
    const limit = normalizeLimit(request.limit);
    const firstRetainedSequence =
      this.#events[0]?.sequence ?? this.#sequence + 1;
    const gap =
      (requestedStreamId !== undefined &&
        requestedStreamId !== this.#streamId) ||
      afterSequence < firstRetainedSequence - 1 ||
      afterSequence > this.#sequence;
    const effectiveAfter = gap ? firstRetainedSequence - 1 : afterSequence;
    const events = this.#events
      .filter((event) => event.sequence > effectiveAfter)
      .slice(0, limit);
    return {
      streamId: this.#streamId,
      events,
      firstRetainedSequence,
      lastSequence: this.#sequence,
      gap,
      hasMore: (events.at(-1)?.sequence ?? effectiveAfter) < this.#sequence,
    };
  }

  subscribe(listener: CodingApplicationEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  clear(): void {
    this.#listeners.clear();
    this.#events.splice(0);
  }
}

function normalizeStreamId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0 || Buffer.byteLength(value, "utf8") > 512) {
    throw new Error("Coding event streamId is invalid");
  }
  return value;
}

function normalizeSequence(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      "Coding event afterSequence must be a non-negative safe integer",
    );
  }
  return value;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PAGE_LIMIT) {
    throw new Error(
      `Coding event limit must be between 1 and ${MAX_PAGE_LIMIT}`,
    );
  }
  return value;
}
