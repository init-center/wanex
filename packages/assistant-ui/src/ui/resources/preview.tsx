import { CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  Client,
  PreparedResourceDelivery,
} from "../../client/contracts.js";
import { classes } from "../classes.js";

type ResourcePreviewState = "loading" | "ready" | "failed";

export function ResourceImagePreview({
  client,
  resourceId,
  sha256,
  label,
  sessionId,
}: {
  readonly client: Client;
  readonly resourceId: string;
  readonly sha256: string;
  readonly label: string;
  readonly sessionId?: string;
}): ReactNode {
  const [delivery, setDelivery] = useState<
    PreparedResourceDelivery | undefined
  >();
  const activeDelivery = useRef<
    PreparedResourceDelivery | undefined
  >(undefined);
  const [state, setState] = useState<ResourcePreviewState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let prepared: PreparedResourceDelivery | undefined;
    releaseActiveDelivery(client, activeDelivery);
    setDelivery(undefined);
    setState("loading");
    if (client.prepareResourceDelivery === undefined) {
      setState("failed");
      return () => {
        active = false;
      };
    }
    void client.prepareResourceDelivery({
      resourceId,
      sha256,
      purpose: "preview",
      ...(sessionId === undefined ? {} : { sessionId }),
    }).then((nextDelivery) => {
      prepared = nextDelivery;
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
      if (prepared !== undefined && activeDelivery.current === prepared) {
        releaseActiveDelivery(client, activeDelivery);
      }
    };
  }, [attempt, client, resourceId, sessionId, sha256]);

  return (
    <span
      data-ui-resource-preview={resourceId}
      data-ui-preview-state={state}
    >
      {delivery !== undefined ? (
        <img
          className={classes("resource-preview")}
          src={delivery.url}
          alt={label}
          onLoad={() => setState("ready")}
          onError={() => {
            releaseActiveDelivery(client, activeDelivery);
            setDelivery(undefined);
            setState("failed");
          }}
        />
      ) : state === "loading" ? (
        <span
          className={classes("resource-preview-placeholder")}
          role="status"
          aria-label={`Loading ${label}`}
        >
          <LoaderCircle size={16} className={classes("is-running")} aria-hidden="true" />
        </span>
      ) : client.prepareResourceDelivery === undefined ? (
        <span
          className={classes("resource-preview-failed")}
          role="status"
          aria-label={`${label} preview is unavailable in this host`}
          title="Preview unavailable in this host"
        >
          <CircleAlert size={15} aria-hidden="true" />
          <span>Preview unavailable</span>
        </span>
      ) : (
        <button
          type="button"
          className={classes("resource-preview-failed")}
          data-ui-resource-preview-retry={resourceId}
          onClick={() => setAttempt((current) => current + 1)}
          aria-label={`Retry ${label}`}
          title={`Preview unavailable. Retry ${label}`}
        >
          <CircleAlert size={15} aria-hidden="true" />
          <span>Preview unavailable</span>
          <RotateCcw size={13} aria-hidden="true" />
        </button>
      )}
    </span>
  );
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
