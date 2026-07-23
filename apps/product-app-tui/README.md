# @wanex/product-app-tui

Concrete terminal surface adapter for `@wanex/product-app`.

This package is a leaf upper app surface. It consumes the Product App
renderer-side surface client and projects Product App state into generic Wanex
TUI shell contracts.

## Entry Contract

Use this package when a product wants a terminal surface over Product App.

| Use when | Avoid when |
| --- | --- |
| A TUI should call Product App through `@wanex/product-app/surface-client`. | A backend needs to create Product App storage or lifecycle. |
| You want a rendered terminal read model, command executor, or injected line session. | You need Electron, Tauri, React, HTTP, or a full-screen terminal loop. |
| You need to prove a UI does not import lower runtime packages. | You need plugin runtime, connector runtime, or runtime-composition by default. |

## Product Boundary

Call `createProductAppTuiSurface({ client })` with a Product App surface client.
The TUI surface reads descriptors, app status, home state, and surface events
through that client. It must not open storage, receive store paths, receive
service binary paths, import App Command Runtime backend constructors, or call
lower runtime packages directly.

The TUI status read model includes Product App's provider readiness status from
`readHome()`, such as `provider:ready` or
`provider:missing_required_credential`.
It is display-only and does not add provider secret mutation to the TUI surface.

This package intentionally keeps Product App TUI optional. It does not become
part of the default `@wanex/product-app` closure unless a product explicitly
depends on it.

## Minimal Use

```ts
import { createProductAppTuiSurface, renderProductAppTuiFrame } from "@wanex/product-app-tui"

const surface = await createProductAppTuiSurface({ client })
console.log(renderProductAppTuiFrame(surface.snapshot()).text)
await surface.controller.executePaletteEntry({
  id: "product-app-tui.palette.conversation-submit",
  input: {
    text: "hello"
  }
})
await surface.controller.executePaletteEntry({
  id: "product-app-tui.palette.conversation-read"
})
```

## Line Session

The package also exposes an injected IO line session for CLI wrappers, tests,
and simple terminals:

```ts
import { runProductAppTuiLineSession } from "@wanex/product-app-tui"

await runProductAppTuiLineSession({
  surface,
  input,
  write: (chunk) => process.stdout.write(chunk)
})
```

Supported commands are `help`, `ask <text>`, `select <session-id>`,
`workbench [session-id]`, `operation [session-id]`, `cancel [reason]`,
`regenerate [session-id]`, `palette [selector] [json]`,
`commands`, `preview <command-id> [json-input]`,
`execute <command-id> [json-input]`, `events [limit]`, `overview`, `refresh`,
and `quit`.

`ask` submits and returns immediately. `operation` reads durable progress,
`cancel` requests durable cancellation, and `regenerate` creates a fresh turn
from a terminal source operation. `workbench` only renders the canonical
transcript.

`commands` renders Product App's typed dynamic command catalog, including
built-in and plugin-contributed command metadata. It reads through the Product
App surface client and does not load plugin runtime or execute a command.

`preview <command-id> [json-input]` reads the Product App command invocation
policy and renders whether the command is runnable. It does not execute the
command and does not duplicate Product App validation in the TUI layer.

`execute <command-id> [json-input]` explicitly executes a catalog command
through the typed Product App surface client. The presenter prints only the
bounded completion summary or rejection/provider state; it never serializes a
raw heterogeneous command value. The one-shot CLI exposes the same `execute`
command and bounded result contract.

The line session is still a leaf surface. It only uses the Product App surface
client and TUI controller. It does not call App Command Runtime backend APIs,
storage clients, runtime-composition, plugin runtime, connector runtime,
runtime-host, or agent-runtime.

## CLI Host

`@wanex/product-app-tui` includes a local trusted CLI host:

```bash
pnpm --filter @wanex/product-app-tui start -- overview
pnpm --filter @wanex/product-app-tui start -- overview --json
pnpm --filter @wanex/product-app-tui start -- commands
pnpm --filter @wanex/product-app-tui start -- commands --json
pnpm --filter @wanex/product-app-tui start -- events --limit 10
pnpm --filter @wanex/product-app-tui start -- palette product-app.status
pnpm --filter @wanex/product-app-tui start -- preview product.agent.submit '{"text":"hello"}'
pnpm --filter @wanex/product-app-tui start -- execute product.status
pnpm --filter @wanex/product-app-tui start -- interactive
```

From the workspace root, use the demo runner when you want a temporary store
that is cleaned up after the command exits:

```bash
pnpm demo:product-app-tui
pnpm demo:product-app-tui:json
pnpm demo:product-app-tui:interactive
```

The CLI host owns local lifecycle for development and executable product
checks. It reads `WANEX_STORE_DIR`, `WANEX_SYSTEM_SERVICE_BIN`,
`WANEX_PROVIDER_PROFILE_ID`, and `WANEX_PROVIDER_MODEL_ID`, creates the Product
App shell, wraps it with the Product App surface adapter, and then creates the
surface client through the Product App message transport contract.

This CLI host is trusted product entry code. Renderer-like surface code still
does not receive store paths or service binary paths.

For host wiring tests or product hosts that want the same boundary, use:

- `createProductAppTuiHostSurfaceClient({ surface })`;
- `sendProductAppTuiHostSurfaceMessage(surface, request)`.

These helpers do not start a gateway or server. They model the same app-owned
message boundary that Electron, Tauri, Web Worker, or local API integrations can
wrap later.

## Lifecycle

The Product App TUI surface does not own Product App storage or service
lifecycle. The trusted app backend or CLI host owns the Product App shell and
surface adapter. The TUI owns only read-model projection, command execution
through the surface client, line-session orchestration, and terminal rendering
helpers.
