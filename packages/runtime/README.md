# @wanex/runtime

Product-neutral Wanex runtime facade.

## Entry Contract

Use this package for durable single-agent admission and worker execution without
assembling storage bootstrap, model endpoints, agent runtime, or runtime host
packages directly.

## Use when

- a headless framework, CLI, service, or advanced product needs agent runs;
- configured local or remote storage should be owned by one runtime handle;
- foreground `run()` and background `start()`/`stop()` execution are both needed.

## Avoid when

- a trusted application needs product commands and read models; use
  `@wanex/app`;
- plugin, connector, team, workspace, or UI policy is being added to the default
  runtime closure.

## Bootstrap Subpath

Advanced trusted hosts can import `@wanex/runtime/bootstrap` to resolve the
system-service artifact and open local, profile, remote, or injected storage
without creating an agent Runtime. Handles created by bootstrap are owned;
injected handles are borrowed and remain open after bootstrap disposal.

Generated Runtime packages declare exact optional dependencies on the four
supported native targets. Default local/profile Runtime construction resolves
the matching installed package automatically. Explicit path, environment, and
manifest overrides remain available for trusted development/custom packaging;
remote and injected storage require no local artifact.

## Provider Subpath

Advanced provider integrations import `@wanex/runtime/provider`. The primary
adapter contract is `stream(request): AsyncIterable<ProviderEvent>`; Runtime
normalizes text, reasoning, tool-call, usage, finish, and structured error
events before upper applications observe them. Provider wire responses and SSE
never cross this boundary.

Provider deltas are transient run observations. Runtime writes one completed
assistant message only after a valid finish event. Abort, timeout, malformed
streams, and failures after partial output fail the run without persisting a
false completion.

## Execution Subpath

Trusted Node hosts can import `@wanex/runtime/execution` for argv-only local
process execution with bounded stdout/stderr and tree-aware cancellation. The
host owns process lifecycle only: it is not an authorization policy, shell,
PTY, background terminal, or OS sandbox. Timeout and cancellation wait for a
bounded cleanup attempt before settling.

Runtime tools imported from `@wanex/runtime/tools` keep permission decisions and
durable execution records. A resource-owning tool can declare that cancellation
must drain its invocation promise before the durable terminal state is recorded;
that tool remains responsible for a bounded cleanup promise.

Every registered tool must also provide a `runtimeBinding`. The implementation
ID and revision identify executable semantics; the optional configuration
digest is created with `createToolRuntimeBinding()` from secret-free semantic
configuration. Provider-visible definitions come from `registry.list()`.
Admission/recovery evidence comes from `registry.snapshot()`, and any drift is
rejected before provider dispatch rather than silently using a new handler.

When the first admitted Turn creates a Session without an explicit title,
Runtime derives one deterministic navigation line from the first meaningful
line of the first text part. Leading Markdown block markers are omitted only
from this automatic metadata, code-fence contents remain literal, and the
existing 200-code-point bound is Unicode-safe. The canonical input is never
normalized or truncated. Explicit titles and later revision-fenced renames do
not pass through automatic derivation.

## Minimal Use

```ts
const runtime = await createWanexRuntime({
  storage: {
    kind: "local-profile",
    rootDir: "/trusted/product/data"
  },
  provider
})
try {
  const result = await runtime.run({ text: "Hello" })
} finally {
  await runtime.dispose()
}
```

## Lifecycle

`start()` begins background worker loops. `stop()` stops those loops and keeps
the runtime restartable. `dispose()` is idempotent, stops workers, and releases
configured storage owned by the facade.
