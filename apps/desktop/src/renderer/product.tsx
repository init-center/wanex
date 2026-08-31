import { Code2, MessageCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { App as AssistantApp } from "@wanex/assistant-ui/client";
import type { Client as AssistantClient } from "@wanex/assistant-ui/client";
import type { CodingWorkbenchClient } from "./coding/client.js";
import { CodingWorkbench } from "./coding/workbench.js";

export function ProductRenderer({
  assistantClient,
  codingClient,
}: {
  readonly assistantClient: AssistantClient;
  readonly codingClient: CodingWorkbenchClient | undefined;
}): ReactNode {
  const [surface, setSurface] = useState<"assistant" | "coding">("assistant");
  return (
    <div className="desktop-renderer" data-ui-product-renderer data-ui-surface={surface}>
      <nav className="product-switcher" aria-label="Product">
        <button
          type="button"
          data-ui-product-surface="assistant"
          className={surface === "assistant" ? "is-selected" : ""}
          aria-current={surface === "assistant" ? "page" : undefined}
          onClick={() => setSurface("assistant")}
        >
          <MessageCircle size={15} aria-hidden="true" />
          <span>Chat</span>
        </button>
        <button
          type="button"
          data-ui-product-surface="coding"
          className={surface === "coding" ? "is-selected" : ""}
          aria-current={surface === "coding" ? "page" : undefined}
          onClick={() => setSurface("coding")}
        >
          <Code2 size={15} aria-hidden="true" />
          <span>Code</span>
        </button>
      </nav>
      {surface === "assistant" ? (
        <AssistantApp client={assistantClient} />
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
        <CodingWorkbench client={codingClient} />
      )}
    </div>
  );
}
