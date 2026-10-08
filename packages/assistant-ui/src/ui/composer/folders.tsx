import { FolderLock, FolderOpen, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Snapshot } from "../../application/model.js";
import { classes } from "../classes.js";
import type { DispatchAction } from "../shared/action.js";
import { requestKey } from "../shared/request-key.js";

/** Folders the user added to the current conversation. */
export function FolderTray({
  snapshot,
  busy,
  dispatch,
}: {
  readonly snapshot: Snapshot;
  readonly busy: boolean;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const { folders } = snapshot.view.workspaceFolders;
  if (folders.length === 0) return null;
  const sessionId = snapshot.conversation.sessionId;
  return (
    <ul className={classes("folder-tray")} aria-label="Folders in this conversation" data-ui-workspace-folders>
      {folders.map((folder) => (
        <li key={folder.grantId} className={classes("folder-chip")} data-ui-workspace-folder={folder.access}>
          {folder.access === "read" ? <FolderLock size={14} aria-hidden="true" /> : <FolderOpen size={14} aria-hidden="true" />}
          <span className={classes("folder-chip-name")}>{folder.name}</span>
          <small>{folder.access === "read" ? "Read only" : "Can edit"}</small>
          <button
            type="button"
            aria-label={`Remove folder ${folder.name}`}
            title="Remove folder"
            disabled={busy}
            onClick={() => void dispatch({
              type: "revoke-workspace-folder",
              input: {
                ...(sessionId === undefined ? {} : { sessionId }),
                grantId: folder.grantId,
                idempotencyKey: requestKey("folder-remove"),
              },
            })}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
