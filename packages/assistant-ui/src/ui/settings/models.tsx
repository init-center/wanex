import { RefreshCw, Settings2, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Snapshot } from "../../application/model.js";
import type {
  Client,
  Provider,
  ProviderList,
  ProviderPresetId,
  SaveProviderRequest,
} from "../../client/contracts.js";
import { classes } from "../classes.js";
import { Select } from "../primitives/select.js";

const providerLabels: Readonly<Record<ProviderPresetId, string>> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  "openai-compatible": "Custom OpenAI-compatible",
};

/**
 * Providers and their models. During first run the same form is the whole
 * onboarding step, so it keeps one column in the order a person fills it in.
 */
export function ModelsSection({
  client,
  onboarding,
  onSnapshot,
  onError,
}: {
  readonly client: Client;
  readonly onboarding: boolean;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  readonly onError: (message: string | undefined) => void;
}): ReactNode {
  const [providers, setProviders] = useState<ProviderList>();
  const [editing, setEditing] = useState<Provider>();
  const [presetId, setPresetId] = useState<ProviderPresetId>("openai");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    if (client.listProviders === undefined) return;
    let active = true;
    setError(undefined);
    void client.listProviders().then((list) => {
      if (active) setProviders(list);
    }).catch((reason: unknown) => {
      if (active) setError(errorMessage(reason));
    });
    return () => {
      active = false;
    };
  }, [client]);

  const providerManagementAvailable =
    client.listProviders !== undefined &&
    client.saveProvider !== undefined &&
    client.removeProvider !== undefined;
  const configured = providers?.providers ?? [];
  // A default only needs choosing once there is something to choose between.
  const offerDefaultChoice = configured.some((provider) => provider.connectionId !== editing?.connectionId);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (client.saveProvider === undefined || busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setError(undefined);
    setStatus(undefined);
    onError(undefined);
    try {
      const request = providerRequest(new FormData(form), presetId, editing);
      const result = await client.saveProvider(request);
      setProviders(result.providers);
      onSnapshot(result.snapshot);
      setEditing(undefined);
      setPresetId("openai");
      form.reset();
      setStatus("Provider saved");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove(provider: Provider): Promise<void> {
    if (client.removeProvider === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    setStatus(undefined);
    onError(undefined);
    try {
      const result = await client.removeProvider({ connectionId: provider.connectionId });
      setProviders(result.providers);
      onSnapshot(result.snapshot);
      if (editing?.connectionId === provider.connectionId) setEditing(undefined);
      setStatus("Provider removed");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function refreshCatalog(): Promise<void> {
    if (client.refreshModelCatalog === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    setStatus(undefined);
    onError(undefined);
    try {
      const result = await client.refreshModelCatalog();
      setStatus(`Model list updated · ${result.modelCount} models`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(provider: Provider): void {
    if (provider.presetId === undefined) return;
    setEditing(provider);
    setPresetId(provider.presetId);
    setStatus(undefined);
  }

  return (
    <section
      className={classes("settings-section models-section")}
      data-ui-provider-settings
      data-ui-provider-count={providers === undefined ? undefined : configured.length}
    >
      {onboarding ? null : (
        <div className={classes("settings-heading")}>
          <div><Settings2 size={15} /><strong>Models</strong></div>
          {client.refreshModelCatalog === undefined ? null : (
            <button
              type="button"
              className={classes("settings-quiet-action")}
              disabled={busy}
              onClick={() => void refreshCatalog()}
              title="Fetch the latest list of known models"
            >
              <RefreshCw size={14} aria-hidden="true" /> Update model list
            </button>
          )}
        </div>
      )}
      {!providerManagementAvailable ? (
        <p className={classes("muted")}>Provider setup is managed by this host.</p>
      ) : (
        <>
          {providers === undefined && error === undefined ? (
            <p className={classes("settings-loading")} role="status" data-ui-provider-loading>
              Loading providers...
            </p>
          ) : configured.length === 0 ? null : (
            <ProviderList providers={configured} busy={busy} beginEdit={beginEdit} remove={remove} />
          )}
          {onboarding ? null : (
            <h3 className={classes("settings-subheading")}>
              {editing === undefined
                ? configured.length === 0 ? "Add a provider" : "Add another provider"
                : `Edit ${providerName(editing)}`}
            </h3>
          )}
          <form className={classes("settings-form")} data-ui-provider-form onSubmit={(event) => void save(event)} autoComplete="off">
            <label>
              <span>Provider</span>
              <Select
                name="presetId"
                label="Provider"
                value={presetId}
                disabled={busy || editing !== undefined}
                onValueChange={(value) => setPresetId(value as ProviderPresetId)}
                options={Object.entries(providerLabels).map(([value, label]) => ({ value, label }))}
              />
            </label>
            {presetId === "openai-compatible" ? (
              <label>
                <span>Base URL</span>
                <input name="baseUrl" type="url" required maxLength={2048} defaultValue={editing?.baseUrl ?? ""} />
              </label>
            ) : null}
            <label>
              <span>{editing === undefined ? "API key" : "New API key (optional)"}</span>
              <input
                name="credential"
                type="password"
                data-ui-initial-focus={onboarding ? "true" : undefined}
                required={editing === undefined}
                maxLength={16384}
                autoComplete="new-password"
              />
              <small className={classes("field-hint")}>Stored securely on this device.</small>
            </label>
            <label>
              <span>Model</span>
              <input
                name="conversationModelId"
                required
                maxLength={256}
                placeholder={modelPlaceholder(presetId)}
                defaultValue={conversationEndpoint(editing)?.model.id ?? ""}
                key={`${editing?.connectionId ?? "new"}:conversation`}
              />
            </label>
            {presetId === "openai" || presetId === "openai-compatible" ? (
              <details className={classes("settings-advanced")} data-ui-provider-advanced>
                <summary>Advanced</summary>
                <div className={classes("advanced-fields")}>
                  {presetId === "openai-compatible" ? (
                    <>
                      <label className={classes("checkbox")}><input name="conversationInputImage" type="checkbox" defaultChecked={conversationEndpoint(editing)?.model.inputModalities.includes("image")} /> Accepts images</label>
                      <label className={classes("checkbox")}><input name="conversationToolCalling" type="checkbox" defaultChecked={conversationEndpoint(editing)?.model.features.includes("tool_calling")} /> Supports tool calling</label>
                    </>
                  ) : null}
                  <label>
                    <span>Image generation model</span>
                    <input name="imageGenerationModelId" maxLength={256} defaultValue={imageEndpoint(editing)?.model.id ?? ""} />
                  </label>
                  {presetId === "openai-compatible" ? (
                    <label className={classes("checkbox")}><input name="imageGenerationAcceptsImages" type="checkbox" defaultChecked={imageEndpoint(editing)?.model.inputModalities.includes("image")} /> Image model accepts reference images</label>
                  ) : null}
                </div>
              </details>
            ) : null}
            {offerDefaultChoice ? (
              <label className={classes("checkbox")}><input name="makeConversationActive" type="checkbox" defaultChecked={editing === undefined || editing.active} /> Use for new messages</label>
            ) : (
              <input name="makeConversationActive" type="hidden" value="on" />
            )}
            <div className={classes("inline-actions")}>
              <button type="submit" disabled={busy}>{editing === undefined ? (onboarding ? "Connect" : "Add provider") : "Save changes"}</button>
              {editing === undefined ? null : (
                <button type="button" disabled={busy} onClick={() => {
                  setEditing(undefined);
                  setPresetId("openai");
                }}>Cancel</button>
              )}
            </div>
          </form>
        </>
      )}
      {error === undefined ? null : <p className={classes("settings-error")} role="alert">{error}</p>}
      {status === undefined ? null : <p className={classes("success")} role="status" data-ui-provider-status>{status}</p>}
    </section>
  );
}

function modelPlaceholder(presetId: ProviderPresetId): string {
  if (presetId === "anthropic") return "e.g. claude-sonnet-5-5";
  if (presetId === "deepseek") return "e.g. deepseek-chat";
  if (presetId === "openai") return "e.g. gpt-5";
  return "Model ID";
}


function ProviderList({
  providers,
  busy,
  beginEdit,
  remove,
}: {
  readonly providers: readonly Provider[];
  readonly busy: boolean;
  readonly beginEdit: (provider: Provider) => void;
  readonly remove: (provider: Provider) => Promise<void>;
}): ReactNode {
  const [confirming, setConfirming] = useState<string>();
  return (
    <ul className={classes("provider-list")} aria-label="Configured providers" data-ui-provider-list>
      {providers.map((provider) => (
        <li
          key={provider.connectionId}
          data-ui-provider={provider.connectionId}
          data-ui-provider-base-url={provider.baseUrl ?? ""}
          data-ui-conversation-endpoint-id={conversationEndpoint(provider)?.id ?? ""}
          data-ui-conversation-model-id={conversationEndpoint(provider)?.model.id ?? ""}
          data-ui-image-generation-model-id={imageEndpoint(provider)?.model.id ?? ""}
        >
          <span className={classes("provider-copy")}>
            <strong>{providerName(provider)}</strong>
            <small>{conversationEndpoint(provider)?.model.id ?? provider.connectionId}</small>
          </span>
          {provider.active ? <em>Default</em> : null}
          {confirming === provider.connectionId ? (
            <div className={classes("provider-confirm")} role="group" aria-label={`Remove ${provider.providerId}?`}>
              <span>Remove?</span>
              <button type="button" disabled={busy} onClick={() => setConfirming(undefined)}>
                Keep
              </button>
              <button
                type="button"
                className={classes("danger-action")}
                disabled={busy}
                data-ui-provider-remove-confirm={provider.connectionId}
                onClick={() => {
                  setConfirming(undefined);
                  void remove(provider);
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <div>
              {provider.presetId === undefined ? null : (
                <button
                  type="button"
                  disabled={busy}
                  data-ui-provider-edit={provider.connectionId}
                  onClick={() => beginEdit(provider)}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                className={classes("provider-remove")}
                disabled={busy}
                data-ui-provider-remove={provider.connectionId}
                onClick={() => setConfirming(provider.connectionId)}
                aria-label={`Remove ${provider.providerId}`}
                title={`Remove ${provider.providerId}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function providerRequest(
  data: FormData,
  presetId: ProviderPresetId,
  editing: Provider | undefined,
): SaveProviderRequest {
  const credential = optionalFormText(data, "credential");
  const imageGenerationModelId = optionalFormText(data, "imageGenerationModelId");
  const baseUrl = optionalFormText(data, "baseUrl");
  return {
    ...(editing === undefined ? {} : { connectionId: editing.connectionId }),
    presetId,
    conversationModelId: requiredFormText(data, "conversationModelId"),
    ...(presetId === "openai-compatible" ? {
      conversationInputModalities: data.get("conversationInputImage") === null
        ? ["text"] as const
        : ["text", "image"] as const,
      conversationFeatures: data.get("conversationToolCalling") === null
        ? []
        : ["tool_calling"] as const,
    } : {}),
    ...(imageGenerationModelId === undefined ? {} : { imageGenerationModelId }),
    ...(presetId === "openai-compatible" && imageGenerationModelId !== undefined
      ? { imageGenerationAcceptsImages: data.get("imageGenerationAcceptsImages") !== null }
      : {}),
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(credential === undefined ? {} : { credential }),
    makeConversationActive: data.get("makeConversationActive") !== null,
  };
}

function providerName(provider: Provider): string {
  return provider.presetId === undefined
    ? provider.providerId
    : providerLabels[provider.presetId];
}

function conversationEndpoint(provider: Provider | undefined) {
  return provider?.endpoints.find((endpoint) => endpoint.model.operations.includes("conversation"));
}

function imageEndpoint(provider: Provider | undefined) {
  return provider?.endpoints.find((endpoint) => endpoint.model.operations.includes("image.generate"));
}

function requiredFormText(data: FormData, field: string): string {
  const value = optionalFormText(data, field);
  if (value === undefined) throw new Error(`${field} is required`);
  return value;
}

function optionalFormText(data: FormData, field: string): string | undefined {
  const value = data.get(field);
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Provider request failed";
}
