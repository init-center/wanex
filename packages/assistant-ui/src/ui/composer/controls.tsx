import {
  ArrowUp,
  Bot,
  ChevronDown,
  Command,
  FilePlus2,
  FolderLock,
  FolderOpen,
  History,
  ListPlus,
  Paperclip,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import {
  conversationModelEndpoints,
  conversationModelLabels,
} from "../../application/conversation/endpoints.js";
import type { Snapshot } from "../../application/model.js";
import type { Client } from "../../client/contracts.js";
import { classes } from "../classes.js";
import { formatResourceSize } from "../resources/card.js";
import { ResourceImagePreview } from "../resources/preview.js";
import type { DispatchAction } from "../shared/action.js";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "../primitives/menu.js";
import { requestKey } from "../shared/request-key.js";
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

/**
 * One "Add" menu replaces the separate attachment, folder, command and
 * workflow buttons: the composer shows a single entry point and the menu says
 * what each item does.
 */
export function ComposerAddMenu({
  snapshot,
  busy,
  folderBusy,
  uploadFiles,
  openWorkflows,
  openCommands,
  dispatch,
}: {
  readonly snapshot: Snapshot;
  readonly busy: boolean;
  readonly folderBusy: boolean;
  readonly uploadFiles: (files: readonly File[]) => Promise<void>;
  readonly openWorkflows: () => void;
  readonly openCommands: (returnTarget: HTMLElement | null) => void;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const state = snapshot.view;
  const fileInput = useRef<HTMLInputElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const folders = state.workspaceFolders;
  const sessionId = snapshot.conversation.sessionId;
  const session = sessionId === undefined ? {} : { sessionId };
  const canAttach = state.conversationAttachmentCanUpload && !busy;
  const canAddFolder = folders.available && folders.canPick;
  const hasFolderSection = canAddFolder || (folders.available && folders.recent.length > 0);
  const commandsReady = state.commandPalette.state === "ready" && state.commandPalette.rows.length > 0;

  function grant(access: "read" | "read_write"): void {
    void dispatch({
      type: "grant-workspace-folder",
      input: { ...session, access, idempotencyKey: requestKey("folder-add") },
    });
  }

  return (
    <>
      <input
        ref={fileInput}
        className={classes("sr-only")}
        data-ui-attachment-input
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        accept={state.conversationAttachmentAccept}
        disabled={!canAttach}
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (files !== null) void uploadFiles(Array.from(files));
          event.currentTarget.value = "";
        }}
      />
      <Menu>
        <MenuTrigger asChild>
          <button
            ref={trigger}
            type="button"
            className={classes("icon-button")}
            data-ui-action="open-add-menu"
            aria-label="Add"
            title="Add files, folders or commands"
            disabled={busy}
          >
            <Plus size={18} />
          </button>
        </MenuTrigger>
        <MenuContent label="Add" data-ui-add-menu>
          <MenuItem
            icon={<Paperclip size={16} />}
            title="Add photos or files"
            description={canAttach ? "Attach them to your next message" : state.conversationAttachmentMessage}
            disabled={!canAttach}
            data-ui-action="add-attachment"
            onSelect={() => fileInput.current?.click()}
          />
          {hasFolderSection ? (
            <>
              <MenuSeparator />
              {canAddFolder ? (
                <>
                  <MenuItem
                    icon={<FolderOpen size={16} />}
                    title="Add folder"
                    description="The assistant can read and edit files"
                    disabled={folderBusy}
                    data-ui-action="grant-workspace-folder"
                    onSelect={() => grant("read_write")}
                  />
                  <MenuItem
                    icon={<FolderLock size={16} />}
                    title="Add folder, read only"
                    description="The assistant can only read files"
                    disabled={folderBusy}
                    data-ui-action="grant-workspace-folder-read"
                    onSelect={() => grant("read")}
                  />
                </>
              ) : null}
              {folders.recent.length === 0 ? null : (
                <>
                  <MenuLabel>Recent folders</MenuLabel>
                  {folders.recent.map((folder) => (
                    <MenuItem
                      key={folder.recentRef}
                      icon={<History size={16} />}
                      title={folder.name}
                      description={folder.access === "read" ? "Read only" : "Can edit"}
                      disabled={folderBusy}
                      data-ui-action="regrant-workspace-folder"
                      onSelect={() => void dispatch({
                        type: "regrant-workspace-folder",
                        input: { ...session, recentRef: folder.recentRef, idempotencyKey: requestKey("folder-reuse") },
                      })}
                    />
                  ))}
                </>
              )}
            </>
          ) : null}
          <MenuSeparator />
          <MenuItem
            icon={<Command size={16} />}
            title="Commands"
            description="Run an action from an installed extension"
            disabled={!commandsReady}
            data-ui-action="open-commands"
            onSelect={() => openCommands(trigger.current)}
          />
          <MenuItem
            icon={<Sparkles size={16} />}
            title="Workflows"
            description="Plan first, set a goal, or ask aside"
            data-ui-action="open-workflows"
            onSelect={openWorkflows}
          />
        </MenuContent>
      </Menu>
    </>
  );
}

/** Trailing model control; configuring a model is always one click away. */
export function ComposerModelPicker({
  snapshot,
  endpoints,
  busy,
  dispatch,
  openSettings,
}: {
  readonly snapshot: Snapshot;
  readonly endpoints: ReturnType<typeof conversationModelEndpoints>;
  readonly busy: boolean;
  readonly dispatch: DispatchAction;
  readonly openSettings: () => void;
}): ReactNode {
  const state = snapshot.view;
  if (endpoints.length === 0) {
    return (
      <button type="button" className={classes("model-picker is-setup")} onClick={openSettings} data-ui-action="open-settings">
        <Bot size={15} aria-hidden="true" /> Connect a model
      </button>
    );
  }
  const labels = conversationModelLabels(endpoints);
  const active = endpoints.find((endpoint) => endpoint.id === state.settings.profile.activeModelEndpointId);
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={classes("model-picker")}
          data-ui-model-selector
          data-ui-active-endpoint={state.settings.profile.activeModelEndpointId ?? ""}
          data-ui-model-endpoints={endpoints.map((endpoint) => endpoint.id).join(" ")}
          aria-label="Model"
          disabled={busy}
        >
          <span>{active === undefined ? "Choose a model" : labels.get(active.id)}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </MenuTrigger>
      <MenuContent label="Model" align="end">
        <MenuRadioGroup
          value={state.settings.profile.activeModelEndpointId ?? ""}
          onValueChange={(endpointId) => void dispatch({
            type: "set-active-model-endpoint",
            input: { endpointId },
          })}
        >
          {endpoints.map((endpoint) => (
            <MenuRadioItem key={endpoint.id} value={endpoint.id} title={labels.get(endpoint.id) ?? endpoint.model.id} data-ui-endpoint={endpoint.id} />
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
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
