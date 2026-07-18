# Public Contracts

## Consumer Entries

Default agent runtime: `@wanex/runtime`.

Default upper-product backend: `@wanex/app`.

Internal implementation packages are not ordinary consumer entries.

Ordinary headless agent products start with `@wanex/runtime`. Trusted product
backends start with `@wanex/app`. Neither facade imports optional capability or
upper-product implementations by default.

Runtime exposes explicit advanced subpaths:

- `@wanex/runtime/bootstrap`: system-service artifact and storage ownership;
- `@wanex/runtime/host`: agent and worker-pool host lifecycle;
- `@wanex/runtime/jobs`: scheduler workers and durable job integration;
- `@wanex/runtime/sessions`: sessions, runs, admission, budgets, and control;
- `@wanex/runtime/tools`: tool catalog, policy, validation, and execution;
- `@wanex/runtime/execution`: lazy argv process host, bounded capture, and
  tree-aware cancellation for trusted Node owners;
- `@wanex/runtime/config`: durable config and hot reload;
- `@wanex/runtime/context`: instructions, skills, context compilation;
- `@wanex/runtime/memory`: compaction planning and maintenance;
- `@wanex/runtime/provider`: provider profiles, streaming, replay fidelity;
- `@wanex/runtime/resources`: renderer-free resource and media projection.

These are export entry points, not separate npm package identities.

## Optional Capabilities

- `@wanex/mcp`: official MCP transport adapters for Runtime tools;
- `@wanex/workspace`: changesets, review, isolation, Git, durable tasks, and
  explicitly registered coding tools;
- `@wanex/team`: bounded team conversation and coding delegation policies;
- `@wanex/extension`: dependency-free contribution contracts and resolution;
- `@wanex/plugin`: plugin trust, install, sandbox, process, and worker lifecycle;
- `@wanex/connector`: channel contracts, host lifecycle, packaging, and secrets;
- `@wanex/storage-control-plane`: authenticated remote-store deployment.

Connector host secrets are available from
`@wanex/connector/host-security`. Workspace and Team expose focused subpaths for
advanced consumers. Optional capabilities are selected and owned by trusted
upper applications; no universal composition package exists.

`@wanex/runtime/execution` and `@wanex/workspace/tools` are export subpaths, not
package identities or default-facade dependencies. Runtime owns generic tool
permission and durable audit. Workspace owns path confinement, program aliases,
and changeset-backed mutation. Neither contract exposes arbitrary shell input,
claims OS sandboxing, or registers tools globally.

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

The compiled SDK publication set is the two public facades plus the eight
public capabilities listed above. Workspace source manifests remain private and
point at `src` for development; generated package manifests under `target/sdk`
point only at ESM JavaScript and rolled declarations.

Internal `@wanex/protocol` implementation and types are bundled into each
artifact that needs them and never appear as a packed dependency or module
reference. Dependencies between justified public Wanex identities remain exact
npm dependencies rather than peers or duplicated mega-bundle code. Apps,
examples, Eval, CLI, and Product packages are not SDK artifacts.

Every public export has a committed API Extractor report. Normal SDK release
proof fails on unapproved API drift, source/internal dependency leakage,
resolver errors, non-deterministic tarballs, or an external Node/TypeScript/
bundler consumer failure. Six isolated packed-SDK consumers additionally prove
minimal Runtime, App, provider/tool, Connector, local Storage, and authenticated
remote Storage execution from normal registry dependencies.

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
