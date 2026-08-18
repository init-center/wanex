import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Snapshot } from "../../application/model.js";
import type { Client } from "../../client/contracts.js";
import { preserveExpandedConversationHistory } from "../../application/conversation/projection.js";

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
    setSnapshot((current) => preserveTransientAssistantText(current, next));
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
        if (event.kind === "assistant-text-delta" && event.text !== undefined) {
          setSnapshot((current) =>
            current === undefined || !matchesConversation(current, event)
              ? current
              : withTransientDelta(current, event.text ?? ""),
          );
          return;
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
        const generation = beginRequest();
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
