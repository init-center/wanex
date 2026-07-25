# Wanex

Wanex is an Agent Runtime Kernel project.

The name comes from "wane and wax": runtime state contracts and expands,
context is compressed and restored, tasks fan out and converge, and
long-running agent work moves between active execution and durable recovery.

## Current Scope

Wanex is now a workspace-stage runtime kernel with:

- Rust `system-service` backed by SQLite;
- TypeScript protocol and storage client;
- durable session, event, scheduler, worker, and agent runtimes;
- provider profiles and provider fidelity helpers;
- context and memory compaction foundations;
- workspace task, changeset, proposal, apply, git, and isolation runtimes;
- delegation graph and runtime foundations;
- team conversation orchestration;
- plugin manifest, install, trust, permission, and action execution runtime;
- connector/channel runtime contracts and reference adapters;
- resource/media and A2UI projection contracts;
- app-facing runtime composition;
- public Runtime/App facades, a frozen validation product, local Product App
  Web/TUI hosts, and a regression harness under reconstruction.

Wanex is not an Electron app, gateway-first daemon, UI renderer, marketplace, or
concrete channel SDK bundle.

## App Entry Points

For product-neutral agent execution, use one runtime entry:

- Default agent runtime: `@wanex/runtime`. It owns configured storage,
  provider initialization, foreground or background worker lifecycle, and
  final disposal.

For a trusted upper application backend, use one app entry:

- Default upper-product backend: `@wanex/app`. A trusted desktop main
  process, web service, or CLI owner runs agent work or calls safe commands and
  exposes its own IPC/API/UI surface above them.

Optional capabilities are explicit:

- Add capability packages such as plugin, connector, team conversation, or
  workspace runtime only when the product selects that capability.
- Advanced subpaths such as `@wanex/runtime/host`,
  `@wanex/runtime/context`, `@wanex/runtime/provider`, and
  `@wanex/runtime/jobs` are explicit integration
  entries for trusted hosts that deliberately own those subsystem lifecycles.
  They are not the default application integration path.
- Custom provider adapters and normalized streaming observation use
  `@wanex/runtime/provider`; applications never parse provider SSE.
- Advanced trusted hosts that deliberately own storage bootstrap use the
  explicit `@wanex/runtime/bootstrap` subpath.
- Product regression entry: `@wanex/eval-harness`.

`@wanex/product-app` is the first concrete upper app backend shell. It consumes
the typed `@wanex/app` contract, owns its command catalog and selected
session/layout/mode/preference state, and exposes a Product-owned command
adapter and surface client without selecting
plugin runtime, connector runtime, runtime-composition, runtime-host, or raw
storage as default app dependencies.

`@wanex/product-app-command-host` is the explicit hot Product App entry for
plugin-backed commands. It shares one injected store across submission, worker
execution, and activity reads, and owns explicit worker start/stop lifecycle.
Default Product App/Web/TUI packages do not depend on it.

`@wanex/product-app-tui` is an optional leaf terminal surface over Product App.
It consumes `@wanex/product-app/surface-client` and projects Product App state
into TUI shell contracts without becoming part of the default Product App
closure.

`@wanex/product-app-web` is the browser-safe upper Web surface. Product App
Local owns its thin Node host as the `@wanex/product-app-local/web-host`
subpath. Together they expose Product App through a renderer-neutral request
envelope, not a gateway or framework runtime.

`@wanex/product-app-local` is the direct local Product App Web product entry. A
trusted local backend uses it to open local profile/store storage, create
Product App, attach Product App Web, and serve the thin Node host while keeping
renderers away from store paths, service binary paths, secrets, and raw storage
clients. Its trusted host handle exposes narrow `settings` and
`providerProfiles` facades so desktop, CLI, and local backend code do not need
to mutate storage or provider config directly. Use `readSnapshot()` for a safe
startup/status read model.

`@wanex/product-app-local/desktop-host` is the framework-free trusted desktop
main-process subpath over Product App Local. It starts the local product
lifecycle, exposes a safe request envelope for snapshots, Product App Web
requests, and redacted provider-profile reads/switching, and closes resources
without depending on Electron, Tauri, or a packaged desktop runtime.

To try the direct local product host after building the system-service binary:

```bash
cargo build -p wanex-system-service
pnpm --filter @wanex/product-app-local start -- \
  --profile-root ./.wanex-product-app-local \
  --profile-id default \
  --provider-profile-id local \
  --provider-model-id local-model \
  --poll-interval-ms 0
```

The root demo aliases delegate to `@wanex/product-app-local` for seeded/blank
Product App Web behavior:

```bash
pnpm demo:product-app-web:blank
```

Use `pnpm demo:product-app-web:seeded` for a pre-populated session,
`pnpm demo:product-app-web -- --poll-interval-ms 0` to disable browser
polling, or `pnpm demo:product-app-web -- --open` to open the system browser.

The optional Product App TUI surface also has root demo aliases that run with a
temporary store and clean up after exit:

```bash
pnpm demo:product-app-tui
pnpm demo:product-app-tui:json
pnpm demo:product-app-tui:interactive
```

For a bounded low-thermal Product App Local path check, run:

```bash
pnpm --silent smoke:product-app-local
```

The smoke command starts Product App Local with a temporary profile root outside
the workspace, verifies the local Web document, layout action, workbench start
action, and product privacy boundary, prints one JSON result to stdout, closes
the host, and exits. Use the `--silent` pnpm form when stdout must be directly
parseable as JSON. Extra CLI flags can be appended after the script name when
you need to override details such as `--port` or `--service-bin`.

To check the user-visible provider feedback contract across Web and TUI without
running the full eval suite:

```bash
pnpm smoke:product-app-feedback
```

This focused smoke reuses the Product App feedback matrix eval scenario. It
proves that a missing provider key is shown as blocked in Web and TUI, then a
trusted host setup activates a ready provider and the same Web/TUI paths
complete without exposing secrets or host-only paths.

Concrete Product App hosts under `apps/` are leaf products, not implementation
dependencies for another product. Packed external-consumer fixtures validate
ordinary SDK adoption. Eval Harness validates release contracts and
deterministic fixtures; owner tests retain subsystem behavior.

See [Public Contracts](docs/architecture/public-contracts.md) for the current
package tiers and dependency direction. See
[Package Structure Rules](docs/architecture/package-structure.md) for package
boundary and large-file audit guidance. See
[App Integration Guide](docs/architecture/app-integration-guide.md) for concrete
bootstrap and runtime recipes. See
[Release / CI Contract](docs/architecture/release-ci-contract.md) for the
required verification gate.

## Repository Layout

```text
apps/
  cli/
  product-app/
  product-app-command-host/
  product-app-local/
  product-app-tui/
  product-app-web/
  product-app-web-node-host/
crates/
  system-service/
packages/
  protocol/
  storage/
  runtime/
  app/
  eval-harness/
  ...explicit optional capabilities
docs/
  architecture/
  specs/
```

## Architecture Rules

Runtime state must go through the storage/system-service boundary instead of ad
hoc JSON file writes.

SQLite is the runtime source of truth. JSON/JSONL is allowed for manifests,
debug data, import/export, and user-editable non-concurrent config, but not for
primary concurrent runtime state.

Kernel packages must not depend on platform apps, UI renderers, concrete channel
SDKs, Electron, React, or gateway-only lifecycle code.

Gateway/control-plane behavior is optional. Wanex should remain usable through
explicit app runtime construction without a hidden restart-sensitive daemon.

## Validation

Wanex uses a current Node.js baseline. The repository requires `>=26` in
`package.json` and intentionally does not pin a Node patch version with
`.node-version`; local development and CI should use a recent Node release on
or above that floor. The workspace pins the exact Corepack package manager via
`packageManager` and supports native `pnpm` `>=11 <12` through `engines.pnpm`.
Corepack is not a runtime dependency, but when used it must resolve the
project-pinned pnpm version. Generated first-RC packages separately target and
declare Node `>=24`, with packed consumer evidence on Node 24 LTS and Node 26
Current.

The required release gate is:

```bash
pnpm verify
```

`pnpm verify` is a full workspace gate. It can be CPU-intensive because it runs
workspace checks, tests, Rust checks, audits, and eval smoke scenarios. For
normal local iteration, run focused package checks first and reserve the full
gate for deliberate release or CI validation.

Workspace package tests build the Rust `wanex-system-service` binary once before
running package-local Vitest suites. Direct package tests remain self-contained:
when you run a single package's `test` script, that package prepares the
system-service binary for itself.

Before running the full gate, inspect local toolchain readiness with:

```bash
pnpm doctor:toolchain
```

If `pnpm` is missing or outside the supported major version, bootstrap a single
command with npm:

```bash
npm exec --yes --package=pnpm@latest-11 -- pnpm verify
```

For local debugging, the individual checks are:

```bash
pnpm check
pnpm test
cargo fmt -- --check
cargo test
cargo clippy --all-targets -- -D warnings
pnpm security:js
pnpm security:rust
```

The two security commands perform complete JavaScript and Rust advisory scans
without ignore lists. They run once in the Linux release lane rather than once
per native target.

## Compiled SDK

Workspace manifests stay private and source-first for local development. SDK
artifacts are generated separately under `target/sdk`, so workspace checks and
tests never require a prior emitting build.

Build compiled ESM and rolled declarations for the four-package first-RC
closure (`@wanex/runtime`, `@wanex/app`, `@wanex/storage`, and
`@wanex/extension`):

```bash
pnpm build:sdk
```

Produce and validate deterministic tarballs, API reports, package resolver
contracts, and a temporary external npm consumer:

```bash
pnpm release:sdk
pnpm proof:sdk-consumers
pnpm audit:sdk-determinism
```

The generated packages expose 29 explicit entries, contain no TypeScript
source, workspace ranges, internal `@wanex/protocol` dependency, or
`@wanex/storage/testing` export, and require no `tsx` loader. They are ESM-only,
target Node 24 where Node APIs are owned, and declare `UNLICENSED` until a
repository license is selected. Connector, MCP, Plugin, Storage Control Plane,
Team, and Workspace remain source-preview capabilities and are not generated
or published by this first-RC pipeline.

Generated `@wanex/runtime` declares exact optional dependencies on four
target-restricted System Service packages. Create one from an already staged
native artifact:

```bash
pnpm stage:native -- --target darwin-arm64
pnpm release:native -- --target darwin-arm64
```

These are generated artifacts rather than source workspace packages. Each
contains one verified executable and the existing native manifest, with no JS
dependency tree, postinstall, downloader, or bundled `node_modules`.

`proof:sdk-consumers` installs four independent projects from a temporary
loopback npm registry and executes minimal Runtime, trusted App, provider/tool,
and local Storage journeys. Runtime/App resolve the matching installed native
package without an explicit path or environment override. Its machine-readable
receipt is written to
`target/external-consumers/report.json`.

For focused iteration, prefer package-local checks first, then run
`pnpm audit:structure`:

```bash
pnpm --filter @wanex/product-app-local check
pnpm --filter @wanex/product-app-local test -- web-host
pnpm audit:structure
```

To inspect package and file-structure health:

```bash
pnpm audit:structure
```
