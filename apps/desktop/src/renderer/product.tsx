import { Code2, MessageCircle } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { App as AssistantApp } from "@wanex/assistant-ui/client";
import type {
  AppModalState,
  Client as AssistantClient,
} from "@wanex/assistant-ui/client";
import type { CodingWorkbenchClient } from "./coding/client.js";
import { CodingWorkbench } from "./coding/workbench.js";
import type { RemoteProfileClient } from "./coding/workbench.js";

export function ProductRenderer({
  assistantClient,
  codingClient,
  remoteClient,
}: {
  readonly assistantClient: AssistantClient;
  readonly codingClient: CodingWorkbenchClient | undefined;
  readonly remoteClient: RemoteProfileClient | undefined;
}): ReactNode {
  const [surface, setSurface] = useState<"assistant" | "coding">("assistant");
  const [assistantModalActive, setAssistantModalActive] = useState(false);
  const observeAssistantModal = useCallback((state: AppModalState): void => {
    setAssistantModalActive(state.active);
  }, []);
  return (
    <div className="desktop-renderer" data-ui-product-renderer data-ui-surface={surface}>
      <WorkspaceRail
        surface={surface}
        inactive={surface === "assistant" && assistantModalActive}
        onSelect={setSurface}
      />
      <div className="workspace-viewport">
        {surface === "assistant" ? (
          <AssistantApp
            client={assistantClient}
            onModalStateChange={observeAssistantModal}
          />
        ) : codingClient === undefined ? (
          <section className="coding-unavailable" data-ui-coding-unavailable>
            <Code2 size={22} aria-hidden="true" />
            <h1>Coding is unavailable</h1>
            <p>This window does not have a trusted project host.</p>
            <button type="button" onClick={() => setSurface("assistant")}>
              Return to chat
            </button>
          </section>
        ) : (
          <CodingWorkbench client={codingClient} remoteClient={remoteClient} />
        )}
      </div>
    </div>
  );
}

export function WorkspaceRail({
  surface,
  inactive,
  onSelect,
}: {
  readonly surface: "assistant" | "coding";
  readonly inactive: boolean;
  readonly onSelect: (surface: "assistant" | "coding") => void;
}): ReactNode {
  return (
    <nav
      className="workspace-rail"
      aria-label="Workspaces"
      inert={inactive ? true : undefined}
      data-ui-workspace-rail-inactive={inactive ? "true" : "false"}
    >
      <button
        type="button"
        data-ui-product-surface="assistant"
        className={surface === "assistant" ? "is-selected" : ""}
        aria-current={surface === "assistant" ? "page" : undefined}
        aria-label="Open chat workspace"
        title="Chat"
        disabled={inactive}
        onClick={() => onSelect("assistant")}
      >
        <MessageCircle size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        data-ui-product-surface="coding"
        className={surface === "coding" ? "is-selected" : ""}
        aria-current={surface === "coding" ? "page" : undefined}
        aria-label="Open code workspace"
        title="Code"
        disabled={inactive}
        onClick={() => onSelect("coding")}
      >
        <Code2 size={18} aria-hidden="true" />
      </button>
    </nav>
  );
}
