# @wanex/product

First concrete upper application backend shell for Wanex.

This package consumes the typed `@wanex/app` contract and owns its
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

Call `createShell(...)` from the trusted app backend. The returned
shell owns:

- one typed App backend lifecycle;
- selected session state;
- layout and mode state;
- renderer preference state;
- an explicit New chat selection intent that creates no empty Runtime session;
- Product-owned dispatch through its command port and JSON mapper;
- a transport-neutral surface adapter for future IPC/API/TUI wrappers;
- tracked asynchronous conversation submit/read/cancel/regenerate operations;
- a read-only workbench projection over the selected session's canonical transcript.

Renderer code should call app-owned wrappers around these methods. It must not
open storage, receive a store path, receive a service binary path, or import
lower runtime packages directly.

## Conversation And Session Semantics

`startNewConversation()` clears only the Product-owned selected session and
returns to chat mode. It does not create an empty Runtime session, cancel a
running operation, remove transcript data, or mutate another session. The next
`submitConversationOperation(...)` without a `sessionId` admits the first user
turn, creates the durable session, and selects the receipt's session. Runtime
derives one bounded navigation line from the first meaningful line of that
first message. This affects only automatic Session metadata: the complete
admitted message remains unchanged, and explicit titles plus revision-fenced
manual renames remain canonical.

An admitted turn freezes its complete model endpoint binding. Changing the
active endpoint while a turn is running affects only later admissions; it does
not rewrite or redirect the active turn.

The Product backend uses the `@wanex/app` root; ordinary trusted backends that
do not need the Wanex Product surface use the same root directly. Renderer code
uses `@wanex/product/surface` and never
imports the backend subpath. The application does not import `@wanex/storage`,
`@wanex/runtime-composition`, `@wanex/plugin`,
`@wanex/connector`, `@wanex/runtime/host`, or
`@wanex/agent-runtime`.

## Surface Adapter

`createSurfaceAdapter(app)` exposes the transport-neutral renderer/API
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

`@wanex/product/surface` exposes the renderer-side client contract.
Use it from UI, preload, TUI bridge, or local API client code that should call a
surface transport without importing backend shell constructors.

The client depends on a small transport interface:

- `descriptor()`;
- `dispatchSurfaceCommand(request)`;
- `readSurfaceEvents(request)`.

`createInProcessSurfaceClientTransport(surface)` is available for
tests, recipes, and in-process surfaces. Real Electron, Tauri, Web, and TUI
adapters should implement the same transport interface around their own IPC or
API mechanism. The client normalizes malformed transport responses into safe
surface errors instead of throwing raw transport details into renderer code.

For IPC/API boundaries that pass one message envelope, use the message
transport helpers:

- `createSurfaceHostEndpoint({ surface })` in trusted app backend
  code when the host wants one reusable message endpoint;
- `handleSurfaceTransportRequest(surface, request)` in trusted app
  backend code;
- `createMessageSurfaceClientTransport({ send, subscribe })` in
  renderer, preload, worker, TUI, or local API client code.

The message request kind is `product.surface-transport.request` and the
supported operations are `descriptor`, `dispatchSurfaceCommand`, and
`readSurfaceEvents`. The response kind is
`product.surface-transport.response`. This is the standard application
surface IPC/API contract, but it still does not start a server, register IPC, or
create a gateway. The host endpoint is the recommended shape for future
Electron IPC handlers, Tauri commands, WebWorker bridges, and local API wrappers:
platform code supplies the concrete `send` wiring while the application keeps the
same safe message contract.

Surface events support bounded replay plus process-local subscription:

- `limit` bounds the returned batch;
- `streamId + afterSequence` identify the next retained event page;
- `gap` requires reconciliation from canonical Product reads;
- `subscribeSurfaceEvents(listener)` delivers new process-local events.

Platform transports should preserve event order, keep delivery buffers bounded,
and use replay after reconnect. Events are advisory: invalidation, stream
change, or gap always resolves through canonical Product reads.

## Schedule Surface

Schedule management uses the same Surface contract as the rest of the Product:
`listSchedules`, `readSchedule`, `createSchedule`, `replaceSchedule`,
`setScheduleEnabled`, and `removeSchedule`. Schedule mutations use exact
expected revisions. Schedule invalidation events carry only a revision and
timestamp; clients refresh the canonical list or detail read model instead of
treating event payloads as cached state. The Surface never exposes the trusted
Local Host scheduler, occurrence records, pending index, timers, or execution
identities.

## Provider Readiness

`readHome()` includes `providerReadiness`, a renderer-safe summary derived from
the redacted model endpoint list. It reports the active endpoint id, endpoint
count, whether the active endpoint exists, whether that endpoint requires a
credential, whether one is configured, and whether provider-backed work can run.

This is an app-level projection for upper surfaces. It does not expose raw API
keys, secret references, storage
paths, service binary paths, provider wire data, or provider mutation commands.
Trusted host code should still use the modelEndpoints facade for complete
model-endpoint creation and updates.

## Command Catalog

`readProductCommands()` exposes application's contribution-backed command
registry as a renderer-safe typed read model. The application surface client
provides the same method, so Web, TUI, preload, worker, and IPC clients can
discover built-in and plugin-contributed command metadata without importing
the Product backend or constructing generic command-port requests.

Catalog reads are side-effect-free. They do not execute commands, require a
runnable provider, load plugin runtime, open storage, or expose secrets.
The catalog is intentionally broader than an ordinary command palette and
includes hidden lifecycle, diagnostics, and programmatic commands.

Each command carries explicit `paletteVisibility`. Web and full-screen TUI
palettes show only `visible` rows. Consumers must not infer presentation from
ids, categories, source kind, or handler references.

`inputSchema` is present for every command that accepts structured input and
absent only for commands that accept no input. Optional object input is a
closed schema submitted as `{}` when no optional fields are selected. Preview
and execute both apply Product schema validation before handler semantics.

When an injected Extension catalog publishes a changed generation, Product
emits one revision-only command-catalog invalidation through the existing
Surface event log. The current source revision is the subscription baseline, so
startup does not emit a synthetic change even when a source replays its current
value on subscribe. Consumers must respond by calling `readProductCommands()`;
the event never carries command deltas, Plugin metadata, paths, trust records,
execution jobs, or secrets. Identical publications and failed host refreshes do
not invalidate the Product catalog.

## Command Preview

`previewProductCommandInvocation(...)` is a side-effect-free application read
model for command palettes, IPC validation, TUI detail panels, and channel
surfaces. It reuses application's command allow-list and input validation,
then applies application's provider run gate.

Provider-backed commands such as `product.agent.submit` preview as
`provider_not_ready` when the active model endpoint needs trusted host setup.
Read-only commands such as
`product.status` remain previewable even when provider-backed work is blocked.
The preview does not create sessions, run a provider, mutate app state, expose
provider setup APIs, or leak secrets.

## Minimal Use

```ts
import {
  createShell,
  createSurfaceAdapter,
  createSurfaceHostEndpoint
} from "@wanex/product"
import {
  createInProcessSurfaceClientTransport,
  createMessageSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/product/surface"

const app = await createShell({
  storage: {
    kind: "local-system-service",
    storeDir: "/tmp/wanex-product"
  },
  artifacts: {
    explicitPath: "/path/to/wanex-system-service"
  },
  modelEndpoint: {
    id: "local",
    modelId: "fake-local-model"
  }
})

const surface = createSurfaceAdapter(app)
try {
  await app.startNewConversation()
  const submitted = await app.submitConversationOperation({
    text: "hello"
  })
  console.log(submitted.kind)
  if (submitted.kind === "product.conversation-operation.submitted") {
    const operation = await app.readTrackedConversationOperation({
      sessionId: submitted.operation.sessionId
    })
    console.log(operation.kind)
  }

  const client = createSurfaceClient(
    createInProcessSurfaceClientTransport(surface)
  )
  const envelope = await client.readHome({
    overview: {
      recentSessionLimit: 10
    }
  })
  console.log(envelope.ok)
  const catalog = await client.readProductCommands()
  console.log(catalog.ok ? catalog.value.commands.length : 0)

  const endpoint = createSurfaceHostEndpoint({ surface })
  const messageClient = createSurfaceClient(
    createMessageSurfaceClientTransport({
      send: (request) => endpoint.send(request),
      subscribe: (listener) => endpoint.subscribe(listener)
    })
  )
  console.log((await messageClient.descriptor()).ok)
} finally {
  await surface.dispose()
  await app.dispose()
}
```

## Lifecycle

The Product shell opens the Wanex App Host during creation and must be
disposed by the trusted app owner. A surface adapter subscribes to ephemeral
conversation events, so dispose every adapter before disposing the shell.
Disposal is idempotent. No gateway or daemon is started.
