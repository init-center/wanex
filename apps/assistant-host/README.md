# @wanex/assistant-host

Framework-neutral trusted application host for local Web, terminal, and
packaged desktop products.

The `@wanex/assistant-host/application` entry composes the existing application
contracts into one presentation-neutral local Assistant lifecycle:

1. open local storage through `@wanex/runtime/bootstrap`;
2. create one `Shell`;
3. attach the storage-backed application state store;
4. compose the durable Team runtime and execution host;
5. optionally prepare one named Plugin composition from the same Storage handle;
6. expose application through the application surface message contract;
7. close all owned resources in reverse order.

The package root wraps that lifecycle with the Web controller and thin Node
host. `@wanex/assistant-host/desktop-host` adapts it for desktop IPC, while the
`@wanex/tui` executable host consumes the presentation-neutral application
entry directly. None of these wrappers duplicates Assistant or Team composition.

The served Web request envelope covers both app-state controls and workbench
execution. A browser, desktop wrapper, or local HTTP test can submit
`submit-conversation` through `/wanex/assistant/request`; execution still
flows through application/App Shell and returns a typed snapshot or action-result
snapshot. The root HTTP response is only the static browser shell.

Browser progress uses `GET /wanex/assistant/events`, an authenticated
fetch-SSE endpoint. The per-launch capability remains in the
`x-wanex-host-session` header and never enters the URL or event payload.
Assistant text deltas update transient DOM directly. Operation invalidation,
command-catalog invalidation, replay gaps, malformed events, and exhausted
reconnects reconcile once from canonical Assistant reads. Command-catalog events
carry only revision identity and trigger `readAssistantCommands()`; they never
carry Plugin rows or install state. Replay, pending-live, and outbound queues
are bounded; there is no permanent refresh timer.

It is not a gateway, public server, auth layer, plugin host, connector host,
Electron app, Tauri app, or renderer framework.

## Optional Plugin Composition

`StartAssistantHostOptions.pluginComposition` is the sole Plugin-specific
composition port. Assistant Host prepares it after opening Storage and before
creating the one Assistant Shell, injects its Assistant binding into that Shell,
and starts it only after Shell and Surface creation succeed. Shutdown stops
Plugin admission and worker activity before Team, Surface, Shell, and Storage,
then disposes the prepared Plugin binding.

The default path does not import or depend on `@wanex/assistant-plugin-host`.
Products that enable Plugin commands explicitly construct
`createAssistantPluginComposition(...)` from that optional leaf package.
This keeps Plugin Runtime and subprocess dependencies out of default Web,
Desktop, TUI, Runtime, and App closures. The port is not a generic lifecycle
hook and must not be expanded to host unrelated optional capabilities.

## Entry Contract

Use this package when a local assistant backend wants the complete Web application
path without copying bootstrap glue into scripts.

| Use when                                                                      | Avoid when                                                                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A trusted Assistant Host needs to open a store and run Assistant locally.            | Renderer code needs a dependency; renderers should use request envelopes or surface clients. |
| A test or development app needs one disposable application lifecycle.         | You need public auth, TLS, accounts, remote storage control plane, or OS packaging.          |
| You want state persistence through application's storage-backed state store.  | You need plugin runtime, connector runtime, or runtime-composition by default.               |

## Assistant Boundary

`startAssistantWebApp(...)` is trusted host code. It may receive local
store paths, profile roots, and the system-service binary path. The browser
document and application read models must not expose those values.

The package supports two local storage modes:

- `kind: "store-dir"` for an already resolved local store directory;
- `kind: "profile"` for local profile isolation under a assistant-owned root.

Both use `@wanex/runtime/bootstrap`; the application shell receives only an
injected storage client and does not know whether the store came from a path or
profile.

Terminal and other non-Web trusted hosts should import
`startAssistantHost` from `@wanex/assistant-host/application`. Its handle exposes
only Assistant Shell/Surface capabilities and explicit local resource ports; it
does not start HTTP, construct a browser controller, or pull Web rendering into
the TUI distribution.

Packaged local products that need to validate an explicit native artifact use
`@wanex/assistant-host/system-service`. This narrow boundary keeps Runtime
artifact types out of the desktop leaf while the existing Runtime bootstrap
implementation remains the validation authority.

For desktop main-process code, use the `@wanex/assistant-host/desktop-host`
subpath. It starts the same trusted local lifecycle but exposes an IPC-friendly
host with `handleRequest(unknown)` instead of a desktop framework dependency.
The host request envelope supports safe snapshots, Web application request
forwarding, redacted model-endpoint lists, and active-endpoint switching. It
does not include secret-writing endpoint mutation; products should design that
flow explicitly.

## Minimal Use

```ts
import { startAssistantWebApp } from "@wanex/assistant-host";

const serviceBin =
  process.platform === "win32"
    ? "./target/debug/wanex-system-service.exe"
    : "./target/debug/wanex-system-service";

const app = await startAssistantWebApp({
  storage: {
    kind: "profile",
    rootDir: "./.wanex",
    profileId: "default",
  },
  serviceBin,
  modelEndpoints: {
    endpoints: [
      {
        id: "local-fake",
        connection: {
          id: "connection-local-fake",
          providerId: "fake",
        },
        protocol: { id: "fake" },
        model: {
          id: "local-fake-model",
          operations: ["conversation"],
          inputModalities: ["text"],
          outputModalities: ["text"],
          features: [],
          catalog: {
            source: "builtin",
            catalogId: "wanex.fake",
            revision: "1",
          },
        },
      },
    ],
  },
  web: {
    hostname: "127.0.0.1",
    port: 57015,
  },
});

console.log(app.url);
console.log(await app.readSnapshot());
await app.close();
```

`modelEndpoints` is a trusted startup catalog. If `activeEndpointId` is
omitted, startup preserves any persisted active endpoint and otherwise uses the
first endpoint. If it is provided, the id must be included in `endpoints`.

For an Assistant onboarding flow, the trusted host can accept a credential once
and store it through the injected OS-keychain-backed secret store:

```ts
const saved = await app.providers.saveProvider({
  presetId: "openai",
  conversationModelId: "your-conversation-model-id",
  imageGenerationModelId: "your-image-model-id",
  credential: apiKey,
  makeConversationActive: true,
});

console.log(saved.provider.credentialConfigured);
console.log(saved.provider.endpoints);
console.log(saved.readiness.status);

const edited = await app.providers.saveProvider({
  connectionId: saved.provider.connectionId,
  presetId: "openai",
  conversationModelId: "your-next-conversation-model-id",
  // Omit credential to preserve the current credential reference exactly.
});

console.log(await app.providers.listProviders());
await app.providers.removeProvider({
  connectionId: edited.provider.connectionId,
});
```

The local browser host exposes this flow under its per-launch host-session
capability. Its form asks for Provider, conversation model, an optional image
generation model, and API key. OpenAI,
Anthropic, and DeepSeek endpoint/adapter metadata is selected by trusted host
code and cannot be overridden by the browser. The explicit
`openai-compatible` preset additionally requires a custom HTTP(S) base URL and
derives an opaque endpoint ID from the normalized service location.

When no runnable Provider exists, Assistant Local presents this Host-owned form
as blocking onboarding and marks the underlying Assistant shell inert. Once a
Provider is ready, the same form is available through the header-level
`Provider settings` modal and no longer occupies a separate document row.
Closing the modal clears the credential field and restores focus to its
trigger. A successful first-run setup replaces the onboarding chrome and
unblocks the refreshed Assistant surface in place; it does not reload or restart
the Host. Raw credentials never enter Assistant Web snapshots or application
actions.

Standard Provider model metadata is resolved exactly by Provider ID and model
ID from a generated, revisioned models.dev snapshot bundled with Assistant
Local. The snapshot keeps startup offline and supplies only capabilities the
current Wanex adapter can execute. A model absent from both the validated cache
and bundled snapshot remains text-only with unknown limits and no inferred
Tool or reasoning support. Assistant Local never fuzzy-matches a family name.

The Host-owned setup form projects this validated metadata as bounded model-ID
suggestions for OpenAI, Anthropic, and DeepSeek. Suggestions are advisory: the
field remains free text, so new, private, or staged exact model IDs are still
accepted. Custom OpenAI-compatible setup never inherits a standard Provider's
catalog. A successful explicit catalog refresh updates the existing form in
place without replacing the user's current input; a failed refresh leaves the
previous suggestions untouched. Raw catalog documents do not enter Assistant Web
snapshots or renderer requests.

The trusted handle exposes a parameterless explicit refresh:

```ts
const result = await app.modelCatalog.refresh();
console.log(result.kind);
```

Maintainers update the bundled snapshot from a captured models.dev API payload
without making tests depend on live network state:

```sh
pnpm generate:model-catalog --source ./models-dev-api.json
pnpm generate:model-catalog --source ./models-dev-api.json --check
```

Refresh contacts only the Host-owned `https://models.dev/api.json` URL with a
bounded timeout and response size, validates the selected OpenAI, Anthropic,
and DeepSeek projection, and persists it through the existing SQLite config
store. It never runs at startup or on an interval, accepts no renderer URL or
headers, and does not mutate existing endpoints or admitted Turns. A failed
refresh leaves the prior validated cache active. The local Web action is
protected by the same per-launch host-session capability as credential setup.

One Provider connection uses one current versioned credential reference.
Conversation and image-generation endpoints share that connection while
retaining distinct endpoint IDs, protocols, model descriptors, and operations.
A model-only edit preserves the exact existing reference. A credential
replacement stages one unique revision. Replacement and removal use a
discriminated, secret-value-free durable mutation intent and ask App to commit
the complete endpoint, active selection, and capability-route graph atomically.
Startup and the next mutation reconcile interruption from exact endpoint
evidence. Retired Host-owned references enter a bounded durable cleanup backlog
and remain resolvable while any non-settled Turn or media-generation operation
still carries that frozen reference. Cleanup retries after those executions
settle and does not block a later Provider save. Foreign schemes and namespaces
are never deleted. Raw values never enter SQLite, Assistant read models, browser
responses, or snapshots.

OpenAI and custom OpenAI-compatible presets may configure image generation;
Anthropic and DeepSeek reject that field before any credential write. A newly
configured image endpoint is executable by the next Turn in the same process,
without restarting the Assistant Host.

Saving a Provider means the endpoint is structurally runnable; it does not claim that
authentication, network reachability, quota, or model availability has been
verified. The host does not issue a hidden billable completion or perform a
hidden catalog fetch. The first explicit conversation reports real Provider
failures through the durable operation path.

For startup catalogs or other trusted integrations that already own a
`secretRef`, use App's trusted model-endpoint command:

```ts
const endpoint = await app.modelEndpoints.upsertModelEndpoint({
  modelEndpoint: {
    id: "local-openai",
    connection: {
      id: "connection-local-openai",
      providerId: "openai-compatible",
      baseUrl: "https://api.example.test/v1",
      secretRef: "env://OPENAI_API_KEY",
    },
    protocol: { id: "openai-chat-completions" },
    model: {
      id: "gpt-4.1-mini",
      operations: ["conversation"],
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      features: ["tool_calling"],
      catalog: {
        source: "custom",
        catalogId: "local.openai-compatible",
        revision: "1",
      },
    },
  },
  makeActive: true,
});

console.log(endpoint.credentialConfigured);
```

`providers` is trusted Host API. `saveProvider` receives a raw value only long
enough to write it to the injected secret store; edits can omit the value and
preserve the existing reference. `modelEndpoints` accepts complete trusted
endpoint descriptors whose opaque reference was created by an environment,
native keychain, or assistant-owned secret store. Assistant read models expose
credential readiness but never the reference or value. Generic Assistant Web
and desktop request envelopes expose neither credential mutation nor raw
endpoint mutation.

The standalone Assistant Host loads its native keychain adapter on demand. Bundled
desktop products should inject their own `credentialStore`, or explicitly
package `@wanex/local-credential-store` and its verified native binding. The
Assistant Local root does not statically pull that adapter into injected-host
bundles, and Assistant Local no longer owns a duplicate keychain subpath.

Desktop main-process host:

```ts
import { startDesktopMainHost } from "@wanex/assistant-host/desktop-host";

const serviceBin =
  process.platform === "win32"
    ? "./target/debug/wanex-system-service.exe"
    : "./target/debug/wanex-system-service";

const host = await startDesktopMainHost({
  storage: {
    kind: "profile",
    rootDir: "./.wanex",
    profileId: "default",
  },
  serviceBin,
});

const snapshot = await host.handleRequest({
  kind: "desktop.request",
  operation: "snapshot",
});
const response = await host.handleRequest({
  kind: "desktop.request",
  operation: "webRequest",
  request: {
    kind: "web.request",
    operation: "snapshot",
  },
});

console.log(snapshot.kind);
console.log(response.kind);
await host.close();
```

Desktop main-process code can use the same trusted model-endpoint facade:

```ts
await host.modelEndpoints.upsertModelEndpoint({
  modelEndpoint: {
    id: "desktop-openai",
    connection: {
      id: "connection-desktop-openai",
      providerId: "openai-compatible",
      baseUrl: "https://api.example.test/v1",
      secretRef: "env://OPENAI_API_KEY",
    },
    protocol: { id: "openai-chat-completions" },
    model: {
      id: "gpt-4.1-mini",
      operations: ["conversation"],
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      features: ["tool_calling"],
      catalog: {
        source: "custom",
        catalogId: "desktop.openai-compatible",
        revision: "1",
      },
    },
  },
  makeActive: true,
});
```

## CLI

For local manual inspection:

```bash
pnpm --filter @wanex/assistant-host start
```

Useful flags:

```bash
pnpm --filter @wanex/assistant-host start -- \
  --profile-root ./.wanex-assistant-host \
  --profile-id default \
  --model-endpoint-id local \
  --provider-protocol openai-chat-completions \
  --provider-id openai-compatible \
  --provider-model-id gpt-4.1-mini \
  --provider-base-url https://api.example.test/v1 \
  --provider-secret-ref env://OPENAI_API_KEY \
  --port 57015 \
  --summary-format json \
  --open
```

The CLI intentionally does not accept raw provider credentials. Pass a
`--provider-secret-ref <ref>` such as `env://OPENAI_API_KEY`; only the reference
is stored or visible in process arguments, while the value remains in the
trusted environment or another injected secret provider.

To configure model endpoints from a trusted host process and exit, add
`--setup-provider`. This opens the local application lifecycle, applies the
provider flags or catalog through `app.modelEndpoints`, prints one redacted JSON
result, closes resources, and exits:

```bash
OPENAI_API_KEY=... \
pnpm --filter @wanex/assistant-host start -- \
  --profile-root ./.wanex-assistant-host \
  --profile-id default \
  --model-endpoint-id local-openai \
  --provider-protocol openai-chat-completions \
  --provider-id openai-compatible \
  --provider-model-id gpt-4.1-mini \
  --provider-base-url https://api.example.test/v1 \
  --provider-secret-ref env://OPENAI_API_KEY \
  --active-model-endpoint-id local-openai \
  --setup-provider \
  --summary-format json
```

`--setup-provider` cannot be combined with `--smoke`; both are one-shot modes
that close the Assistant Host after producing a JSON result.

From the workspace root, the same trusted setup path is available through:

```bash
OPENAI_API_KEY=... \
pnpm setup:assistant-provider -- \
  --model-endpoint-id local-openai \
  --provider-protocol openai-chat-completions \
  --provider-id openai-compatible \
  --provider-model-id gpt-4.1-mini \
  --provider-base-url https://api.example.test/v1 \
  --provider-secret-ref env://OPENAI_API_KEY \
  --active-model-endpoint-id local-openai
```

For multiple endpoints, pass a trusted catalog file or JSON value. Connections
use `secretRef`; raw `apiKey`, `apiKeyEnv`, and `credential` fields are rejected:

```json
{
  "endpoints": [
    {
      "id": "local-fake",
      "connection": { "id": "connection-local-fake", "providerId": "fake" },
      "protocol": { "id": "fake" },
      "model": {
        "id": "fake-model",
        "operations": ["conversation"],
        "inputModalities": ["text"],
        "outputModalities": ["text"],
        "features": [],
        "catalog": {
          "source": "builtin",
          "catalogId": "wanex.fake",
          "revision": "1"
        }
      }
    },
    {
      "id": "local-openai",
      "connection": {
        "id": "connection-local-openai",
        "providerId": "openai-compatible",
        "baseUrl": "https://api.example.test/v1",
        "secretRef": "env://OPENAI_API_KEY"
      },
      "protocol": { "id": "openai-chat-completions" },
      "model": {
        "id": "gpt-4.1-mini",
        "operations": ["conversation"],
        "inputModalities": ["text", "image"],
        "outputModalities": ["text"],
        "features": ["tool_calling"],
        "catalog": {
          "source": "custom",
          "catalogId": "local.openai-compatible",
          "revision": "1"
        }
      }
    }
  ],
  "activeEndpointId": "local-openai"
}
```

```bash
OPENAI_API_KEY=... \
pnpm --filter @wanex/assistant-host start -- \
  --model-endpoints-file ./model-endpoints.json
```

The inline JSON form is also available:

```bash
WANEX_ASSISTANT_HOST_MODEL_ENDPOINTS_JSON="$(tr -d '\n' < ./model-endpoints.json)" \
OPENAI_API_KEY=... \
pnpm --filter @wanex/assistant-host start
```

The equivalent flags are `--model-endpoints-file <path>` and
`--model-endpoints-json <json>`. They cannot be combined with each other or
with the single-endpoint flags. Use
`--active-model-endpoint-id <id>` only when startup should explicitly
override the persisted active endpoint.

For the package-owned seeded/blank local Web demo:

```bash
pnpm --filter @wanex/assistant-host demo:web
pnpm --filter @wanex/assistant-host demo:web -- --no-seed
pnpm --filter @wanex/assistant-host demo:web -- --open
```

The workspace root aliases `pnpm demo:assistant-web`,
`pnpm demo:assistant-web:seeded`, and `pnpm demo:assistant-web:blank`
delegate to this package-owned demo entry. The demo may print trusted host
paths to the terminal, but those values must not appear in the browser shell,
stylesheet, client script, or Web request responses.

For a bounded assistant-path smoke check:

```bash
pnpm --silent smoke:assistant-host
```

The root smoke script uses a temporary profile root outside the workspace,
prints one JSON result to stdout, closes the host, and exits. Use the `--silent`
pnpm form when stdout must be directly parseable as JSON. To run the package
entry directly:

```bash
pnpm --filter @wanex/assistant-host start -- \
  --profile-root ./.wanex-assistant-host-smoke \
  --profile-id smoke \
  --smoke
```

Smoke mode starts local application, verifies the local browser shell, typed
snapshot/action results, layout action, workbench start action, and assistant
privacy boundaries, prints one JSON result to stdout, then closes the host and
exits.

The CLI defaults to profile storage under `.wanex-assistant-host` in the
current working directory and profile id `default`. Use `--store-dir <path>`
instead when you want to open an already resolved local store directory.

After startup, the CLI prints a summary from `app.readSnapshot()`: URL, actual
configured/active model endpoint, endpoint count, layout, mode, theme, density,
provider readiness, redacted model endpoint rows, Web readiness, and privacy
status. This reflects persisted runtime state rather than only the launch flags.

The default summary format is human-readable text. Use
`--summary-format json`, or `WANEX_ASSISTANT_HOST_SUMMARY_FORMAT=json`, when
scripts need one parseable JSON startup summary on stdout.

Pass `--open`, or set `WANEX_ASSISTANT_HOST_OPEN=1`, to open the local Web
URL in the system browser after startup. This is explicit opt-in so CI and
headless scripts stay stable.

Environment variables:

- `WANEX_ASSISTANT_HOST_OPEN`
- `WANEX_ASSISTANT_HOST_SMOKE`
- `WANEX_ASSISTANT_HOST_SETUP_PROVIDER`
- `WANEX_ASSISTANT_HOST_SUMMARY_FORMAT`
- `WANEX_ASSISTANT_HOST_HOSTNAME`
- `WANEX_ASSISTANT_HOST_PORT`
- `WANEX_ASSISTANT_HOST_STORE_DIR`
- `WANEX_ASSISTANT_HOST_PROFILE_ROOT`
- `WANEX_ASSISTANT_HOST_PROFILE_ID`
- `WANEX_ASSISTANT_HOST_SERVICE_BIN`
- `WANEX_ASSISTANT_HOST_MODEL_ENDPOINT_ID`
- `WANEX_ASSISTANT_HOST_PROVIDER_CONNECTION_ID`
- `WANEX_ASSISTANT_HOST_PROVIDER_PROTOCOL`
- `WANEX_ASSISTANT_HOST_PROVIDER_ID`
- `WANEX_ASSISTANT_HOST_PROVIDER_MODEL_ID`
- `WANEX_ASSISTANT_HOST_MODEL_OPERATIONS`
- `WANEX_ASSISTANT_HOST_MODEL_INPUT_MODALITIES`
- `WANEX_ASSISTANT_HOST_MODEL_OUTPUT_MODALITIES`
- `WANEX_ASSISTANT_HOST_MODEL_FEATURES`
- `WANEX_ASSISTANT_HOST_MODEL_REASONING_REPLAY`
- `WANEX_ASSISTANT_HOST_PROVIDER_BASE_URL`
- `WANEX_ASSISTANT_HOST_PROVIDER_SECRET_REF`
- `WANEX_ASSISTANT_HOST_MODEL_ENDPOINTS_FILE`
- `WANEX_ASSISTANT_HOST_MODEL_ENDPOINTS_JSON`
- `WANEX_ASSISTANT_HOST_ACTIVE_MODEL_ENDPOINT_ID`
- `WANEX_STORE_DIR`
- `WANEX_SYSTEM_SERVICE_BIN`
- `WANEX_MODEL_ENDPOINT_ID`
- `WANEX_PROVIDER_CONNECTION_ID`
- `WANEX_PROVIDER_PROTOCOL`
- `WANEX_PROVIDER_ID`
- `WANEX_PROVIDER_MODEL_ID`
- `WANEX_MODEL_OPERATIONS`
- `WANEX_MODEL_INPUT_MODALITIES`
- `WANEX_MODEL_OUTPUT_MODALITIES`
- `WANEX_MODEL_FEATURES`
- `WANEX_MODEL_REASONING_REPLAY`
- `WANEX_PROVIDER_BASE_URL`
- `WANEX_PROVIDER_SECRET_REF`
- `WANEX_MODEL_ENDPOINTS_FILE`
- `WANEX_MODEL_ENDPOINTS_JSON`
- `WANEX_ACTIVE_MODEL_ENDPOINT_ID`
- `WANEX_ASSISTANT_WEB_HOSTNAME`
- `WANEX_ASSISTANT_WEB_PORT`
- `WANEX_ASSISTANT_WEB_STORE_DIR`
- `WANEX_ASSISTANT_WEB_SESSION_ID`
- `WANEX_ASSISTANT_WEB_SEED_TEXT`
- `WANEX_ASSISTANT_WEB_NO_SEED`
- `WANEX_ASSISTANT_WEB_OPEN`

## Lifecycle

The returned handle is disposable and idempotent. Closing it shuts down the
Node host first, then application, then the bootstrapped storage runtime. The
handle is meant for trusted assistant backend code; UI code should call the
served Web application request endpoint or a assistant-owned IPC wrapper over the
same surface contract.

Use `readSnapshot()` when a trusted host needs one safe startup/status read
model:

```ts
const snapshot = await app.readSnapshot();
console.log(snapshot.url);
console.log(snapshot.settings.state.layout);
console.log(snapshot.modelEndpoints.activeEndpointId);
```

The snapshot refreshes Web application before returning so host-side settings
changes are reflected in the Web view model. It includes explicit privacy flags
and must not expose store paths, service binary paths, secrets, raw storage
clients, secret references, raw credentials, or renderer mutation APIs. The
separate `modelEndpoints` and `providers` facades are
trusted host capabilities and may retain complete configuration internally;
their renderer and IPC projections are redacted.

The handle also exposes `settings`, a trusted host facade over application's
storage-backed assistant state:

```ts
await app.settings.setLayout({ layout: "split" });
await app.settings.updatePreferences({
  preferences: {
    theme: "dark",
    density: "compact",
  },
});

const settings = app.settings.readSettings();
```

The settings facade is for backend/main-process code that owns assistant
preferences. It delegates to application and persists through the existing
application state store; renderers should use Web application request envelopes
or assistant-owned IPC wrappers.

The handle also exposes `modelEndpoints`, a trusted host facade over Assistant
App/App Shell model endpoint commands:

```ts
await app.modelEndpoints.upsertModelEndpoint({
  modelEndpoint: {
    id: "local-openai-compatible",
    connection: {
      id: "connection-local-openai-compatible",
      providerId: "openai-compatible",
      baseUrl: "https://api.example.test/v1",
    },
    protocol: { id: "openai-chat-completions" },
    model: {
      id: "gpt-4.1-mini",
      operations: ["conversation"],
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      features: ["tool_calling"],
      catalog: {
        source: "custom",
        catalogId: "local.openai-compatible",
        revision: "1",
      },
    },
  },
  makeActive: true,
});
```

This facade persists model endpoints through App commands and updates the
running application active endpoint. It is for
trusted backend/main-process code only; renderers should see redacted read
models and assistant-owned commands, not raw endpoint mutation or secret handling.
