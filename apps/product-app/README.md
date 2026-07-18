# @wanex/product-app

First concrete upper application backend shell for Wanex.

This package consumes the typed `@wanex/app/backend` contract and owns its
Product command catalog, read models, state, and renderer-safe adapter. It is the small backend
shape a desktop main process, web service, or future renderer bridge can own
before choosing Electron, Tauri, React, a terminal renderer, or a channel
integration.

## Entry Contract

Use this package when a real upper app wants the Wanex Product command
surface plus Product-owned selected session, layout, mode, and renderer preference
state.

| Use when | Avoid when |
| --- | --- |
| A product backend needs the concrete Wanex Product shell over App. | A lower runtime package needs reusable primitives. |
| A renderer needs an app-owned IPC/API target instead of raw storage. | You need plugin marketplace, connector runtime, or full runtime-composition by default. |
| You want to validate real app lifecycle without a gateway. | You need a rendered desktop, browser, or terminal UI package. |

## Product Boundary

Call `createProductAppShell(...)` from the trusted app backend. The returned
shell owns:

- one typed App backend lifecycle;
- selected session state;
- layout and mode state;
- renderer preference state;
- Product-owned dispatch through its command port and JSON mapper;
- a transport-neutral surface adapter for future IPC/API/TUI wrappers;
- workbench helpers that can start a new session from first-turn text or use the
  selected session for open/continue flows.

Renderer code should call app-owned wrappers around these methods. It must not
open storage, receive a store path, receive a service binary path, or import
lower runtime packages directly.

The Product backend uses the explicit `@wanex/app/backend` subpath; ordinary
trusted backends that do not need the Wanex Product surface use `@wanex/app`
directly. Renderer code uses `@wanex/product-app/surface-client` and never
imports the backend subpath. Product App does not import `@wanex/storage`,
`@wanex/runtime-composition`, `@wanex/plugin`,
`@wanex/connector`, `@wanex/runtime/host`, or
`@wanex/agent-runtime`.

## Surface Adapter

`createProductAppSurfaceAdapter(app)` exposes the transport-neutral renderer/API
boundary. It is the target future Electron IPC handlers, Tauri commands, local
web APIs, and TUI bridges should wrap.

Surface commands return safe envelopes:

- `{ ok: true, command, value, event }` for successful commands;
- `{ ok: false, command, error, event }` for unknown commands, validation
  failures, and runtime failures.

The descriptor reports the supported commands, input kind, state mutation flag,
and renderer boundary. Surface events record command completion, command
rejection, and app state changes. The adapter does not start a server, register
IPC, render UI, expose storage paths, or expose service binary paths.

## Surface Client

`@wanex/product-app/surface-client` exposes the renderer-side client contract.
Use it from UI, preload, TUI bridge, or local API client code that should call a
surface transport without importing backend shell constructors.

The client depends on a small transport interface:

- `descriptor()`;
- `dispatchSurfaceCommand(request)`;
- `readSurfaceEvents(request)`.

`createInProcessProductAppSurfaceClientTransport(surface)` is available for
tests, recipes, and in-process surfaces. Real Electron, Tauri, Web, and TUI
adapters should implement the same transport interface around their own IPC or
API mechanism. The client normalizes malformed transport responses into safe
surface errors instead of throwing raw transport details into renderer code.

For IPC/API boundaries that pass one message envelope, use the message
transport helpers:

- `createProductAppSurfaceHostEndpoint({ surface })` in trusted app backend
  code when the host wants one reusable message endpoint;
- `handleProductAppSurfaceTransportRequest(surface, request)` in trusted app
  backend code;
- `createMessageProductAppSurfaceClientTransport(send)` in renderer, preload,
  worker, TUI, or local API client code.

The message request kind is `product-app.surface-transport.request` and the
supported operations are `descriptor`, `dispatchSurfaceCommand`, and
`readSurfaceEvents`. The response kind is
`product-app.surface-transport.response`. This is the standard Product App
surface IPC/API contract, but it still does not start a server, register IPC, or
create a gateway. The host endpoint is the recommended shape for future
Electron IPC handlers, Tauri commands, WebWorker bridges, and local API wrappers:
platform code supplies the concrete `send` wiring while Product App keeps the
same safe message contract.

Surface event reads support incremental polling:

- `limit` bounds the returned batch;
- `afterSequence` returns only events with a larger surface event sequence.

Renderer-like clients should remember the highest received `sequence` and pass
it back as `afterSequence` on the next poll. This avoids replaying old events
without adding a long-running gateway, subscription server, or platform-specific
event bus.

## Provider Readiness

`readHome()` includes `providerReadiness`, a renderer-safe summary derived from
the redacted provider profile list. It reports the active profile id, profile
count, whether the active profile exists, whether that provider requires an API
key, whether a redacted key is present, and whether provider-backed work can run.

This is an app-level projection for upper surfaces. It does not expose raw API
keys, storage paths, service binary paths, or provider mutation commands.
Trusted host code should still use `app.providerProfiles` for provider-profile
creation and updates.

## Command Catalog

`readProductCommands()` exposes Product App's contribution-backed command
registry as a renderer-safe typed read model. The Product App surface client
provides the same method, so Web, TUI, preload, worker, and IPC clients can
discover built-in and plugin-contributed command metadata without importing
the Product backend or constructing generic command-port requests.

Catalog reads are side-effect-free. They do not execute commands, require a
runnable provider, load plugin runtime, open storage, or expose secrets.

## Command Preview

`previewProductCommandInvocation(...)` is a side-effect-free Product App read
model for command palettes, IPC validation, TUI detail panels, and channel
surfaces. It reuses Product App's command allow-list and input validation,
then applies Product App's provider run gate.

Provider-backed commands such as `product.agent.run` and
`product.workbench.continue` preview as `provider_not_ready` when the active
provider profile needs trusted host setup. Read-only commands such as
`product.status` remain previewable even when provider-backed work is blocked.
The preview does not create sessions, run a provider, mutate app state, expose
provider setup APIs, or leak secrets.

## Minimal Use

```ts
import {
  createProductAppShell,
  createProductAppSurfaceAdapter,
  createProductAppSurfaceHostEndpoint
} from "@wanex/product-app"
import {
  createInProcessProductAppSurfaceClientTransport,
  createMessageProductAppSurfaceClientTransport,
  createProductAppSurfaceClient
} from "@wanex/product-app/surface-client"

const app = await createProductAppShell({
  storage: {
    kind: "local-system-service",
    storeDir: "/tmp/wanex-product-app"
  },
  artifacts: {
    explicitPath: "/path/to/wanex-system-service"
  },
  providerProfile: {
    id: "local",
    modelId: "fake-local-model"
  }
})

try {
  await app.dispatchProductCommand({
    command: "runAgentTurn",
    input: {
      text: "hello",
      sessionId: "ses_local"
    }
  })
  app.selectSession({ sessionId: "ses_local" })
  const workbench = await app.openWorkbench()
  console.log(workbench.kind)
  const started = await app.startWorkbench({
    text: "start a fresh workbench session"
  })
  console.log(started.kind)

  const surface = createProductAppSurfaceAdapter(app)
  const client = createProductAppSurfaceClient(
    createInProcessProductAppSurfaceClientTransport(surface)
  )
  const envelope = await client.readHome({
    overview: {
      recentSessionLimit: 10
    }
  })
  console.log(envelope.ok)
  const catalog = await client.readProductCommands()
  console.log(catalog.ok ? catalog.value.commands.length : 0)

  const endpoint = createProductAppSurfaceHostEndpoint({ surface })
  const messageClient = createProductAppSurfaceClient(
    createMessageProductAppSurfaceClientTransport((request) =>
      endpoint.send(request)
    )
  )
  console.log((await messageClient.descriptor()).ok)
} finally {
  await app.dispose()
}
```

## Lifecycle

The product app shell opens App Command Runtime during creation and must be
disposed by the trusted app owner. Disposal is idempotent through the underlying
App Command Runtime backend shell. No gateway or daemon is started.
