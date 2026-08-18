import { RefreshCw, Settings2, Trash2, X } from "lucide-react";
import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Snapshot } from "../../application/model.js";
import type {
  Client,
  Provider,
  ProviderList,
  ProviderPresetId,
  SaveProviderRequest,
} from "../../client/contracts.js";
import { classes } from "../classes.js";
import type {
  DispatchAction,
  DispatchActionResult,
} from "../shared/action.js";
import { ExtensionsSection } from "./extensions.js";

const providerLabels: Readonly<Record<ProviderPresetId, string>> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  "openai-compatible": "Custom OpenAI-compatible",
};

export function SettingsPanel({
  client,
  snapshot,
  dispatch,
  dispatchResult,
  onboarding,
  onSnapshot,
  onError,
  onClose,
}: {
  readonly client: Client;
  readonly snapshot: Snapshot;
  readonly dispatch: DispatchAction;
  readonly dispatchResult: DispatchActionResult;
  readonly onboarding: boolean;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  readonly onError: (message: string | undefined) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [providers, setProviders] = useState<ProviderList>();
  const [editing, setEditing] = useState<Provider>();
  const [presetId, setPresetId] = useState<ProviderPresetId>("openai");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [appearanceError, setAppearanceError] = useState<string>();
  const [appearanceStatus, setAppearanceStatus] = useState<string>();

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
  }, [client, onError]);

  const providerManagementAvailable =
    client.listProviders !== undefined &&
    client.saveProvider !== undefined &&
    client.removeProvider !== undefined;

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
    if (!globalThis.confirm(`Remove ${provider.providerId}?`)) return;
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
      setStatus(`Model catalog refreshed · ${result.modelCount} models`);
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

  async function updateAppearance(
    preferences: { readonly theme?: "system" | "light" | "dark"; readonly density?: "comfortable" | "compact" },
  ): Promise<void> {
    if (appearanceBusy) return;
    setAppearanceBusy(true);
    setAppearanceError(undefined);
    setAppearanceStatus(undefined);
    const accepted = await dispatch({
      type: "update-preferences",
      input: { preferences },
    });
    if (accepted) {
      setAppearanceStatus("Appearance updated");
    } else {
      setAppearanceError("Appearance could not be updated");
    }
    setAppearanceBusy(false);
  }

  return (
    <section
      className={classes("settings-panel")}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      data-ui-settings-panel
    >
      <div className={classes("context-panel-header")}>
        <div>
          <span className={classes("eyebrow")}>{onboarding ? "Get started" : "Settings"}</span>
          <h2>{onboarding ? "Connect a model" : "Settings"}</h2>
        </div>
        <button
          type="button"
          className={classes("icon-button")}
          data-ui-initial-focus={onboarding ? undefined : "true"}
          onClick={onClose}
          aria-label="Close settings"
          title="Close settings"
        >
          <X size={17} />
        </button>
      </div>
      {onboarding ? null : (
        <AppearanceSection
          theme={snapshot.view.theme}
          density={snapshot.view.density}
          busy={appearanceBusy}
          error={appearanceError}
          status={appearanceStatus}
          update={updateAppearance}
        />
      )}
      {onboarding ? null : (
        <ExtensionsSection
          plugins={snapshot.view.settings.plugins}
          dispatch={dispatchResult}
        />
      )}
      <section className={classes("settings-section")}>
        <div className={classes("settings-heading")}>
          <div><Settings2 size={15} /><strong>Models & providers</strong></div>
          {client.refreshModelCatalog === undefined ? null : (
            <button type="button" className={classes("icon-button")} disabled={busy} onClick={() => void refreshCatalog()} aria-label="Refresh model catalog" title="Refresh model catalog">
              <RefreshCw size={15} />
            </button>
          )}
        </div>
        {!providerManagementAvailable ? (
          <p className={classes("muted")}>Provider setup is managed by this host.</p>
        ) : (
          <>
            {providers === undefined && error === undefined ? (
              <p
                className={classes("settings-loading")}
                role="status"
                data-ui-provider-loading
              >
                Loading providers...
              </p>
            ) : providers === undefined ? null : (
              <ProviderList
                providers={providers.providers}
                busy={busy}
                beginEdit={beginEdit}
                remove={remove}
              />
            )}
            <form className={classes("settings-form")} data-ui-provider-form onSubmit={(event) => void save(event)} autoComplete="off">
              <label>
                <span>Provider</span>
                <select
                  name="presetId"
                  value={presetId}
                  disabled={busy || editing !== undefined}
                  onChange={(event) => setPresetId(event.target.value as ProviderPresetId)}
                >
                  {Object.entries(providerLabels).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Conversation model</span>
                <input
                  name="conversationModelId"
                  data-ui-initial-focus={onboarding ? "true" : undefined}
                  required
                  autoFocus={onboarding}
                  maxLength={256}
                  defaultValue={conversationEndpoint(editing)?.model.id ?? ""}
                  key={`${editing?.connectionId ?? "new"}:conversation`}
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
                <input name="credential" type="password" required={editing === undefined} maxLength={16384} autoComplete="new-password" />
                <small className={classes("field-hint")}>Stored securely on this device.</small>
              </label>
              {presetId === "openai" || presetId === "openai-compatible" ? (
                <details className={classes("settings-advanced")} data-ui-provider-advanced>
                  <summary>Advanced capabilities</summary>
                  <div className={classes("advanced-fields")}>
                    {presetId === "openai-compatible" ? (
                      <>
                        <label className={classes("checkbox")}><input name="conversationInputImage" type="checkbox" defaultChecked={conversationEndpoint(editing)?.model.inputModalities.includes("image")} /> Accept image input</label>
                        <label className={classes("checkbox")}><input name="conversationToolCalling" type="checkbox" defaultChecked={conversationEndpoint(editing)?.model.features.includes("tool_calling")} /> Support tool calling</label>
                      </>
                    ) : null}
                    <label>
                      <span>Image generation model</span>
                      <input name="imageGenerationModelId" maxLength={256} defaultValue={imageEndpoint(editing)?.model.id ?? ""} />
                    </label>
                  </div>
                </details>
              ) : null}
              <label className={classes("checkbox")}><input name="makeConversationActive" type="checkbox" defaultChecked /> Use for new messages</label>
              <div className={classes("inline-actions")}>
                <button type="submit" disabled={busy}>{editing === undefined ? (onboarding ? "Connect" : "Add provider") : "Save changes"}</button>
                {editing === undefined ? null : (
                  <button type="button" disabled={busy} onClick={() => {
                    setEditing(undefined);
                    setPresetId("openai");
                  }}>Cancel edit</button>
                )}
              </div>
            </form>
          </>
        )}
        {error === undefined ? null : <p className={classes("settings-error")} role="alert">{error}</p>}
        {status === undefined ? null : <p className={classes("success")} role="status" data-ui-provider-status>{status}</p>}
      </section>
    </section>
  );
}

function AppearanceSection({
  theme,
  density,
  busy,
  error,
  status,
  update,
}: {
  readonly theme: string;
  readonly density: string;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly status: string | undefined;
  readonly update: (
    preferences: { readonly theme?: "system" | "light" | "dark"; readonly density?: "comfortable" | "compact" },
  ) => Promise<void>;
}): ReactNode {
  return (
    <section className={classes("settings-section appearance-section")} data-ui-appearance-settings>
      <div className={classes("settings-heading")}>
        <div><strong>Appearance</strong></div>
      </div>
      <PreferenceControl
        label="Theme"
        value={theme}
        busy={busy}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        select={(value) => update({ theme: value as "system" | "light" | "dark" })}
      />
      <PreferenceControl
        label="Density"
        value={density}
        busy={busy}
        options={[
          { value: "comfortable", label: "Comfortable" },
          { value: "compact", label: "Compact" },
        ]}
        select={(value) => update({ density: value as "comfortable" | "compact" })}
      />
      {error === undefined ? null : <p className={classes("settings-error")} role="alert">{error}</p>}
      {status === undefined ? null : <p className={classes("success")} role="status" data-ui-appearance-status>{status}</p>}
    </section>
  );
}

function PreferenceControl({
  label,
  value,
  busy,
  options,
  select,
}: {
  readonly label: string;
  readonly value: string;
  readonly busy: boolean;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly select: (value: string) => Promise<void>;
}): ReactNode {
  return (
    <div className={classes("preference-row")}>
      <span>{label}</span>
      <div className={classes("segmented-control")} role="group" aria-label={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              data-ui-preference={label.toLowerCase()}
              data-ui-preference-value={option.value}
              disabled={busy || selected}
              onClick={() => void select(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
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
  if (providers.length === 0) {
    return (
      <p className={classes("muted")} data-ui-provider-empty>
        Add a provider to start chatting.
      </p>
    );
  }
  return (
    <ul className={classes("provider-list")} aria-label="Configured providers" data-ui-provider-list>
      {providers.map((provider) => (
        <li
          key={provider.connectionId}
          data-ui-provider={provider.connectionId}
          data-ui-conversation-endpoint-id={conversationEndpoint(provider)?.id ?? ""}
          data-ui-conversation-model-id={conversationEndpoint(provider)?.model.id ?? ""}
          data-ui-image-generation-model-id={imageEndpoint(provider)?.model.id ?? ""}
        >
          <span><strong>{provider.providerId}</strong><small>{conversationEndpoint(provider)?.model.id ?? provider.connectionId}</small></span>
          {provider.active ? <em>Active</em> : null}
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
              disabled={busy}
              data-ui-provider-remove={provider.connectionId}
              onClick={() => void remove(provider)}
              aria-label={`Remove ${provider.providerId}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
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
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(credential === undefined ? {} : { credential }),
    makeConversationActive: data.get("makeConversationActive") !== null,
  };
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
