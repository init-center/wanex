import {
  AudioLines,
  File,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Globe2,
  ScrollText,
  SquareCode,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ConversationHistoryRow } from "../../application/model.js";
import type { Client } from "../../client/contracts.js";
import { ResourceMediaPlayback } from "./media.js";
import { ResourceImagePreview } from "./preview.js";
import { classes } from "../classes.js";

type ConversationResourcePart = Extract<
  ConversationHistoryRow["parts"][number],
  { readonly type: "resource" }
>;

export type ResourcePresentation = Pick<
  ConversationResourcePart,
  "resourceId" | "sha256" | "sizeBytes" | "kind" | "mediaType"
>;

export function ResourceCard({
  client,
  resource,
  label,
  sessionId,
}: {
  readonly client: Client;
  readonly resource: ResourcePresentation;
  readonly label?: string;
  readonly sessionId?: string;
}): ReactNode {
  const presentation = resourcePresentation(resource.kind);
  const resourceLabel = label ?? presentation.label;
  const previewable = resource.kind === "image";
  const playable = resource.kind === "audio" || resource.kind === "video";

  return (
    <div
      className={classes("resource-block")}
      data-ui-resource={resource.resourceId}
      data-ui-resource-kind={resource.kind}
      data-ui-resource-media-type={resource.mediaType ?? ""}
      data-ui-resource-sha256={resource.sha256}
      data-ui-resource-size={resource.sizeBytes}
    >
      {previewable ? (
        <ResourceImagePreview
          client={client}
          resourceId={resource.resourceId}
          sha256={resource.sha256}
          label={resourceLabel}
          {...(sessionId === undefined ? {} : { sessionId })}
        />
      ) : null}
      {playable ? (
        <ResourceMediaPlayback
          client={client}
          resourceId={resource.resourceId}
          sha256={resource.sha256}
          kind={resource.kind}
          label={resourceLabel}
          {...(sessionId === undefined ? {} : { sessionId })}
        />
      ) : null}
      <div className={classes("resource")} data-ui-resource-presentation={resource.kind}>
        <span className={classes("resource-kind-icon")} data-ui-resource-icon aria-hidden="true">
          <ResourceKindIcon kind={resource.kind} />
        </span>
        <span className={classes("resource-copy")}>
          <strong>{resourceLabel}</strong>
          <small>{resource.mediaType ?? presentation.fallbackMediaType} · {formatResourceSize(resource.sizeBytes)}</small>
        </span>
        {previewable || playable ? null : (
          <span className={classes("resource-availability")}>No preview</span>
        )}
      </div>
    </div>
  );
}

export function formatResourceSize(size: number): string {
  if (size < 1_024) return `${size} B`;
  if (size < 1_048_576) return `${(size / 1_024).toFixed(1)} KB`;
  return `${(size / 1_048_576).toFixed(1)} MB`;
}

function ResourceKindIcon({ kind }: { readonly kind: ResourcePresentation["kind"] }): ReactNode {
  switch (kind) {
    case "image":
      return <FileImage size={15} />;
    case "video":
      return <FileVideo size={15} />;
    case "audio":
      return <AudioLines size={15} />;
    case "document":
      return <FileText size={15} />;
    case "artifact":
      return <FileCode size={15} />;
    case "log":
      return <ScrollText size={15} />;
    case "patch":
      return <SquareCode size={15} />;
    case "url":
      return <Globe2 size={15} />;
    case "file":
      return <File size={15} />;
  }
}

function resourcePresentation(kind: ResourcePresentation["kind"]): {
  readonly label: string;
  readonly fallbackMediaType: string;
} {
  switch (kind) {
    case "image":
      return { label: "Image", fallbackMediaType: "image" };
    case "video":
      return { label: "Video", fallbackMediaType: "video" };
    case "audio":
      return { label: "Audio", fallbackMediaType: "audio" };
    case "document":
      return { label: "Document", fallbackMediaType: "document" };
    case "artifact":
      return { label: "Artifact", fallbackMediaType: "artifact" };
    case "log":
      return { label: "Log", fallbackMediaType: "log" };
    case "patch":
      return { label: "Patch", fallbackMediaType: "patch" };
    case "url":
      return { label: "Link", fallbackMediaType: "url" };
    case "file":
      return { label: "File", fallbackMediaType: "file" };
  }
}
