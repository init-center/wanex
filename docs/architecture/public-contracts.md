# Public Contracts

## Consumer Entries

Default agent runtime: `@wanex/runtime`.

Default upper-product backend: `@wanex/app`.

Internal implementation packages are not ordinary consumer entries.

Ordinary headless agent products start with `@wanex/runtime`. Trusted product
backends start with `@wanex/app`. Neither facade imports optional capability or
upper-product implementations by default.

The `@wanex/app` root is the one trusted App Host contract for safe command
groups, read models, provider policy, and durable conversation operations. It
reuses session
inbox input, `session.turn` job, logical turn, physical attempt, event, and
canonical transcript records; the public operation reference is the stable
`sessionId + inputId + turnId + jobId` tuple, not a parallel operation table.
Attempt identity is execution evidence created only after a worker starts the
turn, so it is not part of the submission reference. The App-owned configurable
worker pool is restartable with `start()/stop()` and closes only owned
resources on `dispose()`. There is no parallel App backend public subpath.

Runtime exposes explicit advanced subpaths:

- `@wanex/runtime/bootstrap`: system-service artifact and storage ownership;
- `@wanex/runtime/host`: agent and worker-pool host lifecycle;
- `@wanex/runtime/jobs`: scheduler workers and durable job integration;
- `@wanex/runtime/sessions`: sessions, turns, attempts, admission, budgets, and control;
- `@wanex/runtime/tools`: tool catalog, policy, validation, and execution;
- `@wanex/runtime/execution`: lazy argv process host, bounded capture, and
  tree-aware cancellation for trusted Node owners;
- `@wanex/runtime/config`: durable config and hot reload;
- `@wanex/runtime/context`: instructions, skills, context compilation;
- `@wanex/runtime/memory`: compaction planning and maintenance;
- `@wanex/runtime/provider`: provider profiles, streaming, replay fidelity;
- `@wanex/runtime/media-generation`: explicit asynchronous image/audio/video
  generation adapters, durable polling, cancellation, recovery, and bounded
  output materialization. The Runtime root does not re-export this capability;
  callers opt in through this subpath and provide provider-owned materializers.
- `@wanex/runtime/resources`: renderer-free resource and media projection;
- `@wanex/runtime/secrets`: lazy secret providers, reference resolution, and
  non-serializable resolved-secret lifecycle for trusted hosts.

These are export entry points, not separate npm package identities.

## Optional Capabilities

- `@wanex/mcp`: source-preview official MCP transport adapters for Runtime tools;
- `@wanex/workspace`: source-preview changesets, review, isolation, Git, durable tasks, and
  explicitly registered coding tools;
- `@wanex/team`: source-preview bounded team conversation and coding delegation policies;
- `@wanex/extension`: dependency-free contribution contracts and resolution;
- `@wanex/plugin`: source-preview plugin trust, install, sandbox, process, and worker lifecycle;
- `@wanex/connector`: source-preview channel contracts, host lifecycle, packaging, and
  credential-reference consumption;
- `@wanex/storage-control-plane`: source-preview authenticated remote-store
  deployment.

Provider and Connector hosts consume `@wanex/runtime/secrets`; the Runtime root
does not eagerly import it. Workspace and Team expose focused subpaths for
advanced consumers. Optional capabilities are selected and owned by trusted
upper applications; no universal composition package exists.

`@wanex/runtime/execution` and `@wanex/workspace/tools` are export subpaths, not
package identities or default-facade dependencies. Runtime owns generic tool
permission and durable audit. Workspace owns path confinement, program aliases,
and changeset-backed mutation. Neither contract exposes arbitrary shell input,
claims OS sandboxing, or registers tools globally.

Every Runtime `ToolDefinition` carries a secret-free `runtimeBinding` with an
implementation ID, implementation revision, and optional semantic
configuration digest. `ToolRegistry.list()` remains provider-facing and omits
that host evidence; `ToolRegistry.snapshot()` is the exact durable turn
contract. A restarted worker rejects missing, additional, descriptor-changed,
implementation-changed, configuration-changed, or permission-policy-changed
tools before provider dispatch. Durable tool execution records retain the same
binding evidence. Optional capability owners adapt through Tool Registry; no
plugin-, MCP-, workspace-, connector-, or team-specific field enters the
session protocol.

## Applications

- `@wanex/cli`: executable headless CLI;
- `@wanex/product-app`: validation product backend;
- `@wanex/product-app-command-host`: optional Product plugin execution host;
- `@wanex/product-app-local`: local executable lifecycle owner;
- `@wanex/product-app-web`: browser-safe Product surface;
- `@wanex/product-app-tui`: terminal Product surface and executable host;
`@wanex/protocol` remains internal cross-language contract source.
`@wanex/eval-harness` remains test-only.

## Compiled Distribution

The first-RC compiled SDK publication set is exactly `@wanex/runtime`,
`@wanex/app`, `@wanex/storage`, and `@wanex/extension`. The other optional
capabilities remain valid source owners but are not generated or published
until real consumers and clean packed dependency journeys justify them.
Workspace source manifests remain private and point at `src` for development;
generated package manifests under `target/sdk` point only at ESM JavaScript
and rolled declarations.

`@wanex/storage/testing` is a source-only test helper. It is not a generated
export, API report, or tarball file.

Internal `@wanex/protocol` implementation and types are bundled into each
artifact that needs them and never appear as a packed dependency or module
reference. Dependencies between justified public Wanex identities remain exact
npm dependencies rather than peers or duplicated mega-bundle code. Apps,
examples, Eval, CLI, and Product packages are not SDK artifacts.

Every generated public export has a committed API Extractor report. Normal SDK release
proof fails on unapproved API drift, source/internal dependency leakage,
resolver errors, non-deterministic tarballs, or an external Node/TypeScript/
bundler consumer failure. Four isolated packed-SDK consumers additionally
prove minimal Runtime, App, provider/tool, and local Storage execution from
normal registry dependencies.

## Ownership

Constructed storage handles, processes, workers, and loops are owned. Injected
resources are borrowed. `stop()` drains restartable work; `dispose()` is
terminal and closes only owned resources.

Renderer code never receives stores, store paths, system-service paths,
provider secrets, or host mutation APIs. A gateway is optional control-plane
infrastructure, not the Runtime entry.

## Enforcement

Run the public-contract, package-governance, facade-footprint, distribution,
source packlist, compiled SDK artifact/package/API/determinism, structure, and
workspace-hygiene audits. Wanex is pre-stable: replace incorrect boundaries
directly and do not add compatibility packages or aliases.
