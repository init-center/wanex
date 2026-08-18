import {
  Archive,
  Check,
  Ellipsis,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type {
  Action,
  RecentSessionRow,
} from "../../application/model.js";
import { classes } from "../classes.js";
import type { DispatchAction } from "../shared/action.js";

export function SessionRow({
  session,
  dispatch,
  pendingActionTypes,
  menuOpen,
  editing,
  onSelect,
  setMenuOpen,
  beginRename,
  finishRename,
}: {
  readonly session: RecentSessionRow;
  readonly dispatch: DispatchAction;
  readonly pendingActionTypes: ReadonlySet<Action["type"]>;
  readonly menuOpen: boolean;
  readonly editing: boolean;
  readonly onSelect?: () => void;
  readonly setMenuOpen: (open: boolean) => void;
  readonly beginRename?: () => void;
  readonly finishRename?: () => void;
}): ReactNode {
  const rowRef = useRef<HTMLLIElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState(session.label);

  useEffect(() => {
    if (!editing) {
      setTitle(session.label);
      return;
    }
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editing, session.label]);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();

    function closeFromOutside(event: PointerEvent): void {
      if (event.target instanceof Node && !rowRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function closeFromEscape(event: globalThis.KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
      menuTriggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape, true);
    };
  }, [menuOpen, setMenuOpen]);

  async function submitRename(): Promise<void> {
    const normalizedTitle = title.trim();
    if (
      normalizedTitle.length === 0 ||
      pendingActionTypes.has("rename-session")
    ) return;
    if (normalizedTitle === session.label) {
      finishRename?.();
      return;
    }
    const succeeded = await dispatch({
      type: "rename-session",
      input: {
        sessionId: session.sessionId,
        title: normalizedTitle,
        expectedRevision: session.revision,
      },
    });
    if (succeeded) finishRename?.();
  }

  function cancelRename(): void {
    setTitle(session.label);
    finishRename?.();
  }

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submitRename();
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelRename();
      return;
    }
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      void submitRename();
    }
  }

  function handleRenameBlur(event: FocusEvent<HTMLFormElement>): void {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    cancelRename();
  }

  const actionBusy = session.archived
    ? pendingActionTypes.has("restore-session")
    : pendingActionTypes.has("archive-session");
  const renameBusy = pendingActionTypes.has("rename-session");

  return (
    <li
      ref={rowRef}
      className={classes(`session-row ${session.selected ? "is-selected" : ""}`)}
      data-ui-session={session.sessionId}
      data-ui-session-archived={session.archived ? "true" : "false"}
    >
      {editing ? (
        <form
          className={classes("session-rename")}
          data-ui-session-rename={session.sessionId}
          onSubmit={handleRenameSubmit}
          onBlur={handleRenameBlur}
        >
          <input
            ref={renameInputRef}
            value={title}
            disabled={renameBusy}
            aria-label={`Rename ${session.label}`}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={handleRenameKeyDown}
          />
          <button
            type="submit"
            className={classes("session-inline-action")}
            disabled={renameBusy || title.trim().length === 0}
            aria-label="Save conversation name"
            title="Save"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            className={classes("session-inline-action")}
            disabled={renameBusy}
            aria-label="Cancel rename"
            title="Cancel"
            onClick={cancelRename}
          >
            <X size={14} />
          </button>
        </form>
      ) : (
        <>
          {session.archived ? (
            <div className={classes("session-primary session-primary-static")}>
              <span data-ui-session-title>{session.label}</span>
              <small>{session.status}</small>
            </div>
          ) : (
            <button
              type="button"
              className={classes("session-primary")}
              data-ui-session-select={session.sessionId}
              aria-current={session.selected ? "true" : undefined}
              onClick={onSelect}
            >
              <span data-ui-session-title>{session.label}</span>
              <small>{session.status}</small>
            </button>
          )}
          <button
            ref={menuTriggerRef}
            type="button"
            className={classes("session-menu-trigger")}
            data-ui-session-menu-trigger={session.sessionId}
            aria-label={`Actions for ${session.label}`}
            title={`Actions for ${session.label}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={actionBusy || renameBusy}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Ellipsis size={15} />
          </button>
          {menuOpen ? (
            <div
              ref={menuRef}
              className={classes("session-menu")}
              role="menu"
              aria-label={`Actions for ${session.label}`}
              data-ui-session-menu={session.sessionId}
            >
              {session.archived ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={actionBusy}
                  onClick={() => {
                    setMenuOpen(false);
                    void dispatch({
                      type: "restore-session",
                      input: {
                        sessionId: session.sessionId,
                        expectedRevision: session.revision,
                      },
                    });
                  }}
                >
                  <RotateCcw size={14} /> Restore
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={renameBusy}
                    onClick={() => {
                      setMenuOpen(false);
                      beginRename?.();
                    }}
                  >
                    <Pencil size={14} /> Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={actionBusy}
                    onClick={() => {
                      setMenuOpen(false);
                      void dispatch({
                        type: "archive-session",
                        input: {
                          sessionId: session.sessionId,
                          expectedRevision: session.revision,
                        },
                      });
                    }}
                  >
                    <Archive size={14} /> Archive
                  </button>
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}
