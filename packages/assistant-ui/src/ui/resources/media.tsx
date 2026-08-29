import {
  CircleAlert,
  LoaderCircle,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  useEffect,
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
  const resume = useRef<ResumeIntent>({ currentTime: 0, shouldPlay: true });
  const playbackIntent = useRef(true);
  const readinessApplied = useRef(false);
  const expiryRenewals = useRef(0);
  const activeDelivery = useRef<
    PreparedResourceDelivery | undefined
  >(undefined);
  const [requestRevision, setRequestRevision] = useState(0);
  const [delivery, setDelivery] = useState<
    PreparedResourceDelivery | undefined
  >();
  const [state, setState] = useState<ResourceMediaState>("idle");

  useEffect(() => {
    if (requestRevision === 0 || client.prepareResourceDelivery === undefined) return;
    let active = true;
    releaseActiveDelivery(client, activeDelivery);
    readinessApplied.current = false;
    setDelivery(undefined);
    setState("loading");
    void client.prepareResourceDelivery({
      resourceId,
      sha256,
      purpose: "media",
      ...(sessionId === undefined ? {} : { sessionId }),
    }).then((nextDelivery) => {
      if (!active) {
        releaseDelivery(client, nextDelivery);
        return;
      }
      activeDelivery.current = nextDelivery;
      setDelivery(nextDelivery);
    }).catch(() => {
      if (active) setState("failed");
    });
    return () => {
      active = false;
    };
  }, [client, requestRevision, resourceId, sessionId, sha256]);

  useEffect(() => () => {
    releaseActiveDelivery(client, activeDelivery);
  }, [client]);

  const requestPlayback = (restart: boolean): void => {
    expiryRenewals.current = 0;
    playbackIntent.current = true;
    if (restart) resume.current = { currentTime: 0, shouldPlay: true };
    setRequestRevision((current) => current + 1);
  };
  const handleReady = (event: SyntheticEvent<HTMLMediaElement>): void => {
    if (readinessApplied.current) return;
    readinessApplied.current = true;
    const element = event.currentTarget;
    const targetTime = resume.current.currentTime;
    if (Number.isFinite(targetTime) && targetTime > 0) {
      try {
        element.currentTime = targetTime;
      } catch {
        // The native media control remains usable when a codec cannot seek yet.
      }
    }
    setState("ready");
    playbackIntent.current = resume.current.shouldPlay;
    if (playbackIntent.current) {
      void element.play().catch(() => undefined);
    }
  };
  const handleError = (event: SyntheticEvent<HTMLMediaElement>): void => {
    if (delivery === undefined) return;
    const element = event.currentTarget;
    const nearExpiry = Date.now() >= delivery.expiresAt - EXPIRY_RECOVERY_WINDOW_MS;
    if (nearExpiry && expiryRenewals.current === 0) {
      expiryRenewals.current = 1;
      resume.current = {
        currentTime: finiteMediaTime(element.currentTime),
        shouldPlay: playbackIntent.current,
      };
      setRequestRevision((current) => current + 1);
      return;
    }
    resume.current = {
      currentTime: finiteMediaTime(element.currentTime),
      shouldPlay: playbackIntent.current,
    };
    releaseActiveDelivery(client, activeDelivery);
    setDelivery(undefined);
    setState("failed");
  };

  const unavailable = client.prepareResourceDelivery === undefined;
  const mediaProps = {
    className: `resource-media resource-media-${kind}`,
    src: delivery?.url,
    controls: true,
    preload: "metadata" as const,
    "aria-label": label,
    onLoadedMetadata: handleReady,
    onCanPlay: handleReady,
    onError: handleError,
    onPlay: () => {
      playbackIntent.current = true;
    },
    onPause: () => {
      playbackIntent.current = false;
    },
  };

  return (
    <div
      className={classes(`resource-media-shell is-${state}`)}
      data-ui-resource-media={resourceId}
      data-ui-media-kind={kind}
      data-ui-media-state={state}
    >
      {delivery !== undefined ? (
        kind === "audio" ? <audio {...mediaProps} /> : <video {...mediaProps} />
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
            onClick={() => requestPlayback(false)}
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
          onClick={() => requestPlayback(true)}
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

function releaseDelivery(
  client: Client,
  delivery: PreparedResourceDelivery,
): void {
  void client.releaseResourceDelivery?.(delivery).catch(() => undefined);
}

function releaseActiveDelivery(
  client: Client,
  active: { current: PreparedResourceDelivery | undefined },
): void {
  const delivery = active.current;
  active.current = undefined;
  if (delivery !== undefined) releaseDelivery(client, delivery);
}
