import { Check, Wrench } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { ConversationViewModel, Snapshot } from "../../application/model.js";
import type { Client } from "../../client/contracts.js";
import type { ConversationRecoveryItem } from "@wanex/assistant";
import { classes } from "../classes.js";

export function CapabilityRequestCard({
  request,
  current,
  operationId,
  sessionId,
  client,
  onSnapshot,
  onError,
}: {
  readonly request: ConversationViewModel["historyRows"][number]["capabilityRequests"][number];
  readonly current: boolean;
  readonly operationId?: string;
  readonly sessionId?: string;
  readonly client: Client;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  readonly onError: (message: string) => void;
}): ReactNode {
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const setupAvailable = current && request.setupRequired && request.operation === "image.generate" && operationId !== undefined && sessionId !== undefined && client.setupImageGenerationAndContinue !== undefined;

  async function setup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!setupAvailable || client.setupImageGenerationAndContinue === undefined || operationId === undefined || sessionId === undefined || modelId.trim().length === 0) return;
    setBusy(true);
    try {
      const result = await client.setupImageGenerationAndContinue({
        operationId,
        sessionId,
        operation: "image.generate",
        imageGenerationModelId: modelId.trim(),
      });
      onSnapshot(result.snapshot);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Capability setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={classes("capability-card")} data-ui-capability={request.operation} data-capability-current={current ? "true" : "false"}>
      <div className={classes("card-heading")}><div><span className={classes("eyebrow")}>Capability</span><h2>{capabilityLabel(request.operation)}</h2></div><Wrench size={16} /></div>
      <ul>{request.requirements.map((item) => <li key={`${item.requirement}:${item.status}`}><span className={classes(`capability-status is-${item.status}`)} />{item.reason}</li>)}</ul>
      {setupAvailable ? (
        <form className={classes("capability-form")} data-ui-capability-form onSubmit={(event) => void setup(event)}>
          <label><span>Image generation model</span><input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="Model ID" required maxLength={256} /></label>
          <button type="submit" disabled={busy || modelId.trim().length === 0}><Check size={14} /> Configure and continue</button>
        </form>
      ) : request.setupRequired ? <p className={classes("muted")}>Configure this capability in Provider settings, then refresh the conversation.</p> : null}
    </aside>
  );
}

function capabilityLabel(value: string): string {
  return value === "image.generate" ? "Image generation setup" : `${value} setup`;
}
