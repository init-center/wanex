# @wanex/product-app-local

Local trusted Product App host for development products and executable product
checks.

This package composes the existing Product App contracts into one local web app
lifecycle:

1. open local storage through `@wanex/app-bootstrap`;
2. create one `ProductAppShell`;
3. attach the storage-backed Product App state store;
4. expose Product App through the Product App surface message contract;
5. create a Product App Web controller;
6. serve it through the thin Node host.

The served Web request envelope covers both app-state controls and workbench
execution. A browser, desktop wrapper, or local HTTP test can submit
`start-workbench` through `/wanex/product-app-web/request`; execution still
flows through Product App/App Shell and returns a refreshed safe Web document.

It is not a gateway, public server, auth layer, plugin host, connector host,
Electron app, Tauri app, or renderer framework.

## Entry Contract

Use this package when a local product backend wants the complete Product App Web
path without copying bootstrap glue into scripts.

| Use when | Avoid when |
| --- | --- |
| A trusted local host needs to open a store and serve Product App Web locally. | Renderer code needs a dependency; renderers should use request envelopes or surface clients. |
| A test or development app needs one disposable Product App lifecycle. | You need public auth, TLS, accounts, remote storage control plane, or OS packaging. |
| You want state persistence through Product App's storage-backed state store. | You need plugin runtime, connector runtime, or runtime-composition by default. |

## Product Boundary

`startProductAppLocalWebApp(...)` is trusted host code. It may receive local
store paths, profile roots, and the system-service binary path. The browser
document and Product App read models must not expose those values.

The package supports two local storage modes:

- `kind: "store-dir"` for an already resolved local store directory;
- `kind: "profile"` for local profile isolation under a product-owned root.

Both use `@wanex/app-bootstrap`; the Product App shell receives only an injected
storage client and does not know whether the store came from a path or profile.

For desktop main-process code, use the `@wanex/product-app-local/desktop-host`
subpath. It starts the same trusted local lifecycle but exposes an IPC-friendly
host with `handleRequest(unknown)` instead of a desktop framework dependency.
The host request envelope supports safe snapshots, Product App Web request
forwarding, redacted provider-profile lists, and active-profile switching. It
does not include secret-writing profile mutation; products should design that
flow explicitly.

## Minimal Use

```ts
import { startProductAppLocalWebApp } from "@wanex/product-app-local"

const app = await startProductAppLocalWebApp({
  storage: {
    kind: "profile",
    rootDir: "./.wanex",
    profileId: "default"
  },
  serviceBin: "./target/debug/wanex-system-service",
  providerProfiles: {
    profiles: [
      {
        id: "local-fake",
        modelId: "local-fake-model"
      }
    ]
  },
  web: {
    hostname: "127.0.0.1",
    port: 57015
  }
})

console.log(app.url)
console.log(await app.readSnapshot())
await app.close()
```

`providerProfiles` is a trusted startup catalog. If `activeProfileId` is
omitted, startup preserves any persisted active profile and otherwise uses the
primary profile. If it is provided, the id must be included in `profiles`.

For runtime provider setup, prefer the host-owned `providerSetup` facade over
calling low-level profile upsert directly:

```ts
const setup = await app.providerSetup.configureProviderProfile({
  id: "local-openai",
  kind: "openai-compatible",
  providerId: "openai-compatible",
  modelId: "gpt-4.1-mini",
  baseUrl: "https://api.example.test/v1",
  apiKey: process.env.OPENAI_API_KEY,
  makeActive: true
})

console.log(setup.profile.apiKeyRedacted)
console.log(setup.readiness.status)
```

`providerSetup` is trusted host API. It may receive a raw secret from a native
host prompt, environment-backed setup flow, or product-owned secret store, but
it returns only redacted provider profile data plus Product App provider
readiness. The Product App Web request envelope and desktop request envelope do
not expose provider setup or raw upsert operations.

Desktop main-process host:

```ts
import {
  startProductAppDesktopMainHost
} from "@wanex/product-app-local/desktop-host"

const host = await startProductAppDesktopMainHost({
  storage: {
    kind: "profile",
    rootDir: "./.wanex",
    profileId: "default"
  },
  serviceBin: "./target/debug/wanex-system-service"
})

const snapshot = await host.handleRequest({
  kind: "product-app-desktop-main.request",
  operation: "snapshot"
})
const response = await host.handleRequest({
  kind: "product-app-desktop-main.request",
  operation: "webRequest",
  request: {
    kind: "product-app-web.request",
    operation: "document"
  }
})

console.log(snapshot.kind)
console.log(response.kind)
await host.close()
```

Desktop main-process code can use the same trusted setup facade:

```ts
await host.providerSetup.configureProviderProfile({
  id: "desktop-openai",
  kind: "openai-compatible",
  providerId: "openai-compatible",
  modelId: "gpt-4.1-mini",
  baseUrl: "https://api.example.test/v1",
  apiKey: process.env.OPENAI_API_KEY,
  makeActive: true
})
```

## CLI

For local manual inspection:

```bash
pnpm --filter @wanex/product-app-local start -- --poll-interval-ms 0
```

Useful flags:

```bash
pnpm --filter @wanex/product-app-local start -- \
  --profile-root ./.wanex-product-app-local \
  --profile-id default \
  --provider-profile-id local \
  --provider-kind openai-compatible \
  --provider-id openai-compatible \
  --provider-model-id gpt-4.1-mini \
  --provider-base-url https://api.example.test/v1 \
  --provider-api-key-env OPENAI_API_KEY \
  --service-bin ../../target/debug/wanex-system-service \
  --port 57015 \
  --summary-format json \
  --open
```

The CLI intentionally does not accept `--provider-api-key`; pass secrets through
`--provider-api-key-env <NAME>` or a trusted process environment variable so the
key does not land in shell history or normal process argument listings.

To configure provider profiles from a trusted host process and exit, add
`--setup-provider`. This opens the local Product App lifecycle, applies the
provider flags or catalog through `app.providerSetup`, prints one redacted JSON
result, closes resources, and exits:

```bash
OPENAI_API_KEY=... \
pnpm --filter @wanex/product-app-local start -- \
  --profile-root ./.wanex-product-app-local \
  --profile-id default \
  --provider-profile-id local-openai \
  --provider-kind openai-compatible \
  --provider-id openai-compatible \
  --provider-model-id gpt-4.1-mini \
  --provider-base-url https://api.example.test/v1 \
  --provider-api-key-env OPENAI_API_KEY \
  --active-provider-profile-id local-openai \
  --setup-provider \
  --summary-format json
```

`--setup-provider` cannot be combined with `--smoke`; both are one-shot modes
that close the local host after producing a JSON result.

From the workspace root, the same trusted setup path is available through:

```bash
OPENAI_API_KEY=... \
pnpm setup:product-app-local-provider -- \
  --provider-profile-id local-openai \
  --provider-kind openai-compatible \
  --provider-id openai-compatible \
  --provider-model-id gpt-4.1-mini \
  --provider-base-url https://api.example.test/v1 \
  --provider-api-key-env OPENAI_API_KEY \
  --active-provider-profile-id local-openai
```

For multiple profiles, pass a trusted catalog file or JSON value. Catalog
profiles use `apiKeyEnv`; raw `apiKey` values are rejected:

```json
{
  "profiles": [
    {
      "id": "local-fake",
      "kind": "fake",
      "modelId": "fake-model"
    },
    {
      "id": "local-openai",
      "kind": "openai-compatible",
      "providerId": "openai-compatible",
      "modelId": "gpt-4.1-mini",
      "baseUrl": "https://api.example.test/v1",
      "apiKeyEnv": "OPENAI_API_KEY"
    }
  ],
  "activeProfileId": "local-openai"
}
```

```bash
OPENAI_API_KEY=... \
pnpm --filter @wanex/product-app-local start -- \
  --provider-profiles-file ./providers.json \
  --poll-interval-ms 0
```

The inline JSON form is also available:

```bash
WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILES_JSON='{"profiles":[{"id":"local-fake","kind":"fake","modelId":"fake-model"},{"id":"local-openai","kind":"openai-compatible","providerId":"openai-compatible","modelId":"gpt-4.1-mini","baseUrl":"https://api.example.test/v1","apiKeyEnv":"OPENAI_API_KEY"}],"activeProfileId":"local-openai"}' \
OPENAI_API_KEY=... \
pnpm --filter @wanex/product-app-local start -- --poll-interval-ms 0
```

The equivalent flags are `--provider-profiles-file <path>` and
`--provider-profiles-json <json>`. They cannot be combined with each other or
with the single-profile provider flags. Use
`--active-provider-profile-id <id>` only when startup should explicitly
override the persisted active profile.

For the package-owned seeded/blank local Web demo:

```bash
pnpm --filter @wanex/product-app-local demo:web
pnpm --filter @wanex/product-app-local demo:web -- --no-seed --poll-interval-ms 0
pnpm --filter @wanex/product-app-local demo:web -- --open
```

The workspace root aliases `pnpm demo:product-app-web`,
`pnpm demo:product-app-web:seeded`, and `pnpm demo:product-app-web:blank`
delegate to this package-owned demo entry. The demo may print trusted host
paths to the terminal, but those values must not appear in the browser
document, stylesheet, client script, or Web request responses.

For a bounded product-path smoke check:

```bash
pnpm --silent smoke:product-app-local
```

The root smoke script uses a temporary profile root outside the workspace,
prints one JSON result to stdout, closes the host, and exits. Use the `--silent`
pnpm form when stdout must be directly parseable as JSON. To run the package
entry directly:

```bash
pnpm --filter @wanex/product-app-local start -- \
  --profile-root ./.wanex-product-app-local-smoke \
  --profile-id smoke \
  --poll-interval-ms 0 \
  --smoke
```

Smoke mode starts Product App Local, verifies the local Web document, layout
action, workbench start action, and product privacy boundaries, prints one JSON
result to stdout, then closes the host and exits.

The CLI defaults to profile storage under `.wanex-product-app-local` in the
current working directory and profile id `default`. Use `--store-dir <path>`
instead when you want to open an already resolved local store directory.

After startup, the CLI prints a summary from `app.readSnapshot()`: URL, actual
configured/active provider profile, profile count, layout, mode, theme, density,
provider readiness, redacted provider profile rows, Web readiness, and privacy
status. This reflects persisted runtime state rather than only the launch flags.

The default summary format is human-readable text. Use
`--summary-format json`, or `WANEX_PRODUCT_APP_LOCAL_SUMMARY_FORMAT=json`, when
scripts need one parseable JSON startup summary on stdout.

Pass `--open`, or set `WANEX_PRODUCT_APP_LOCAL_OPEN=1`, to open the local Web
URL in the system browser after startup. This is explicit opt-in so CI and
headless scripts stay stable.

Environment variables:

- `WANEX_PRODUCT_APP_LOCAL_OPEN`
- `WANEX_PRODUCT_APP_LOCAL_SMOKE`
- `WANEX_PRODUCT_APP_LOCAL_SETUP_PROVIDER`
- `WANEX_PRODUCT_APP_LOCAL_SUMMARY_FORMAT`
- `WANEX_PRODUCT_APP_LOCAL_HOSTNAME`
- `WANEX_PRODUCT_APP_LOCAL_PORT`
- `WANEX_PRODUCT_APP_LOCAL_STORE_DIR`
- `WANEX_PRODUCT_APP_LOCAL_PROFILE_ROOT`
- `WANEX_PRODUCT_APP_LOCAL_PROFILE_ID`
- `WANEX_PRODUCT_APP_LOCAL_SERVICE_BIN`
- `WANEX_PRODUCT_APP_LOCAL_POLL_INTERVAL_MS`
- `WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILE_ID`
- `WANEX_PRODUCT_APP_LOCAL_PROVIDER_KIND`
- `WANEX_PRODUCT_APP_LOCAL_PROVIDER_ID`
- `WANEX_PRODUCT_APP_LOCAL_PROVIDER_MODEL_ID`
- `WANEX_PRODUCT_APP_LOCAL_PROVIDER_BASE_URL`
- `WANEX_PRODUCT_APP_LOCAL_PROVIDER_API_KEY`
- `WANEX_PRODUCT_APP_LOCAL_PROVIDER_API_KEY_ENV`
- `WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILES_FILE`
- `WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILES_JSON`
- `WANEX_PRODUCT_APP_LOCAL_ACTIVE_PROVIDER_PROFILE_ID`
- `WANEX_STORE_DIR`
- `WANEX_SYSTEM_SERVICE_BIN`
- `WANEX_SERVICE_BIN`
- `WANEX_PROVIDER_PROFILE_ID`
- `WANEX_PROVIDER_KIND`
- `WANEX_PROVIDER_ID`
- `WANEX_PROVIDER_MODEL_ID`
- `WANEX_PROVIDER_BASE_URL`
- `WANEX_PROVIDER_API_KEY`
- `WANEX_PROVIDER_API_KEY_ENV`
- `WANEX_PROVIDER_PROFILES_FILE`
- `WANEX_PROVIDER_PROFILES_JSON`
- `WANEX_ACTIVE_PROVIDER_PROFILE_ID`
- `WANEX_PRODUCT_APP_WEB_HOSTNAME`
- `WANEX_PRODUCT_APP_WEB_PORT`
- `WANEX_PRODUCT_APP_WEB_STORE_DIR`
- `WANEX_PRODUCT_APP_WEB_SESSION_ID`
- `WANEX_PRODUCT_APP_WEB_SEED_TEXT`
- `WANEX_PRODUCT_APP_WEB_NO_SEED`
- `WANEX_PRODUCT_APP_WEB_OPEN`
- `WANEX_PRODUCT_APP_WEB_POLL_INTERVAL_MS`

## Lifecycle

The returned handle is disposable and idempotent. Closing it shuts down the
Node host first, then Product App, then the bootstrapped storage runtime. The
handle is meant for trusted product backend code; UI code should call the
served Product App Web request endpoint or a product-owned IPC wrapper over the
same surface contract.

Use `readSnapshot()` when a trusted host needs one safe startup/status read
model:

```ts
const snapshot = await app.readSnapshot()
console.log(snapshot.url)
console.log(snapshot.settings.state.layout)
console.log(snapshot.providerProfiles.activeProfileId)
```

The snapshot refreshes Product App Web before returning so host-side settings
changes are reflected in the Web view model. It includes explicit privacy flags
and must not expose store paths, service binary paths, secrets, raw storage
clients, or renderer mutation APIs.

The handle also exposes `settings`, a trusted host facade over Product App's
storage-backed product state:

```ts
await app.settings.setLayout({ layout: "split" })
await app.settings.updatePreferences({
  preferences: {
    theme: "dark",
    density: "compact"
  }
})

const settings = app.settings.readSettings()
```

The settings facade is for backend/main-process code that owns product
preferences. It delegates to Product App and persists through the existing
Product App state store; renderers should use Product App Web request envelopes
or product-owned IPC wrappers.

The handle also exposes `providerProfiles`, a trusted host facade over Product
App/App Shell provider profile commands:

```ts
await app.providerProfiles.upsertProviderProfile({
  profile: {
    id: "local-openai-compatible",
    kind: "openai-compatible",
    providerId: "openai-compatible",
    modelId: "gpt-4.1-mini",
    baseUrl: "https://api.example.test/v1"
  },
  makeActive: true
})
```

This facade persists provider profiles through the existing App Shell provider
profile storage and updates the running Product App active profile. It is for
trusted backend/main-process code only; renderers should see redacted read
models and product-owned commands, not raw profile mutation or secret handling.
