import type {
  AttachmentDraft,
  ConversationAttachmentsReadModel,
} from "@wanex/product";
import type {
  OverlayHandle,
  SelectItem,
  SelectListTheme,
  TUI,
} from "@earendil-works/pi-tui";
import type { TuiAttachmentHost } from "../model.js";
import {
  TuiConfirmationOverlay,
  TuiInputOverlay,
  TuiSelectOverlay,
} from "./components.js";
import type { TuiFullScreenClient } from "./types.js";

const ADD_ATTACHMENT_ITEM = "tui:add-attachment";

export interface TuiAttachmentManager {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createTuiAttachmentManager(options: {
  readonly tui: Pick<TUI, "showOverlay">;
  readonly theme: SelectListTheme;
  readonly client: Pick<
    TuiFullScreenClient,
    "removeConversationAttachment"
  >;
  readonly host?: TuiAttachmentHost;
  readonly canOpen: () => boolean;
  readonly sessionId: () => string | undefined;
  readonly attachments: () =>
    | ConversationAttachmentsReadModel
    | undefined;
  readonly perform: (action: () => Promise<void>) => Promise<void>;
  readonly refreshCanonical: () => Promise<void>;
  readonly accepted: (message: string) => void;
  readonly rejected: (message: string) => void;
}): TuiAttachmentManager {
  let overlay: OverlayHandle | undefined;
  let active = false;
  let workflow = 0;

  return {
    open() {
      if (!options.canOpen() || active) return;
      active = true;
      const token = ++workflow;
      showManager(token);
    },
    close,
    isOpen: () => active,
  };

  function showManager(token: number): void {
    if (!isCurrent(token)) return;
    const attachments = options.attachments()?.attachments ?? [];
    const items: SelectItem[] = [
      ...(options.host === undefined
        ? []
        : [
            {
              value: ADD_ATTACHMENT_ITEM,
              label: "Add attachment",
              description: "Enter a local file path",
            },
          ]),
      ...attachments.map((attachment) => ({
        value: attachment.resourceId,
        label: attachmentLabel(attachment),
        description: `${attachment.previewKind} | ${formatBytes(attachment.sizeBytes)} | remove`,
      })),
    ];
    if (items.length === 0) {
      rejectAndClose(
        token,
        "No attachment path host is available and no drafts are prepared",
      );
      return;
    }
    const byId = new Map(
      attachments.map((attachment) => [attachment.resourceId, attachment]),
    );
    showOverlay(
      new TuiSelectOverlay("Attachments", items, {
        selectedIndex: 0,
        theme: options.theme,
        onCancel: close,
        onSelect(item) {
          if (item.value === ADD_ATTACHMENT_ITEM) {
            showPathInput(token);
            return;
          }
          const attachment = byId.get(item.value);
          if (attachment !== undefined) showRemoval(attachment, token);
        },
      }),
      token,
    );
  }

  function showPathInput(token: number): void {
    showOverlay(
      new TuiInputOverlay({
        title: "Add attachment",
        description:
          "The trusted Product host reads and prepares this file. The renderer does not retain its path.",
        onCancel: close,
        onSubmit(path) {
          if (path.trim().length === 0) return "path must not be empty";
          void addPath(path, token);
          return undefined;
        },
      }),
      token,
    );
  }

  async function addPath(path: string, token: number): Promise<void> {
    const host = options.host;
    if (host === undefined) {
      rejectAndClose(token, "Attachment path input is unavailable");
      return;
    }
    hideOverlay();
    await options.perform(async () => {
      try {
        const sessionId = options.sessionId();
        const result = await host.attachPath({
          path,
          ...(sessionId === undefined ? {} : { sessionId }),
        });
        if (!isCurrent(token)) return;
        await options.refreshCanonical();
        if (!isCurrent(token)) return;
        finish(token);
        options.accepted(
          result.label === undefined
            ? "Attachment prepared"
            : `Attachment prepared: ${result.label}`,
        );
      } catch (error) {
        rejectAndClose(token, safeErrorMessage(error));
      }
    });
  }

  function showRemoval(
    attachment: AttachmentDraft,
    token: number,
  ): void {
    showOverlay(
      new TuiConfirmationOverlay({
        title: `Remove ${attachmentLabel(attachment)}?`,
        details: [
          `Kind: ${attachment.previewKind}`,
          `Size: ${formatBytes(attachment.sizeBytes)}`,
        ],
        theme: options.theme,
        confirmLabel: "Remove attachment",
        onCancel: close,
        onConfirm() {
          void remove(attachment.resourceId, token);
        },
      }),
      token,
    );
  }

  async function remove(resourceId: string, token: number): Promise<void> {
    hideOverlay();
    await options.perform(async () => {
      try {
        const sessionId = options.sessionId();
        const envelope = await options.client.removeConversationAttachment({
          resourceId,
          ...(sessionId === undefined ? {} : { sessionId }),
        });
        if (!isCurrent(token)) return;
        if (!envelope.ok) {
          rejectAndClose(
            token,
            `removeConversationAttachment failed: ${envelope.error.message}`,
          );
          return;
        }
        await options.refreshCanonical();
        if (!isCurrent(token)) return;
        finish(token);
        options.accepted(
          envelope.value.removed
            ? "Attachment removed"
            : "Attachment was already absent",
        );
      } catch (error) {
        rejectAndClose(token, safeErrorMessage(error));
      }
    });
  }

  function showOverlay(
    component: Parameters<TUI["showOverlay"]>[0],
    token: number,
  ): void {
    if (!isCurrent(token)) return;
    hideOverlay();
    overlay = options.tui.showOverlay(component, {
      width: "80%",
      minWidth: 36,
      maxHeight: "70%",
      margin: 1,
    });
  }

  function hideOverlay(): void {
    overlay?.hide();
    overlay = undefined;
  }

  function rejectAndClose(token: number, message: string): void {
    if (!isCurrent(token)) return;
    finish(token);
    options.rejected(message);
  }

  function finish(token: number): void {
    if (!isCurrent(token)) return;
    hideOverlay();
    active = false;
    workflow += 1;
  }

  function close(): void {
    hideOverlay();
    active = false;
    workflow += 1;
  }

  function isCurrent(token: number): boolean {
    return active && workflow === token;
  }
}

function attachmentLabel(attachment: AttachmentDraft): string {
  return attachment.label ?? `${attachment.previewKind} attachment`;
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1_024) return `${sizeBytes} B`;
  if (sizeBytes < 1_024 * 1_024) return `${(sizeBytes / 1_024).toFixed(1)} KiB`;
  return `${(sizeBytes / (1_024 * 1_024)).toFixed(1)} MiB`;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
