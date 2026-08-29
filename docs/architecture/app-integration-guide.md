# App Integration Guide

## Choose One Entry

Use `@wanex/runtime` for a product-neutral headless agent harness. Use the
`@wanex/app` root for a trusted application backend that needs safe commands,
read models, provider management, context, diagnostics, or durable conversation
operations. There is no second App backend entry. Do not reconstruct these
lifecycles from subsystem packages.

```ts
import { createWanexRuntime } from "@wanex/runtime"

const runtime = await createWanexRuntime({
  storage: {
    kind: "local-profile",
    rootDir: "/trusted/product/data",
    profileId: "default"
  },
  provider
})
try {
  const reference = await runtime.submit({ text: "Hello" })
  runtime.start()
  const current = await runtime.readOperation(reference)
} finally {
  await runtime.dispose()
}
```

The generated Runtime package installs the matching System Service as an exact
optional dependency and resolves it automatically for local/profile storage.
An ordinary product does not pass `serviceBin`. Remote and injected storage do
not require a native dependency. Explicit path, environment, and manifest
overrides remain available through Runtime artifact options or the advanced
bootstrap subpath for development and custom packaging.

## Advanced Runtime Ownership

Trusted hosts may select narrow Runtime subpaths:

- `/bootstrap` for storage without creating an agent Runtime;
- `/host` for injected stores, custom context compilers, tools, or worker pools;
- `/context` for explicit global/project instructions and skills;
- `/memory` for compaction maintenance;
- `/resources` for image/audio/video/file artifact metadata and projection;
- `/secrets` for trusted-host secret providers and reference resolution;
- `/jobs`, `/sessions`, and `/config` for optional capability integration.

Durable provider profiles store `secretRef`, not credential values. Headless
hosts commonly register `EnvSecretProvider` and use refs such as
`env://OPENAI_API_KEY`; desktop and service products may inject OS keychain or
cloud secret-manager providers through the same resolver port.

Global and project discovery requires explicit roots and trust policy. Skill
bodies are activated on demand and are not injected into ambient context.

## Durable App Conversations

`@wanex/app` owns one long-lived configurable Runtime Host worker pool. A
product may
call `submitConversationOperation(...)` to receive durable `sessionId`,
`inputId`, `turnId`, and `jobId` identifiers before provider completion,
then call
`readConversationOperation(...)` for a bounded
`queued | running | cancel_requested | succeeded | failed | cancelled |`
`interrupted | recovery_required` projection.

The headless `@wanex/app` blocking `runAgentTurn(...)` helper remains a
convenience API over the same processor; interactive product surfaces use the
tracked asynchronous operation contract instead. The helper does not construct
a competing per-turn worker. Local
submissions wake the worker immediately, while fallback polling still detects
jobs created by another process or remote store client. `stop()` drains the
restartable processor without closing storage, and `dispose()` is terminal.
Injected storage remains borrowed.

Operation reads expose bounded transcript/result text and generic terminal
errors. They do not expose scheduler leases, raw job failures, provider events,
storage paths, or secret references. Active provider cancellation is a
separate contract and must not be inferred from processor stop.

Active provider selection is future-admission policy. Each admitted turn stores
an immutable execution binding, so a profile switch affects only later turns.
Regeneration submits a new input, turn, job, and binding with a
`regeneratesTurnId` reference; it never rewrites or retries the old turn.

## Application Composition

Optional plugins, connectors, teams, workspace mutation, TUI, and A2UI are
selected independently above App. There is no full-composition facade. The
product composition owns start order, stop order, grants, secret resolution,
and safe projections for each selected capability.

Electron/Tauri main processes own Runtime/App and expose narrow IPC/preload
contracts. Browser and renderer processes never spawn the system service or
open storage directly. Remote storage clients send credentials, not store
selectors; the trusted control plane derives the store from the authenticated
subject.

Provider configuration follows the same trust boundary. Trusted hosts may
store and edit provider base URLs, secret references, and protocol-specific
settings. Renderer-facing product read models expose only profile identity,
provider/model identity, active state, credential-configured state, and bounded
readiness. Endpoint URLs, secret references, protocol-version fields, and raw
provider wire data never cross the product surface or desktop IPC response.

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
