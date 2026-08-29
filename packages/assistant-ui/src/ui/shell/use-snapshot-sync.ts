import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Snapshot } from "../../application/model.js";
import type { Client } from "../../client/contracts.js";
import { preserveExpandedConversationHistory } from "../../application/conversation/projection.js";

const MAX_BUFFERED_ASSISTANT_CHARS = 65_536;
const MAX_BUFFERED_CONVERSATIONS = 8;

interface BufferedAssistantText {
  readonly operationId: string;
  readonly text: string;
}

export function useSnapshotSync(
  client: Client,
  initialSnapshot: Snapshot | undefined,
): {
  readonly snapshot: Snapshot | undefined;
  readonly snapshotError: string | undefined;
  readonly snapshotRetrying: boolean;
  readonly streamAvailable: boolean;
  readonly beginRequest: () => number;
  readonly adoptSnapshot: (
    snapshot: Snapshot,
    requestGeneration: number,
  ) => void;
  readonly adoptArrivedSnapshot: (snapshot: Snapshot) => void;
  readonly retrySnapshot: () => void;
} {
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>(
    initialSnapshot,
  );
  const [snapshotError, setSnapshotError] = useState<string | undefined>();
  const [snapshotRetrying, setSnapshotRetrying] = useState(false);
  const [snapshotReadAttempt, setSnapshotReadAttempt] = useState(0);
  const [streamAvailable, setStreamAvailable] = useState(true);
  const snapshotRef = useRef(snapshot);
  const bufferedAssistantText = useRef(
    new Map<string, BufferedAssistantText>(),
  );
  const requestGeneration = useRef(0);
  const latestAdoptedGeneration = useRef(0);
  const retryInFlight = useRef(false);

  const beginRequest = useCallback(() => {
    requestGeneration.current += 1;
    return requestGeneration.current;
  }, []);
  const adoptSnapshot = useCallback((
    next: Snapshot,
    generation: number,
  ) => {
    if (generation < latestAdoptedGeneration.current) return;
    latestAdoptedGeneration.current = generation;
    setSnapshotError(undefined);
    const adopted = applyBufferedAssistantText(
      preserveTransientAssistantText(snapshotRef.current, next),
      bufferedAssistantText.current,
    );
    snapshotRef.current = adopted;
    setSnapshot(adopted);
  }, []);
  const adoptArrivedSnapshot = useCallback((next: Snapshot) => {
    adoptSnapshot(next, beginRequest());
  }, [adoptSnapshot, beginRequest]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    let refreshInFlight: Promise<void> | undefined;
    let refreshPending = false;
    void start();
    return () => {
      mounted = false;
      unsubscribe?.();
    };

    async function start(): Promise<void> {
      if (initialSnapshot === undefined || snapshotReadAttempt > 0) {
        const generation = beginRequest();
        try {
          const next = await client.readSnapshot();
          if (!mounted) return;
          adoptSnapshot(next, generation);
        } catch (reason) {
          if (mounted) {
            setSnapshotError(errorMessage(reason));
            finishRetry();
          }
          return;
        }
      }
      if (!mounted) return;
      setStreamAvailable(true);
      finishRetry();
      unsubscribe = client.subscribe?.((event) => {
        if (event.kind === "stream-unavailable") {
          setStreamAvailable(false);
          return;
        }
        setStreamAvailable(true);
        if (event.kind === "assistant-text-delta") {
          const current = snapshotRef.current;
          if (current !== undefined && matchesConversation(current, event)) {
            const next = withTransientDelta(current, event.text);
            snapshotRef.current = next;
            setSnapshot(next);
            return;
          }
          bufferAssistantDelta(bufferedAssistantText.current, event);
          if (current !== undefined) {
            const next = applyBufferedAssistantText(
              current,
              bufferedAssistantText.current,
            );
            if (next !== current) {
              snapshotRef.current = next;
              setSnapshot(next);
            }
          }
          scheduleRefresh();
          return;
        }
        if (
          event.kind === "snapshot-invalidated" &&
          event.operationId !== undefined &&
          event.sessionId !== undefined
        ) {
          clearBufferedAssistantText(bufferedAssistantText.current, {
            operationId: event.operationId,
            sessionId: event.sessionId,
          });
        }
        scheduleRefresh();
      });
    }

    function scheduleRefresh(): void {
      if (refreshInFlight !== undefined) {
        refreshPending = true;
        return;
      }
      refreshInFlight = refreshCanonicalSnapshot().finally(() => {
        refreshInFlight = undefined;
        if (mounted && refreshPending) scheduleRefresh();
      });
    }

    async function refreshCanonicalSnapshot(): Promise<void> {
      do {
        refreshPending = false;
        const generation = latestAdoptedGeneration.current;
        try {
          const next = await client.readSnapshot();
          if (!mounted) return;
          adoptSnapshot(next, generation);
        } catch (reason) {
          if (mounted) setSnapshotError(errorMessage(reason));
          return;
        }
      } while (mounted && refreshPending);
    }

    function finishRetry(): void {
      retryInFlight.current = false;
      setSnapshotRetrying(false);
    }
  }, [
    adoptSnapshot,
    beginRequest,
    client,
    initialSnapshot,
    snapshotReadAttempt,
  ]);

  const retrySnapshot = useCallback(() => {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setSnapshotRetrying(true);
    setSnapshotReadAttempt((current) => current + 1);
  }, []);

  return {
    snapshot,
    snapshotError,
    snapshotRetrying,
    streamAvailable,
    beginRequest,
    adoptSnapshot,
    adoptArrivedSnapshot,
    retrySnapshot,
  };
}

function bufferAssistantDelta(
  buffered: Map<string, BufferedAssistantText>,
  event: {
    readonly operationId: string;
    readonly sessionId: string;
    readonly text: string;
  },
): void {
  const current = buffered.get(event.sessionId);
  const text = current?.operationId === event.operationId
    ? `${current.text}${event.text}`
    : event.text;
  buffered.delete(event.sessionId);
  buffered.set(event.sessionId, {
    operationId: event.operationId,
    text: text.slice(-MAX_BUFFERED_ASSISTANT_CHARS),
  });
  while (buffered.size > MAX_BUFFERED_CONVERSATIONS) {
    const oldest = buffered.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    buffered.delete(oldest);
  }
}

function clearBufferedAssistantText(
  buffered: Map<string, BufferedAssistantText>,
  event: {
    readonly operationId: string;
    readonly sessionId: string;
  },
): void {
  if (buffered.get(event.sessionId)?.operationId === event.operationId) {
    buffered.delete(event.sessionId);
  }
}

function applyBufferedAssistantText(
  snapshot: Snapshot,
  buffered: ReadonlyMap<string, BufferedAssistantText>,
): Snapshot {
  const sessionId = snapshot.conversation.sessionId;
  if (sessionId === undefined) return snapshot;
  const pending = buffered.get(sessionId);
  if (
    pending === undefined ||
    (snapshot.conversation.operationId !== undefined &&
      snapshot.conversation.operationId !== pending.operationId)
  ) {
    return snapshot;
  }
  return withTransientAssistantText(snapshot, pending.text);
}

function preserveTransientAssistantText(
  current: Snapshot | undefined,
  candidate: Snapshot,
): Snapshot {
  if (current === undefined) return candidate;
  const candidateWithHistory = {
    ...candidate,
    conversation: preserveExpandedConversationHistory(
      current.conversation,
      candidate.conversation,
    ),
  };
  const transient = current.conversation.transientAssistantText;
  if (
    transient === undefined ||
    candidateWithHistory.conversation.transientAssistantText !== undefined ||
    candidateWithHistory.conversation.operationId !== current.conversation.operationId ||
    candidateWithHistory.conversation.sessionId !== current.conversation.sessionId ||
    candidateWithHistory.conversation.operation?.capabilities.terminal !== false
  ) {
    return candidateWithHistory;
  }
  return withTransientDelta(candidateWithHistory, transient);
}

function withTransientDelta(
  snapshot: Snapshot,
  text: string,
): Snapshot {
  const transient = `${snapshot.conversation.transientAssistantText ?? ""}${text}`;
  return withTransientAssistantText(snapshot, transient);
}

function withTransientAssistantText(
  snapshot: Snapshot,
  transient: string,
): Snapshot {
  return {
    ...snapshot,
    conversation: { ...snapshot.conversation, transientAssistantText: transient },
    view: { ...snapshot.view, transientAssistantText: transient },
  };
}

function matchesConversation(
  snapshot: Snapshot,
  event: {
    readonly operationId?: string;
    readonly sessionId?: string;
  },
): boolean {
  return event.operationId !== undefined &&
    event.sessionId !== undefined &&
    event.operationId === snapshot.conversation.operationId &&
    event.sessionId === snapshot.conversation.sessionId;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Web request failed";
}
