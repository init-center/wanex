import {
  Pencil,
  PlugZap,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  McpSaveServerRequest,
  McpServer,
  McpServerList,
  McpServerMutationResult,
  McpSettingsClient,
  McpTransportKind,
} from "../../client/contracts.js";
import { classes } from "../classes.js";

type FormMode =
  | { readonly kind: "create" }
  | { readonly kind: "rename"; readonly server: McpServer }
  | { readonly kind: "replace"; readonly server: McpServer };

export function McpSection({ settings }: {
  readonly settings: McpSettingsClient | undefined;
}): ReactNode {
  const [servers, setServers] = useState<McpServerList>();
  const [form, setForm] = useState<FormMode>();
  const [transport, setTransport] = useState<McpTransportKind>("streamable_http");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    if (settings === undefined) return;
    let active = true;
    setError(undefined);
    void settings.listServers().then((value) => {
      if (active) setServers(value);
    }).catch((reason: unknown) => {
      if (active) setError(message(reason));
    });
    return () => {
      active = false;
    };
  }, [settings]);

  if (settings === undefined) return null;
  const client = settings;

  function begin(next: FormMode): void {
    setForm(next);
    setTransport(next.kind === "create"
      ? "streamable_http"
      : next.server.transport ?? "streamable_http");
    clearFeedback();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (form === undefined || busy) return;
    setBusy(true);
    clearFeedback();
    try {
      const data = new FormData(event.currentTarget);
      if (form.kind === "rename") {
        const identity = actionable(form.server);
        settle(await client.updateServer({
          ...identity,
          label: requiredText(data, "label"),
        }), "Server renamed");
        return;
      }
      const request = await saveRequest(client, data, transport, form);
      settle(await client.saveServer(request),
        form.kind === "create" ? "Server added" : "Connection replaced");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function setEnabled(server: McpServer, enabled: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    clearFeedback();
    try {
      settle(await client.setServerEnabled({
        ...actionable(server),
        enabled,
      }), enabled ? "Server enabled" : "Server disabled", false);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove(server: McpServer): Promise<void> {
    const identity = actionable(server);
    if (busy || !globalThis.confirm(`Remove ${server.label ?? identity.serverId}?`)) {
      return;
    }
    setBusy(true);
    clearFeedback();
    try {
      settle(await client.removeServer(identity), "Server removed");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function reconnect(): Promise<void> {
    if (busy) return;
    setBusy(true);
    clearFeedback();
    try {
      const result = await client.reloadServers({ force: true });
      setServers(result.servers);
      setStatus(reloadMessage(result.reloadOutcome));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  function settle(
    result: McpServerMutationResult,
    success: string,
    closeForm = true,
  ): void {
    setServers(result.servers);
    if (result.kind === "conflict") {
      setError("This server changed elsewhere. Review the refreshed details and try again.");
      return;
    }
    if (closeForm) setForm(undefined);
    if (result.reloadOutcome === "rejected") {
      setError("Settings were saved, but the server could not be connected.");
      return;
    }
    setStatus(result.credentialCleanupPending
      ? `${success}. Secure cleanup will retry.`
      : success);
  }

  function clearFeedback(): void {
    setError(undefined);
    setStatus(undefined);
  }

  return (
    <section className={classes("settings-section mcp-section")} data-ui-mcp-settings>
      <div className={classes("settings-heading mcp-heading")}>
        <div><PlugZap size={15} /><strong>Tool servers</strong></div>
        <div className={classes("mcp-heading-actions")}>
          <button
            type="button"
            className={classes("icon-button")}
            disabled={busy}
            onClick={() => void reconnect()}
            aria-label="Reconnect tool servers"
            title="Reconnect tool servers"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className={classes("mcp-add")}
            disabled={busy}
            onClick={() => begin({ kind: "create" })}
            data-ui-mcp-add
          >
            <Plus size={14} />
            Add server
          </button>
        </div>
      </div>

      {servers === undefined && error === undefined ? (
        <p className={classes("settings-loading")} role="status">
          Loading tool servers...
        </p>
      ) : servers?.servers.length === 0 ? (
        <p className={classes("muted mcp-empty")}>
          Connect a tool server when a conversation needs external capabilities.
        </p>
      ) : (
        <ul className={classes("mcp-list")} aria-label="Configured tool servers">
          {servers?.servers.map((server, index) => (
            <ServerRow
              key={server.serverId ?? `invalid-${index}`}
              server={server}
              busy={busy}
              rename={() => begin({ kind: "rename", server })}
              replace={() => begin({ kind: "replace", server })}
              setEnabled={setEnabled}
              remove={remove}
            />
          ))}
        </ul>
      )}

      {form === undefined ? null : (
        <ServerForm
          mode={form}
          transport={transport}
          busy={busy}
          setTransport={setTransport}
          submit={submit}
          cancel={() => setForm(undefined)}
        />
      )}
      {error === undefined ? null : (
        <p className={classes("settings-error")} role="alert" data-ui-mcp-error>
          {error}
        </p>
      )}
      {status === undefined ? null : (
        <p className={classes("success")} role="status" data-ui-mcp-status>
          {status}
        </p>
      )}
    </section>
  );
}

function ServerRow({
  server,
  busy,
  rename,
  replace,
  setEnabled,
  remove,
}: {
  readonly server: McpServer;
  readonly busy: boolean;
  readonly rename: () => void;
  readonly replace: () => void;
  readonly setEnabled: (server: McpServer, enabled: boolean) => Promise<void>;
  readonly remove: (server: McpServer) => Promise<void>;
}): ReactNode {
  const actionableServer = server.serverId !== undefined && server.revision !== undefined;
  return (
    <li data-ui-mcp-server={server.serverId ?? "invalid"}>
      <div className={classes("mcp-summary")}>
        <div>
          <strong>{server.label ?? server.serverId ?? "Invalid server"}</strong>
          <span>{transportLabel(server.transport)}</span>
        </div>
        <small>{server.serverId ?? "Configuration needs repair"}</small>
      </div>
      <div className={classes("mcp-states")}>
        <span data-state={server.configurationState}>
          {configurationLabel(server.configurationState)}
        </span>
        <span data-state={server.runtimeState}>
          {connectionLabel(server.runtimeState)}
        </span>
        {server.toolCount <= 0 ? null : <small>{server.toolCount} tools</small>}
      </div>
      <div className={classes("mcp-controls")}>
        <label className={classes("extension-toggle")} title={server.enabled ? "Disable server" : "Enable server"}>
          <input
            type="checkbox"
            checked={server.enabled === true}
            disabled={busy || !actionableServer}
            onChange={(event) => void setEnabled(server, event.target.checked)}
            aria-label={`${server.enabled ? "Disable" : "Enable"} ${server.label ?? "server"}`}
          />
          <span />
        </label>
        <button type="button" className={classes("icon-button")} disabled={busy || !actionableServer} onClick={rename} aria-label={`Rename ${server.label ?? "server"}`} title="Rename">
          <Pencil size={13} />
        </button>
        <button type="button" className={classes("icon-button")} disabled={busy || !actionableServer} onClick={replace} aria-label={`Replace ${server.label ?? "server"} connection`} title="Replace connection">
          <RotateCcw size={13} />
        </button>
        <button type="button" className={classes("icon-button danger-icon")} disabled={busy || !actionableServer} onClick={() => void remove(server)} aria-label={`Remove ${server.label ?? "server"}`} title="Remove server">
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

function ServerForm({
  mode,
  transport,
  busy,
  setTransport,
  submit,
  cancel,
}: {
  readonly mode: FormMode;
  readonly transport: McpTransportKind;
  readonly busy: boolean;
  readonly setTransport: (transport: McpTransportKind) => void;
  readonly submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  readonly cancel: () => void;
}): ReactNode {
  const server = mode.kind === "create" ? undefined : mode.server;
  return (
    <form className={classes("settings-form mcp-form")} onSubmit={(event) => void submit(event)} autoComplete="off" data-ui-mcp-form={mode.kind}>
      <div className={classes("mcp-form-heading")}>
        <strong>{mode.kind === "create" ? "Add tool server" : mode.kind === "rename" ? "Rename server" : "Replace connection"}</strong>
        <button type="button" className={classes("icon-button")} onClick={cancel} aria-label="Close server form" title="Close">
          <X size={14} />
        </button>
      </div>
      <label>
        <span>Server ID</span>
        <input name="serverId" required maxLength={64} readOnly={mode.kind !== "create"} defaultValue={server?.serverId ?? ""} pattern="[a-z0-9][a-z0-9._-]{0,63}" />
      </label>
      <label>
        <span>Name</span>
        <input name="label" required maxLength={256} defaultValue={server?.label ?? ""} />
      </label>
      {mode.kind === "rename" ? null : (
        <>
          <label>
            <span>Connection</span>
            <select name="transport" value={transport} disabled={busy} onChange={(event) => setTransport(event.target.value as McpTransportKind)}>
              <option value="streamable_http">HTTP</option>
              <option value="stdio">Local process</option>
            </select>
          </label>
          {transport === "streamable_http" ? (
            <label>
              <span>URL</span>
              <input name="url" type="url" required maxLength={8192} placeholder="https://example.com/mcp" />
            </label>
          ) : (
            <>
              <label>
                <span>Command</span>
                <input name="command" required maxLength={8192} placeholder="node" />
              </label>
              <label>
                <span>Working directory</span>
                <input name="cwd" required maxLength={8192} placeholder="/path/to/project" />
              </label>
              <label className={classes("mcp-form-wide")}>
                <span>Arguments</span>
                <textarea name="args" placeholder="One argument per line" rows={3} />
              </label>
            </>
          )}
          <label>
            <span>{transport === "stdio" ? "Credential variable" : "Credential header"}</span>
            <input name="credentialName" maxLength={256} defaultValue={transport === "stdio" ? "MCP_TOKEN" : "Authorization"} />
          </label>
          <label>
            <span>Credential (optional)</span>
            <input name="credential" type="password" maxLength={16384} autoComplete="new-password" />
          </label>
          <details className={classes("settings-advanced")}>
            <summary>Connection limits</summary>
            <div className={classes("advanced-fields")}>
              <label><span>Connect timeout (ms)</span><input name="connectTimeoutMs" type="number" min={10} max={120000} defaultValue={10000} required /></label>
              <label><span>Request timeout (ms)</span><input name="requestTimeoutMs" type="number" min={10} max={120000} defaultValue={30000} required /></label>
            </div>
          </details>
          <label className={classes("checkbox")}><input name="enabled" type="checkbox" defaultChecked={server?.enabled ?? true} /> Enable after saving</label>
        </>
      )}
      <div className={classes("inline-actions")}>
        <button type="submit" disabled={busy}>{busy ? "Saving..." : mode.kind === "create" ? "Add server" : "Save changes"}</button>
        <button type="button" disabled={busy} onClick={cancel}>Cancel</button>
      </div>
    </form>
  );
}

async function saveRequest(
  settings: McpSettingsClient,
  data: FormData,
  transport: McpTransportKind,
  mode: Exclude<FormMode, { readonly kind: "rename" }>,
): Promise<McpSaveServerRequest> {
  const serverId = requiredText(data, "serverId");
  const credential = optionalText(data, "credential");
  const credentialName = optionalText(data, "credentialName");
  if (credential !== undefined && credentialName === undefined) {
    throw new Error("Credential name is required when a credential is provided");
  }
  const setup = credential === undefined ? undefined : await settings.stageCredential({
    serverId,
    transport,
    name: credentialName!,
    value: credential,
  });
  const values = setup === undefined ? [] : [{
    name: credentialName!,
    source: { kind: "credential" as const, setupId: setup.setupId },
  }];
  return {
    serverId,
    expectedRevision: mode.kind === "create"
      ? null
      : actionable(mode.server).expectedRevision,
    label: requiredText(data, "label"),
    enabled: data.get("enabled") !== null,
    connectTimeoutMs: requiredInteger(data, "connectTimeoutMs"),
    requestTimeoutMs: requiredInteger(data, "requestTimeoutMs"),
    transport: transport === "stdio"
      ? {
          kind: transport,
          command: requiredText(data, "command"),
          args: rawText(data, "args").split(/\r?\n/u).filter((value) => value.length > 0),
          cwd: requiredText(data, "cwd"),
          environment: values,
        }
      : {
          kind: transport,
          url: requiredText(data, "url"),
          headers: values,
        },
  };
}

function actionable(server: McpServer): {
  readonly serverId: string;
  readonly expectedRevision: number;
} {
  if (server.serverId === undefined || server.revision === undefined) {
    throw new Error("This server cannot be changed until its configuration is repaired");
  }
  return { serverId: server.serverId, expectedRevision: server.revision };
}

function requiredInteger(data: FormData, field: string): number {
  const value = Number(requiredText(data, field));
  if (!Number.isSafeInteger(value)) throw new Error(`${field} must be an integer`);
  return value;
}

function requiredText(data: FormData, field: string): string {
  const value = optionalText(data, field);
  if (value === undefined) throw new Error(`${field} is required`);
  return value;
}

function optionalText(data: FormData, field: string): string | undefined {
  const value = rawText(data, field).trim();
  return value.length === 0 ? undefined : value;
}

function rawText(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value : "";
}

function transportLabel(transport: McpTransportKind | undefined): string {
  return transport === "stdio" ? "Local process" : transport === "streamable_http" ? "HTTP" : "Unknown connection";
}

function configurationLabel(state: McpServer["configurationState"]): string {
  if (state === "valid") return "Saved";
  if (state === "rejected") return "Connection rejected";
  if (state === "invalid") return "Needs repair";
  return "Missing";
}

function connectionLabel(state: McpServer["runtimeState"]): string {
  if (state === "ready") return "Connected";
  if (state === "degraded") return "Limited";
  if (state === "failed") return "Unavailable";
  if (state === "stopped") return "Off";
  return "Not running";
}

function reloadMessage(outcome: "unchanged" | "published" | "rejected" | "failed"): string {
  if (outcome === "published") return "Tool servers reconnected";
  if (outcome === "unchanged") return "Tool servers are up to date";
  if (outcome === "rejected") return "Some saved servers could not be connected";
  return "Tool servers could not be reconnected";
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Tool server request failed";
}
