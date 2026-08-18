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
- model endpoints and protocol-fidelity adapters;
- context and memory compaction foundations;
- workspace task, changeset, proposal, apply, git, and isolation runtimes;
- delegation graph and runtime foundations;
- team conversation orchestration;
- plugin manifest, install, trust, permission, and action execution runtime;
- connector/channel runtime contracts and reference adapters;
- resource/media and A2UI projection contracts;
- app-facing runtime composition;
- public Runtime/App facades, a concrete desktop Product, local application
  Web/TUI hosts, and a regression harness.

The Kernel is not coupled to Electron, a gateway-first daemon, a UI renderer,
a marketplace, or a concrete channel SDK bundle. The workspace includes one
private Electron leaf that packages the concrete desktop Product.

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

`@wanex/product` is the first concrete upper app backend shell. It consumes
the typed `@wanex/app` contract, owns its command catalog and selected
session/layout/mode/preference state, and exposes a Product-owned command
adapter and surface client without selecting
plugin runtime, connector runtime, runtime-composition, runtime-host, or raw
storage as default app dependencies.

`@wanex/plugin-command-host` is the explicit hot application entry for
plugin-backed commands. It shares one injected store across submission, worker
execution, and activity reads, exposes a Product creation binding, and owns
explicit worker start/stop lifecycle without creating a second Product Shell.
Its optional trusted management handle couples native local-package selection,
one-shot review, exact install-state CAS, immutable materialization, and catalog
refresh without exposing paths to a renderer. Default application/Web/TUI
packages do not depend on it.

`@wanex/tui` is an optional leaf terminal surface over application.
It consumes `@wanex/product/surface` and projects application state
into Pi full-screen and injected line-session presentation without becoming
part of the default application closure. Product's dynamic command catalog is
its only generic command authority.

`@wanex/web` is the browser-safe upper Web surface. application
Local owns its thin Node host as the `@wanex/local-host/web-host`
subpath. Together they expose application through a renderer-neutral request
envelope, not a gateway or framework runtime.

`@wanex/local-host` is the direct local Web application product entry. A
trusted local backend uses it to open local profile/store storage, create
application, attach Web application, and serve the thin Node host while keeping
renderers away from store paths, service binary paths, secrets, and raw storage
clients. Its trusted host handle exposes narrow `settings` and
`modelEndpoints` facades so desktop, CLI, and local backend code do not need
to mutate storage or provider config directly. Use `readSnapshot()` for a safe
startup/status read model.

`@wanex/local-host/desktop-host` is the framework-free trusted desktop
main-process subpath over Local Host. It starts the local product
lifecycle, exposes a safe request envelope for snapshots, Web application
requests, and redacted model-endpoint reads/switching, and closes resources
without depending on Electron, Tauri, or a packaged desktop runtime.

`@wanex/desktop` is the actual private Electron Product. It owns
one secure BrowserWindow, starts Product Local on an ephemeral loopback origin,
loads the real Product Web UI, and closes the Host and System Service before
exit. It ships one ASAR plus explicit System Service and keyring artifacts;
there is no application `node_modules`, preload, generic IPC bridge, Gateway,
or restart supervisor.

To start the real persistent desktop Product directly from the repository:

```bash
pnpm start:desktop
```

This command builds the host System Service and Desktop artifacts, then opens
the normal Provider onboarding and Product lifecycle. It does not use the
isolated fake endpoint or receipt behavior reserved for packaged proof.

To package and prove the desktop Product on the current host:

```bash
pnpm stage:native -- --target darwin-arm64
pnpm proof:desktop
```

The proof drives five isolated lifecycle samples and a separate eleven-process
same-profile journey through the visible Product DOM. The relaunch journey
proves credential-free conversation continuity, attachment picker/paste/drop
input, ordinary composer-driven image generation through `image_generate`,
trusted Resource preview, explicit Plan review and approval followed by
same-Session execution, bounded Goal auto-continuation with independent
verification, cancellation after transient output followed by fresh
same-Session regeneration, one explicit queue-after-current follow-up that
preserves and completes its parent before promoting a fresh child operation,
one tool-free Side Query that remains outside canonical history while its
parent continues normally,
exact Provider cleanup, and a final unconfigured reopen. It
preserves a screenshot under
`target/distribution/product-desktop` and verifies complete process cleanup.

To try the direct local product host after building the system-service binary:

```bash
cargo build -p wanex-system-service
pnpm --filter @wanex/local-host start -- \
  --profile-root ./.wanex-local-host \
  --profile-id default \
  --model-endpoint-id local \
  --provider-model-id local-model
```

The root demo aliases delegate to `@wanex/local-host` for seeded/blank
Web application behavior:

```bash
pnpm demo:web:blank
```

Use `pnpm demo:web:seeded` for a pre-populated session or
`pnpm demo:web -- --open` to open the system browser. The local
browser receives progress through an authenticated event stream and performs
canonical reconciliation after invalidation or uncertainty.

The optional TUI surface also has root demo aliases that run with a
temporary store and clean up after exit:

```bash
pnpm demo:tui
pnpm demo:tui:json
pnpm demo:tui:interactive
pnpm demo:tui:fullscreen
```

The `fullscreen` alias starts the Pi-powered interactive Product TUI. Use
`Ctrl+Q` to exit. The `interactive` alias remains the injected line-oriented
surface for automation and simple terminal consumers.

For a bounded low-thermal Local Host path check, run:

```bash
pnpm --silent smoke:local-host
```

The smoke command starts Local Host with a temporary profile root outside
the workspace, verifies the local Web document, layout action, workbench start
action, and product privacy boundary, prints one JSON result to stdout, closes
the host, and exits. Use the `--silent` pnpm form when stdout must be directly
parseable as JSON. Extra CLI flags can be appended after the script name when
you need to override details such as `--port` or `--service-bin`.

To check the user-visible provider feedback contract across Web and TUI without
running the full eval suite:

```bash
pnpm smoke:product-feedback
```

This focused smoke reuses the application feedback matrix eval scenario. It
proves that a missing provider key is shown as blocked in Web and TUI, then a
trusted host setup activates a ready provider and the same Web/TUI paths
complete without exposing secrets or host-only paths.

Concrete application hosts under `apps/` are leaf products, not implementation
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
  product/
  plugin-command-host/
  desktop/
  local-host/
  tui/
  web/
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
pnpm --filter @wanex/local-host check
pnpm --filter @wanex/local-host test -- web-host
pnpm audit:structure
```

To inspect package and file-structure health:

```bash
pnpm audit:structure
```
