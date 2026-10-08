import {
  CircleAlert,
  LoaderCircle,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import type {
  Client,
  PreparedResourceDelivery,
} from "../../client/contracts.js";
import { classes } from "../classes.js";

type ResourceMediaKind = "audio" | "video";
type ResourceMediaState = "idle" | "loading" | "ready" | "failed";

interface ResumeIntent {
  readonly currentTime: number;
  readonly shouldPlay: boolean;
}

interface DeliveryAttempt {
  active: boolean;
  ready: boolean;
  released: boolean;
  delivery?: PreparedResourceDelivery;
}

interface PlaybackScope {
  active: boolean;
  resume: ResumeIntent;
  shouldPlay: boolean;
  expiryRenewals: number;
  attempt?: DeliveryAttempt;
}

const EXPIRY_RECOVERY_WINDOW_MS = 5_000;

export function ResourceMediaPlayback({
  client,
  resourceId,
  sha256,
  kind,
  label,
  sessionId,
}: {
  readonly client: Client;
  readonly resourceId: string;
  readonly sha256: string;
  readonly kind: ResourceMediaKind;
  readonly label: string;
  readonly sessionId?: string;
}): ReactNode {
  const container = useRef<HTMLDivElement>(null);
  const scope = useMemo<PlaybackScope>(() => ({
    active: false,
    resume: { currentTime: 0, shouldPlay: true },
    shouldPlay: true,
    expiryRenewals: 0,
  }), [client, resourceId, sha256, sessionId, kind]);
  const [request, setRequest] = useState<{ scope: PlaybackScope; revision: number }>();
  const requestRevision = request?.scope === scope ? request.revision : 0;
  const [view, setView] = useState<{
    scope: PlaybackScope;
    revision: number;
    state: ResourceMediaState;
    attempt: DeliveryAttempt;
  }>();
  const current = view?.scope === scope && view.revision === requestRevision ? view : undefined;
  const attempt = current?.attempt;
  const delivery = attempt?.delivery;
  const state = current?.state ?? (requestRevision === 0 ? "idle" : "loading");
  const isLive = (candidate: DeliveryAttempt | undefined): candidate is DeliveryAttempt =>
    scope.active && candidate !== undefined && candidate.active && scope.attempt === candidate;

  useLayoutEffect(() => {
    scope.active = true;
    return () => {
      scope.active = false;
      if (scope.attempt !== undefined) {
        scope.attempt.active = false;
        releaseAttempt(client, scope.attempt);
      }
    };
  }, [client, scope]);

  useEffect(() => {
    if (requestRevision === 0 || client.prepareResourceDelivery === undefined) return;
    const next: DeliveryAttempt = { active: true, ready: false, released: false };
    scope.attempt = next;
    const publish = (nextState: ResourceMediaState): void => {
      setView({ scope, revision: requestRevision, state: nextState, attempt: next });
    };
    publish("loading");
    void client.prepareResourceDelivery({
      resourceId,
      sha256,
      purpose: "media",
      ...(sessionId === undefined ? {} : { sessionId }),
    }).then((nextDelivery) => {
      next.delivery = nextDelivery;
      if (!scope.active || !next.active || scope.attempt !== next) {
        releaseAttempt(client, next);
        return;
      }
      publish("loading");
    }).catch(() => {
      if (scope.active && next.active && scope.attempt === next) publish("failed");
    });
    return () => {
      next.active = false;
      releaseAttempt(client, next);
    };
  }, [client, requestRevision, resourceId, scope, sessionId, sha256]);

  const requestDelivery = (): void => {
    if (!scope.active) return;
    if (scope.attempt !== undefined) {
      scope.attempt.active = false;
      releaseAttempt(client, scope.attempt);
    }
    setRequest((previous) => ({ scope, revision: previous?.scope === scope ? previous.revision + 1 : 1 }));
  };

  const requestPlayback = (restart: boolean): void => {
    scope.expiryRenewals = 0;
    if (restart) {
      scope.resume = { currentTime: 0, shouldPlay: true };
      scope.shouldPlay = true;
    }
    requestDelivery();
  };
  const handleReady = (event: SyntheticEvent<HTMLMediaElement>): void => {
    if (!isLive(attempt) || attempt.ready) return;
    attempt.ready = true;
    const element = event.currentTarget;
    const targetTime = scope.resume.currentTime;
    if (Number.isFinite(targetTime) && targetTime > 0) {
      try {
        element.currentTime = targetTime;
      } catch {
        // The native media control remains usable when a codec cannot seek yet.
      }
    }
    setView({ scope, revision: requestRevision, state: "ready", attempt });
    scope.shouldPlay = scope.resume.shouldPlay;
    if (document.activeElement === container.current) element.focus();
    if (scope.shouldPlay) {
      void element.play().catch(() => undefined);
    }
  };
  const handleError = (event: SyntheticEvent<HTMLMediaElement>): void => {
    if (!isLive(attempt) || delivery === undefined) return;
    const element = event.currentTarget;
    const nearExpiry = Date.now() >= delivery.expiresAt - EXPIRY_RECOVERY_WINDOW_MS;
    if (nearExpiry && scope.expiryRenewals === 0) {
      scope.expiryRenewals = 1;
      scope.resume = {
        currentTime: finiteMediaTime(element.currentTime),
        shouldPlay: scope.shouldPlay,
      };
      if (document.activeElement === element) container.current?.focus();
      requestDelivery();
      return;
    }
    scope.resume = {
      currentTime: finiteMediaTime(element.currentTime),
      shouldPlay: scope.shouldPlay,
    };
    if (document.activeElement === element) container.current?.focus();
    attempt.active = false;
    releaseAttempt(client, attempt);
    setView({ scope, revision: requestRevision, state: "failed", attempt });
  };

  const unavailable = client.prepareResourceDelivery === undefined;
  const mediaProps = {
    className: classes(`resource-media resource-media-${kind}`),
    src: delivery?.url,
    controls: true,
    preload: "metadata" as const,
    "aria-label": label,
    onLoadedMetadata: handleReady,
    onCanPlay: handleReady,
    onError: handleError,
    onPlay: () => {
      if (isLive(attempt)) scope.shouldPlay = true;
    },
    onPause: () => {
      if (isLive(attempt)) scope.shouldPlay = false;
    },
  };

  return (
    <div
      ref={container}
      tabIndex={-1}
      className={classes(`resource-media-shell is-${state}`)}
      data-ui-resource-media={resourceId}
      data-ui-media-kind={kind}
      data-ui-media-state={state}
    >
      {delivery !== undefined && state !== "failed" ? (
        kind === "audio" ? <audio key={requestRevision} {...mediaProps} /> : <video key={requestRevision} {...mediaProps} />
      ) : state === "loading" ? (
        <span className={classes("resource-media-status")} role="status">
          <LoaderCircle size={16} className={classes("is-running")} aria-hidden="true" />
          Loading {kind}
        </span>
      ) : state === "failed" || unavailable ? (
        unavailable ? (
          <span className={classes("resource-media-status is-failed")} role="status">
            <CircleAlert size={15} aria-hidden="true" />
            Playback unavailable
          </span>
        ) : (
          <button
            type="button"
            className={classes("resource-media-action is-retry")}
            onClick={(event) => {
              if (document.activeElement === event.currentTarget) container.current?.focus();
              requestPlayback(false);
            }}
            aria-label={`Retry ${label}`}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Retry playback
          </button>
        )
      ) : (
        <button
          type="button"
          className={classes("resource-media-action")}
          onClick={(event) => {
            if (document.activeElement === event.currentTarget) container.current?.focus();
            requestPlayback(true);
          }}
          aria-label={`Play ${label}`}
        >
          <Play size={15} fill="currentColor" aria-hidden="true" />
          Play {kind}
        </button>
      )}
    </div>
  );
}

function finiteMediaTime(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function releaseAttempt(
  client: Client,
  attempt: DeliveryAttempt,
): void {
  if (attempt.delivery === undefined || attempt.released) return;
  attempt.released = true;
  void client.releaseResourceDelivery?.(attempt.delivery).catch(() => undefined);
}
