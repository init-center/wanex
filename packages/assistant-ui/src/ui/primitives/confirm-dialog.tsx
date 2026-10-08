import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ReactNode } from "react";
import { usePortalContainer } from "./portal.js";
import styles from "./styles.module.css";

/**
 * In-product confirmation for irreversible actions. Focus starts on Cancel and
 * Escape cancels, so a stray Enter never destroys anything.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  qa,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone?: "danger" | "default";
  readonly busy?: boolean;
  readonly qa?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <AlertDialog.Portal container={usePortalContainer()}>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content className={styles.dialog}
          onEscapeKeyDown={(event) => { event.stopPropagation(); if (busy) event.preventDefault(); }}
          {...(qa === undefined ? {} : { "data-ui-confirm-dialog": qa })}>
          <AlertDialog.Title className={styles.dialogTitle}>{title}</AlertDialog.Title>
          <AlertDialog.Description className={styles.dialogDescription}>{description}</AlertDialog.Description>
          <div className={styles.dialogActions}>
            <AlertDialog.Cancel className={styles.button} data-variant="quiet" disabled={busy}>
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className={styles.button}
              data-variant={tone === "danger" ? "danger" : "primary"}
              disabled={busy}
              {...(qa === undefined ? {} : { "data-ui-confirm-action": qa })}
              onClick={(event) => { event.preventDefault(); onConfirm(); }}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
