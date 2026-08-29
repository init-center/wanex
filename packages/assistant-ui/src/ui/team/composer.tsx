import { Send } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { Snapshot } from "../../application/model.js";
import type { DispatchAction } from "../shared/action.js";
import { classes } from "../classes.js";

export function TeamComposer({
  snapshot,
  dispatch,
}: {
  readonly snapshot: Snapshot;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const draftRevision = useRef(0);
  const idempotency = useRef<{
    readonly conversationId: string;
    readonly revision: number;
    readonly key: string;
  } | undefined>(undefined);
  const conversationId = snapshot.team.conversationId;
  const page = snapshot.team.page;
  const availability = teamComposerAvailability(snapshot);
  const coordinated = page?.conversation.mode === "coordinated";
  const coordinator = coordinated
    ? page.participants.find(
        (participant) =>
          participant.participantId === page.conversation.coordinatorParticipantId,
      )
    : undefined;

  useEffect(() => {
    setDraft("");
    draftRevision.current += 1;
    idempotency.current = undefined;
  }, [conversationId]);

  function updateDraft(value: string): void {
    draftRevision.current += 1;
    idempotency.current = undefined;
    setDraft(value);
  }

  function submit(event?: FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    const text = draft.trim();
    if (
      conversationId === undefined ||
      !availability.canSubmit ||
      sending ||
      text.length === 0
    ) return;
    const revision = draftRevision.current;
    const key = idempotencyForRevision(conversationId, revision);
    setSending(true);
    void dispatch({
      type: "submit-team-round",
      input: {
        conversationId,
        text,
        idempotencyKey: key,
      },
    }).then((succeeded) => {
      if (succeeded && draftRevision.current === revision) {
        draftRevision.current += 1;
        idempotency.current = undefined;
        setDraft("");
      }
    }).finally(() => setSending(false));
  }

  function idempotencyForRevision(
    selectedConversationId: string,
    revision: number,
  ): string {
    const current = idempotency.current;
    if (
      current?.conversationId === selectedConversationId &&
      current.revision === revision
    ) return current.key;
    const key = createIdempotencyKey();
    idempotency.current = {
      conversationId: selectedConversationId,
      revision,
      key,
    };
    return key;
  }

  return (
    <div className={classes("team-composer-dock")} data-ui-team-composer-dock>
      <form
        className={classes("team-composer-surface")}
        data-ui-team-composer
        onSubmit={submit}
      >
        <textarea
          name="team-message"
          value={draft}
          onChange={(event) => updateDraft(event.target.value)}
          onKeyDown={(event) => submitFromKeyboard(event, submit)}
          placeholder={coordinated ? "Message coordinator" : "Message group"}
          aria-label="Message the group"
          disabled={!availability.canDraft || sending}
        />
        <button
          type="submit"
          className={classes("send-button")}
          disabled={!availability.canSubmit || sending || draft.trim().length === 0}
          aria-label="Send to group"
          title="Send to group"
        >
          {sending ? <span className={classes("spinner")} /> : <Send size={17} />}
        </button>
      </form>
      <div className={classes("team-composer-meta")} aria-live="polite">
        <span>{availability.message}</span>
        {page === undefined ? null : (
          <span>{coordinated
            ? coordinator?.displayName ?? "Coordinator required"
            : `${page.conversation.activeAgentCount} active agent${page.conversation.activeAgentCount === 1 ? "" : "s"}`}</span>
        )}
      </div>
    </div>
  );
}

function teamComposerAvailability(snapshot: Snapshot): {
  readonly canDraft: boolean;
  readonly canSubmit: boolean;
  readonly message: string;
} {
  const team = snapshot.team;
  const page = team.page;
  if (team.state !== "ready" || page === undefined) {
    return {
      canDraft: false,
      canSubmit: false,
      message: team.message ?? "Group conversation is unavailable",
    };
  }
  if (page.conversation.state !== "open") {
    return { canDraft: false, canSubmit: false, message: "This group is closed" };
  }
  if (page.conversation.activeAgentCount === 0) {
    return { canDraft: true, canSubmit: false, message: "Add an agent before sending" };
  }
  if (
    page.conversation.mode === "coordinated" &&
    page.conversation.coordinatorParticipantId === undefined
  ) {
    return {
      canDraft: true,
      canSubmit: false,
      message: "Choose a coordinator before sending",
    };
  }
  if (page.conversation.activeRound) {
    return { canDraft: true, canSubmit: false, message: "Waiting for the current round to finish" };
  }
  if (!snapshot.view.providerRunGate.canRun) {
    return { canDraft: true, canSubmit: false, message: "Connect a model in Settings to send" };
  }
  return {
    canDraft: true,
    canSubmit: true,
    message: page.conversation.mode === "coordinated"
      ? "One coordinated response"
      : "All active agents may respond",
  };
}

function submitFromKeyboard(
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
  submit: () => void,
): void {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  submit();
}

function createIdempotencyKey(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid === undefined) {
    throw new Error("The browser client requires crypto.randomUUID");
  }
  return `team-round:${randomUuid.call(globalThis.crypto)}`;
}
