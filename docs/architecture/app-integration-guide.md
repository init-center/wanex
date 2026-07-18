# App Integration Guide

## Choose One Entry

Use `@wanex/runtime` for a headless agent product. Use `@wanex/app` for a
trusted product backend that needs safe commands and read models. Do not
reconstruct either default lifecycle from subsystem packages.

```ts
import { createWanexRuntime } from "@wanex/runtime"

const runtime = await createWanexRuntime({ storage, provider })
try {
  const result = await runtime.run({ text: "Hello" })
} finally {
  await runtime.dispose()
}
```

## Advanced Runtime Ownership

Trusted hosts may select narrow Runtime subpaths:

- `/bootstrap` for storage without creating an agent Runtime;
- `/host` for injected stores, custom context compilers, tools, or worker pools;
- `/context` for explicit global/project instructions and skills;
- `/memory` for compaction maintenance;
- `/resources` for image/audio/video/file artifact metadata and projection;
- `/jobs`, `/sessions`, and `/config` for optional capability integration.

Global and project discovery requires explicit roots and trust policy. Skill
bodies are activated on demand and are not injected into ambient context.

## Product Composition

Optional plugins, connectors, teams, workspace mutation, TUI, and A2UI are
selected independently above App. There is no full-composition facade. Product
code owns start order, stop order, grants, secret resolution, and safe
projections for each selected capability.

Electron/Tauri main processes own Runtime/App and expose narrow IPC/preload
contracts. Browser and renderer processes never spawn the system service or
open storage directly. Remote storage clients send credentials, not store
selectors; the trusted control plane derives the store from the authenticated
subject.

## Lifecycle Order

1. Resolve/open storage in the trusted host.
2. Create Runtime or App.
3. Register selected optional capability handlers.
4. Start explicit background loops.
5. Stop product controllers and loops.
6. Dispose App/Runtime, then other independently owned resources.

Injected resources remain open after Runtime/App disposal. Bootstrap failure
must release every resource constructed before the failure.

## Verification

Examples and Eval Harness are tests, not implementation dependencies. Validate
new products against packed public entries and owner-level conformance tests.
Keep plugin/connector/rendering code out of the Runtime root static graph.
