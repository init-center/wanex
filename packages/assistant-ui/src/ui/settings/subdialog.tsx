import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useLayoutEffect, useRef, type ReactElement, type RefObject } from "react";
import { usePortalContainer } from "../primitives/portal.js";
import { classes } from "../classes.js";

export { Title, Description } from "@radix-ui/react-alert-dialog";

export function SettingsSubdialog({
  children, busy, isBusy, initialFocus, returnFocus, fallbackFocus, cancel,
}: {
  readonly children: ReactElement;
  readonly busy: boolean;
  readonly isBusy: () => boolean;
  readonly initialFocus: RefObject<HTMLButtonElement | null>;
  readonly returnFocus: RefObject<HTMLButtonElement | null>;
  readonly fallbackFocus?: RefObject<HTMLButtonElement | null>;
  readonly cancel: () => void | Promise<void>;
}): ReactElement {
  const content = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (busy) {
      pendingFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      content.current?.focus();
    } else if (pendingFocus.current !== null) {
      focus(pendingFocus.current, initialFocus.current);
      pendingFocus.current = null;
    }
  }, [busy, initialFocus]);

  return (
    <AlertDialog.Root open onOpenChange={(open) => { if (!open && !isBusy()) void cancel(); }}>
      <AlertDialog.Portal container={usePortalContainer()}>
        <AlertDialog.Overlay
          className={classes("settings-subdialog-layer")}
          data-ui-settings-subdialog
          onPointerDown={(event) => {
            // AlertDialog prevents dismissal, not the browser's focus reset on
            // a non-focusable backdrop. Keep focus inside the active modal.
            if (event.target === event.currentTarget) event.preventDefault();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Escape") return;
            if (!event.defaultPrevented && !isBusy()) void cancel();
            event.preventDefault();
          }}
        >
          <AlertDialog.Content
            asChild
            ref={(node) => { content.current = node; }}
            aria-busy={busy}
            onOpenAutoFocus={(event) => { event.preventDefault(); initialFocus.current?.focus(); }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              focus(returnFocus.current, fallbackFocus?.current);
            }}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!isBusy()) void cancel();
            }}
          >
            {children}
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function focus(target: HTMLElement | null, fallback: HTMLElement | null | undefined): void {
  const available = (value: HTMLElement | null | undefined): value is HTMLElement =>
    value?.isConnected === true && !value.matches(":disabled") && value.closest("[inert]") === null;
  if (available(target)) target.focus();
  else if (available(fallback)) fallback.focus();
}
