# @wanex/app

Trusted upper-application App Host for Wanex.

## Entry Contract

Use `createWanexApp(...)` from a trusted desktop main process, web service, or
CLI backend. The root entry owns configured storage, provider policy, context,
one Runtime Host worker pool, restartable processing, and final disposal.

Renderers call a product-owned IPC/API projection. They never receive storage
clients, store paths, binary paths, provider secrets, or Runtime Host handles.

## Use when

- a product backend needs a gateway-free local or remote Wanex owner;
- a product needs durable submit/read/cancel/interrupt/steer operations;
- provider profiles, context, diagnostics, schedules, or workflows belong to a
  trusted application lifecycle;
- multiple sessions should run through one configurable worker pool.

## Avoid when

- a headless framework needs product-neutral execution; use
  `@wanex/runtime`;
- a renderer wants direct storage or mutation access;
- plugin, connector, team, workspace, Electron, Tauri, React, TUI, or A2UI
  implementation is being pulled into the default App closure.

## Minimal Use

```ts
const app = await createWanexApp({
  storage,
  artifacts,
  providerProfile,
  workerCount: 2
})

try {
  const reference = await app.commands.submitConversationOperation({
    text: "Hello"
  })
  const current = await app.commands.readConversationOperation(reference)
} finally {
  await app.dispose()
}
```

## Product Boundary

The root exposes the real App Host contract:

- privacy-safe lifecycle, provider, context, and extension status;
- durable conversation operation commands and bounded read models;
- provider profile commands whose selection affects future admission only;
- context, diagnostics, schedules, workflows, and safe command envelopes;
- restartable `start()/stop()` and terminal idempotent `dispose()`.

An admitted turn stores an immutable execution binding. Switching provider
profiles cannot change queued or running work. Regeneration is a new input,
turn, job, and binding with `regeneratesTurnId`; it is not a retry.

Optional diagnostics and plan/objective workflow implementations remain explicit
subpaths. There is no parallel backend entry or compatibility alias.

## Lifecycle

The App starts its worker pool during construction. `stop()` drains current
work without closing storage and `start()` restarts processing. `dispose()`
is terminal and idempotent. Constructed resources are owned; injected storage
remains borrowed.
