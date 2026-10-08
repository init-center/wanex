import {
  AlertTriangle,
  Pencil,
  Plus,
  Server,
  Trash2,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { DesktopServerProfile } from "../../server/profile.js";
import type { ServerProfileClient } from "./client.js";
import { ServerProfileForm } from "./profile-form.js";

interface DialogLifetime {
  active: boolean;
  pending: boolean;
  refresh: { preferredId: string | undefined } | undefined;
}

export function ConnectionsDialog({
  client,
  profiles,
  loading,
  loadError,
  onProfilesChanged,
  onClose,
  returnFocusRef,
}: {
  readonly client: ServerProfileClient;
  readonly profiles: readonly DesktopServerProfile[];
  readonly loading: boolean;
  readonly loadError: string | undefined;
  readonly onProfilesChanged: (profiles: readonly DesktopServerProfile[]) => void;
  readonly onClose: () => void;
  readonly returnFocusRef?: RefObject<HTMLButtonElement | null>;
}): ReactNode {
  const [selectedId, setSelectedId] = useState(profiles[0]?.profileId);
  const [editing, setEditing] = useState<DesktopServerProfile | "new">();
  const [removePending, setRemovePending] = useState(false);
  const [pending, setPending] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [error, setError] = useState<string>();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const addRef = useRef<HTMLButtonElement | null>(null);
  const editRef = useRef<HTMLButtonElement | null>(null);
  const removeRef = useRef<HTMLButtonElement | null>(null);
  const cancelRemoveRef = useRef<HTMLButtonElement | null>(null);
  const refreshRef = useRef<HTMLButtonElement | null>(null);
  const focusAfterRender = useRef<(() => HTMLElement | null) | undefined>(undefined);
  const owner = useRef<DialogLifetime>({ active: false, pending: false, refresh: undefined });
  const selected = profiles.find((profile) => profile.profileId === selectedId);

  useEffect(() => {
    if (selectedId !== undefined && profiles.some(({ profileId }) => profileId === selectedId)) {
      return;
    }
    setSelectedId(profiles[0]?.profileId);
  }, [profiles, selectedId]);

  useLayoutEffect(() => {
    const current: DialogLifetime = { active: true, pending: false, refresh: undefined };
    owner.current = current;
    setPending(false);
    setRefreshRequired(false);
    setEditing(undefined);
    setRemovePending(false);
    setError(undefined);
    focusAfterRender.current = undefined;
    return () => { current.active = false; };
  }, [client]);

  useLayoutEffect(() => {
    if (pending) return;
    const target = focusAfterRender.current;
    focusAfterRender.current = undefined;
    target?.()?.focus();
  }, [pending, editing, removePending]);

  function cancelSection(): void {
    if (owner.current.pending) return;
    const target = removePending ? removeRef : editing === "new" ? addRef : editRef;
    focusAfterRender.current = () => refreshRequired ? refreshRef.current : target.current;
    setEditing(undefined);
    setRemovePending(false);
    if (!refreshRequired) setError(undefined);
  }

  async function run(action?: () => Promise<string | undefined>): Promise<void> {
    const current = owner.current;
    if (!current.active || current.pending || (action !== undefined && current.refresh !== undefined)) return;
    current.pending = true;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    setPending(true);
    setError(undefined);
    try {
      if (action !== undefined) {
        const preferredId = await action();
        if (!current.active) return;
        current.refresh = { preferredId };
      }
      if (!current.active) return;
      const next = await client.listProfiles();
      if (!current.active) return;
      const preferredId = current.refresh?.preferredId;
      current.refresh = undefined;
      setRefreshRequired(false);
      onProfilesChanged(next);
      setSelectedId(next.find(({ profileId }) => profileId === preferredId)?.profileId ?? next[0]?.profileId);
      setEditing(undefined);
      setRemovePending(false);
    } catch (reason) {
      if (current.active) {
        const message = reason instanceof Error ? reason.message : "Connection could not be updated";
        setRefreshRequired(current.refresh !== undefined);
        setError(current.refresh === undefined ? message : `Server updated, but connections could not be refreshed: ${message}`);
      }
    } finally {
      current.pending = false;
      if (current.active) {
        if (document.activeElement === dialogRef.current) {
          focusAfterRender.current = () => current.refresh !== undefined ? refreshRef.current
            : previousFocus?.isConnected && !previousFocus.matches(":disabled") ? previousFocus : addRef.current;
        }
        setPending(false);
      }
    }
  }

  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next && !owner.current.pending) onClose(); }}>
    <div className="connection-overlay" data-ui-connections-overlay>
      <Dialog.Overlay className="connection-backdrop" onPointerDown={(event) => {
        if (owner.current.pending) event.preventDefault();
      }} />
      <Dialog.Content
        ref={dialogRef}
        className="connections-dialog"
        data-ui-connections-dialog
        aria-busy={pending}
        onEscapeKeyDown={(event) => {
          if (owner.current.pending) event.preventDefault();
          else if (editing !== undefined || removePending) {
            event.preventDefault();
            cancelSection();
          }
        }}
        onInteractOutside={(event) => { if (owner.current.pending) event.preventDefault(); }}
        onPointerDownOutside={(event) => {
          if (!owner.current.pending) return;
          event.preventDefault();
          event.detail.originalEvent.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocusRef?.current;
          if (target?.isConnected && !target.disabled) target.focus();
        }}
      >
        <header className="connection-header">
          <div>
            <Dialog.Title>Connections</Dialog.Title>
            <Dialog.Description>Servers available to chat.</Dialog.Description>
          </div>
          <button
            type="button"
            className="connection-close"
            aria-label="Close connections"
            title="Close"
            disabled={pending}
            onClick={() => { if (!owner.current.pending) onClose(); }}
          >
            <X size={16} />
          </button>
        </header>
        {loadError === undefined && error === undefined ? null : (
          <div className="review-error" role="alert">
            <AlertTriangle size={15} />
            <span>{error ?? loadError}</span>
            {!refreshRequired ? null : <button ref={refreshRef} type="button" className="quiet-button" disabled={pending} onClick={() => void run()}>Refresh connections</button>}
          </div>
        )}
        <div className="server-profile-actions">
          <button
            ref={addRef}
            type="button"
            className="quiet-button"
            data-ui-server-profile-action="add"
            disabled={pending || refreshRequired}
            onClick={() => {
              if (owner.current.pending || owner.current.refresh !== undefined) return;
              setEditing("new");
              setRemovePending(false);
              setError(undefined);
            }}
          >
            <Plus size={14} /> Add server
          </button>
          {selected === undefined ? null : (
            <>
              <button
                ref={editRef}
                type="button"
                className="quiet-button"
                data-ui-server-profile-action="edit"
                disabled={pending || refreshRequired}
                onClick={() => {
                  if (owner.current.pending || owner.current.refresh !== undefined) return;
                  setEditing(selected);
                  setRemovePending(false);
                  setError(undefined);
                }}
              >
                <Pencil size={14} /> Edit
              </button>
              {removePending ? (
                <>
                  <button
                    type="button"
                    className="quiet-button danger-button"
                    data-ui-server-profile-action="confirm-remove"
                    disabled={pending || refreshRequired}
                    onClick={() => void run(async () => {
                      await client.removeProfile(selected.profileId);
                      return undefined;
                    })}
                  >
                    <Trash2 size={14} /> Remove server
                  </button>
                  <button
                    ref={cancelRemoveRef}
                    type="button"
                    className="quiet-button"
                    data-ui-server-profile-action="cancel-remove"
                    disabled={pending}
                    onClick={cancelSection}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  ref={removeRef}
                  type="button"
                  className="quiet-button"
                  data-ui-server-profile-action="remove"
                  disabled={pending || refreshRequired}
                  onClick={() => {
                    if (owner.current.pending || owner.current.refresh !== undefined) return;
                    focusAfterRender.current = () => cancelRemoveRef.current;
                    setEditing(undefined);
                    setRemovePending(true);
                    setError(undefined);
                  }}
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </>
          )}
        </div>
        {editing === undefined ? null : (
          <ServerProfileForm
            key={editing === "new" ? "new" : editing.profileId}
            profile={editing === "new" ? undefined : editing}
            pending={pending || refreshRequired}
            onCancel={cancelSection}
            onSave={(input) => void run(async () => {
              const saved = await client.saveProfile(input);
              return saved.profileId;
            })}
          />
        )}
        {loading ? (
          <p className="muted-copy">Loading connections...</p>
        ) : profiles.length === 0 ? (
          <div className="connections-empty">
            <Server size={18} />
            <p>No saved servers.</p>
          </div>
        ) : (
          <ul className="connections-list">
            {profiles.map((profile) => (
              <li key={profile.profileId}>
                <button
                  type="button"
                  className={profile.profileId === selectedId ? "session-item is-selected" : "session-item"}
                  data-ui-server-profile={profile.profileId}
                  disabled={pending || refreshRequired}
                  onClick={() => {
                    if (owner.current.pending || owner.current.refresh !== undefined) return;
                    setSelectedId(profile.profileId);
                    setEditing(undefined);
                    setRemovePending(false);
                    setError(undefined);
                  }}
                >
                  <span>{profile.name}</span>
                  <small>{profile.serverUrl}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog.Content>
    </div>
    </Dialog.Root>
  );
}
