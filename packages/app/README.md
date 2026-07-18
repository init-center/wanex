# @wanex/app

Trusted upper-application backend facade for Wanex.

## Entry Contract

Use `createWanexApp(...)` from a trusted desktop main process, web service, or
CLI backend. The facade owns configured storage, provider setup, Runtime, and
final disposal. Renderers call the product's IPC/API layer and never receive
storage clients, store paths, binary paths, or provider secrets.

## Use when

- a product backend needs a gateway-free local or remote Wanex app owner;
- the product needs a simple agent `run(...)` path;
- a trusted backend needs one bounded lifecycle above Runtime.

## Avoid when

- a headless framework needs product-neutral agent execution; use
  `@wanex/runtime`;
- a renderer wants direct access to storage or internal runtime objects;
- plugin, connector, team, workspace, Electron, Tauri, React, or gateway
  behavior is being added to the default facade closure.

## Minimal Use

```ts
const app = await createWanexApp({ storage, provider })
try {
  const result = await app.run({ text: "Hello" })
} finally {
  await app.dispose()
}
```

## Product Boundary

The root facade exposes only:

- privacy-safe status;
- bounded agent runs;
- idempotent disposal.

Concrete products own command catalogs, typed read models, validation, JSON or
IPC mapping, and renderer contracts above this facade. They may use explicit
App-owned backend modules, but Product concepts are not part of the root App
contract. Internal App Shell, storage, provider, diagnostics, context, and
runtime-host types are not re-exported.

## Lifecycle

`dispose()` is idempotent and releases storage created from the supplied
configuration. The facade does not expose borrowed storage or a renderer-owned
lifecycle.
