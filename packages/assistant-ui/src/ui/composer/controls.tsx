import {
  ArrowUp,
  Bot,
  Command,
  FilePlus2,
  ListPlus,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  conversationModelEndpoints,
  conversationModelLabel,
} from "../../application/conversation/endpoints.js";
import type { Snapshot } from "../../application/model.js";
import type { Client } from "../../client/contracts.js";
import { classes } from "../classes.js";
import { formatResourceSize } from "../resources/card.js";
import { ResourceImagePreview } from "../resources/preview.js";
import type { DispatchAction } from "../shared/action.js";
import { IconButton } from "../shared/icon-button.js";
import type { ComposerMode } from "./model.js";

export function AttachmentTray({
  snapshot,
  client,
  busy,
  dispatch,
}: {
  readonly snapshot: Snapshot;
  readonly client: Client;
  readonly busy: boolean;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const attachments = snapshot.view.conversationAttachments;
  if (attachments.length === 0) return null;
  return (
    <ol className={classes("attachment-tray")} aria-label="Attachments">
      {attachments.map((attachment) => (
        <li
          key={attachment.resourceId}
          className={classes("attachment")}
          data-ui-attachment={attachment.resourceId}
          data-ui-resource-id={attachment.resourceId}
        >
          {attachment.previewKind === "image" ? (
            <ResourceImagePreview
              client={client}
              resourceId={attachment.resourceId}
              sha256={attachment.sha256}
              label={attachment.label ?? "Image attachment"}
              {...(snapshot.conversation.sessionId === undefined
                ? {}
                : { sessionId: snapshot.conversation.sessionId })}
            />
          ) : (
            <span className={classes("attachment-icon")}><FilePlus2 size={16} /></span>
          )}
          <span className={classes("attachment-copy")}>
            <strong>{attachment.label ?? attachment.resourceKind}</strong>
            <small>{attachment.mediaType ?? attachment.resourceKind} · {formatResourceSize(attachment.sizeBytes)}</small>
          </span>
          <IconButton
            label={`Remove ${attachment.label ?? "attachment"}`}
            qa="remove-conversation-attachment"
            disabled={busy}
            onClick={() => void dispatch({
              type: "remove-conversation-attachment",
              input: {
                resourceId: attachment.resourceId,
                ...(snapshot.conversation.sessionId === undefined
                  ? {}
                  : { sessionId: snapshot.conversation.sessionId }),
              },
            })}
          >
            <X size={15} />
          </IconButton>
        </li>
      ))}
    </ol>
  );
}

export function ComposerMetadata({
  snapshot,
  endpoints,
  busy,
  dispatch,
  uploadFiles,
  openWorkflows,
  openCommands,
}: {
  readonly snapshot: Snapshot;
  readonly endpoints: ReturnType<typeof conversationModelEndpoints>;
  readonly busy: boolean;
  readonly dispatch: DispatchAction;
  readonly uploadFiles: (files: readonly File[]) => Promise<void>;
  readonly openWorkflows: () => void;
  readonly openCommands: () => void;
}): ReactNode {
  const state = snapshot.view;
  return (
    <div className={classes("composer-meta")}>
      <label className={classes("model-picker")} data-ui-model-selector>
        <Bot size={14} aria-hidden="true" />
        <span className={classes("sr-only")}>Model</span>
        <select
          name="endpointId"
          value={state.settings.profile.activeModelEndpointId ?? ""}
          onChange={(event) => void dispatch({
            type: "set-active-model-endpoint",
            input: { endpointId: event.target.value },
          })}
          disabled={busy || endpoints.length === 0}
        >
          {endpoints.map((endpoint) => (
            <option value={endpoint.id} key={endpoint.id}>
              {conversationModelLabel(endpoint)}
            </option>
          ))}
        </select>
      </label>
      <label className={classes("attachment-button")} title="Add attachment">
        <Paperclip size={15} /><span className={classes("sr-only")}>Add attachment</span>
        <input
          data-ui-attachment-input
          type="file"
          multiple
          accept={state.conversationAttachmentAccept}
          disabled={busy || !state.conversationAttachmentCanUpload}
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files !== null) void uploadFiles(Array.from(files));
            event.currentTarget.value = "";
          }}
        />
      </label>
      <IconButton
        label="Commands"
        qa="open-commands"
        disabled={busy || state.commandPalette.state !== "ready" || state.commandPalette.rows.length === 0}
        onClick={openCommands}
      >
        <Command size={15} />
      </IconButton>
      <button
        type="button"
        className={classes("workflows-button")}
        data-ui-open-workflows
        onClick={openWorkflows}
        disabled={busy}
      >
        <Sparkles size={14} /> Workflows
      </button>
      <span className={classes("composer-hint")}>
        {state.conversationAttachmentMessage}
      </span>
    </div>
  );
}

export function ComposerModeSwitch({
  mode,
  canQueue,
  canGuide,
  busy,
  setMode,
}: {
  readonly mode: ComposerMode;
  readonly canQueue: boolean;
  readonly canGuide: boolean;
  readonly busy: boolean;
  readonly setMode: (mode: ComposerMode) => void;
}): ReactNode {
  return (
    <div className={classes("mode-switch")} role="group" aria-label="Active response mode" data-ui-mode-switch>
      <button
        type="button"
        data-ui-composer-mode="queue"
        className={classes(mode === "queue" ? "is-active" : "")}
        disabled={!canQueue || busy}
        onClick={() => setMode("queue")}
      >
        <ListPlus size={14} /> Queue after current
      </button>
      <button
        type="button"
        data-ui-composer-mode="steer"
        className={classes(mode === "steer" ? "is-active" : "")}
        disabled={!canGuide || busy}
        onClick={() => setMode("steer")}
      >
        <ArrowUp size={14} /> Guide current
      </button>
    </div>
  );
}
