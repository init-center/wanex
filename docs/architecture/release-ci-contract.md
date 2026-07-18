# Release / CI Contract

This document defines the minimum verification gate for Wanex kernel changes
and for upper applications upgrading Wanex.

## Required Gate

Wanex requires a current Node.js baseline: `>=26` in `package.json`. The
repository intentionally does not pin a Node patch version with `.node-version`;
local development and CI should use a recent Node release on or above that
floor.

Wanex uses a two-layer pnpm policy:

- `packageManager` pins the exact pnpm version Corepack should resolve for this
  workspace.
- `engines.pnpm` records the supported native pnpm major range, currently
  `>=11 <12`.

Corepack is not a runtime dependency, but when it is available it must resolve
the project-pinned pnpm version inside the supported range. Dependency build
scripts are denied by default unless explicitly approved in
`pnpm-workspace.yaml`.

Run:

```bash
pnpm verify
```

The command is intentionally cross-platform. It is implemented with Node
process spawning instead of shell command chaining, so it can run on Windows,
macOS, Linux, local machines, and CI workers.

`pnpm verify` is deliberately broad and can be CPU-intensive. Wanex does not
provide a separate local "cool" full-tree gate: lowering concurrency still runs
the same large amount of work and can remain thermally expensive on laptops.
For normal local development, use focused checks first and run the full gate
only at deliberate release, handoff, or CI boundaries.

Workspace package tests are orchestrated by `scripts/test.mjs`: the
system-service binary is built once, then recursive package tests run with
`WANEX_SKIP_SYSTEM_SERVICE_BUILD=1`. Packages that need the binary still use a
package-local runner so direct focused tests remain self-contained.

`pnpm verify` runs these workspace steps, in order:

```bash
pnpm doctor:toolchain
pnpm test:toolchain-doctor
pnpm test:product-app-web-demo
pnpm test:product-app-local-smoke-script
pnpm test:product-app-tui-demo-script
pnpm test:verify-script
pnpm test:runner
pnpm test:public-contract-audit
pnpm test:workspace-hygiene-audit
pnpm test:package-packlist-audit
pnpm test:package-governance-audit
pnpm test:facade-footprint-audit
pnpm test:sdk-distribution
pnpm audit:workspace-hygiene
pnpm check
pnpm test
pnpm audit:public-contracts
pnpm audit:package-governance
pnpm audit:structure
pnpm audit:distribution
node ./scripts/audit-distribution-graph.mjs --enforce
node ./scripts/audit-distribution-footprint.mjs --enforce
pnpm audit:facade-footprint
pnpm audit:package-packlist
pnpm release:sdk
pnpm proof:sdk-consumers
pnpm audit:sdk-determinism
cargo fmt -- --check
cargo test
cargo clippy --all-targets -- -D warnings
pnpm --filter @wanex/eval-harness eval -- --service-bin ../../target/debug/wanex-system-service --plugin-host-fixture ../plugin/test/fixtures/plugin-host-fixture.mjs
```

The final eval-harness step runs the built-in product regression suite through
the CLI. It proves that app-facing runtime composition, plugin execution,
resource handling, workspace apply/review behavior, provider fidelity, team
round bounds, A2UI projection, remote storage control-plane isolation,
runtime-host execution over remote HTTP storage, worker failure isolation,
delegation through runtime-host, and delegation graph step advancement continue
to work through an executable product path, not only through package-local
tests. It also covers the direct Product App Local lifecycle and desktop-host
subpath so the first local upper Web product entry remains executable through
its public package contract.
Delegation graph eval coverage includes terminal dependency policy:
failed and cancelled work is synced into graph state, `after_success`
dependents remain blocked, `after_terminal` dependents can release, and
`retry_scheduled` work remains non-terminal. It also runs distribution smoke
scenarios that execute the footprint and
packlist audits from the product regression suite, proving cold entries stay
light and optional plugin/connector runtimes only appear in explicit hot paths.

The workspace hygiene audit prevents generated local artifacts such as `dist/`,
`build/`, `coverage/`, `.turbo/`, `.next/`, `.cache/`, `.DS_Store`,
TypeScript build-info files, logs, and temp files from remaining in the
workspace tree. It also enforces the TypeScript no-emit default: the root
`tsconfig.base.json` must set `compilerOptions.noEmit: true`, and workspace
`tsconfig*.json` files must not reintroduce package-local emit options such as
`outDir`, declarations, source maps, or build-info output. It runs before long
package checks so generated local output cannot silently pollute
source-structure, packlist, or distribution reasoning.
The public-contract audit prevents accidental package export drift. The
structure audit prevents runtime packages from sliding back into oversized
entrypoints or implementation-heavy index files. The distribution audits keep
cold product entry packages from directly or transitively depending on plugin
runtimes, connector runtimes, concrete connector adapters, or spike adapters.
The distribution footprint audit keeps cold entries and cold helpers free of
forbidden plugin/connector closure and fixture closure while continuing to
report byte footprint as an observational metric.
The package-governance audit requires one reviewed disposition for every active
manifest, prevents deleted package tombstones from returning, records every
reverse workspace dependency, and excludes examples/tests from real-consumer
evidence. The facade static-footprint audit uses a pinned esbuild version and
enforces no-growth byte/input/package ceilings for the default Runtime and App
roots; optional capabilities and product packages are forbidden from both
closures.
Future marketplace and renderer integrations must follow the same release-gate
principle: default App and cold/headless product paths stay free of optional
plugin loading, npm plugin dependencies, connector adapters, and renderer
closure. `@wanex/extension` remains dependency-free. Plugin execution is owned
by `@wanex/plugin` and projected into product commands only by
`@wanex/product-app-command-host`.
The package packlist audit prevents package defaults from including tests,
fixtures, runtime stores, runtime logs, JSONL debug streams, or generated
support bundles. It also enforces the current source-first manifest policy:
`@wanex/*` package `exports` and `bin` targets must point at existing
`./src/*.ts` files, and packages must not define `main`, `types`, or `typings`
until the separate compiled artifact pipeline runs. Source manifests remain
source-first; they are not packed as the SDK.

The compiled SDK release proof builds 10 public identities and 47 entries under
`target/sdk`, rolls declarations, packs npm tarballs, compares committed API
Extractor reports, runs `publint` and Are The Types Wrong, installs every
tarball in a temporary project outside the workspace, imports and typechecks
every entry, and bundles Runtime/App roots while checking optional closure. The
external runtime proof then installs six independent projects from a temporary
loopback npm registry with exact normal dependencies: minimal Runtime, trusted
App, provider/tool, Connector, local Storage, and authenticated remote Storage
plus Runtime. It audits each package lock against the exact compiled Wanex
closure and rejects workspace, file, link, source-path, or version drift. The
determinism audit performs two clean builds and requires byte-identical tarball
hashes. These gates are part of the release contract, not optional examples.

The eval CLI uses an isolated temporary store per executed scenario by default.
Persistent shared eval stores are only for explicit debugging via `--store` or
`WANEX_EVAL_STORE_DIR`.

For schema changes, the gate also depends on the storage schema policy: fresh
stores must report the one current baseline marker through doctor, current
stores must reopen idempotently, and unsupported pre-release stores must be
rejected rather than upgraded.

## Local Debugging

Use the individual commands when narrowing a failure:

```bash
pnpm doctor:toolchain
pnpm test:toolchain-doctor
pnpm test:product-app-web-demo
pnpm test:product-app-local-smoke-script
pnpm test:verify-script
pnpm test:runner
pnpm test:public-contract-audit
pnpm test:workspace-hygiene-audit
pnpm test:package-packlist-audit
pnpm test:package-governance-audit
pnpm test:facade-footprint-audit
pnpm test:sdk-distribution
pnpm audit:workspace-hygiene
pnpm check
pnpm test
pnpm audit:public-contracts
pnpm audit:package-governance
pnpm audit:structure
pnpm audit:distribution
node ./scripts/audit-distribution-graph.mjs --enforce
node ./scripts/audit-distribution-footprint.mjs --enforce
pnpm audit:facade-footprint
pnpm audit:package-packlist
pnpm release:sdk
pnpm proof:sdk-consumers
pnpm audit:sdk-determinism
cargo fmt -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

For focused iteration, prefer package-local checks plus the structure audit
before running a full gate:

```bash
pnpm --filter @wanex/product-app-local check
pnpm --filter @wanex/product-app-local test -- web-host
pnpm audit:structure
```

For a bounded local product-path check that avoids the full workspace gate:

```bash
pnpm --silent smoke:product-app-local
```

This command starts Product App Local through a temporary profile root outside
the workspace, verifies the local Web document, layout action, workbench start
action, and product privacy boundary, prints one JSON result to stdout, closes
the host, and exits. Use the `--silent` pnpm form when stdout must be directly
parseable as JSON. It is useful during local product iteration, but it does not
replace `pnpm verify` at release, handoff, or CI boundaries.

For a focused Product App feedback check across Web and TUI:

```bash
pnpm smoke:product-app-feedback
```

This command reuses the `product.app-feedback-matrix-contract` eval scenario. It
checks that provider-not-ready execution is reported as blocked in both Web and
TUI, then trusted provider setup makes the same paths succeed without leaking
secrets, store paths, service binary paths, or setup APIs to renderer-facing
outputs. It is a targeted local confidence check and does not replace the full
eval suite in `pnpm verify`.

For a temporary-store TUI demo from the workspace root:

```bash
pnpm demo:product-app-tui
pnpm demo:product-app-tui:json
pnpm demo:product-app-tui:interactive
```

The runner injects `WANEX_STORE_DIR` and `WANEX_SYSTEM_SERVICE_BIN` for the TUI
package CLI and cleans up the temporary store after exit unless a caller
explicitly provides `WANEX_STORE_DIR`.

If the machine does not have a compatible global pnpm and Corepack is not
available, bootstrap the release gate with the supported pnpm major:

```bash
npm exec --yes --package=pnpm@latest-11 -- pnpm verify
```

Run a targeted eval scenario:

```bash
pnpm --filter @wanex/eval-harness eval -- \
  --service-bin ../../target/debug/wanex-system-service \
  --plugin-host-fixture ../plugin/test/fixtures/plugin-host-fixture.mjs \
  --only workspace.apply-undo-reapply
```

Run the same full eval suite used by `pnpm verify`:

```bash
pnpm --filter @wanex/eval-harness eval -- \
  --service-bin ../../target/debug/wanex-system-service \
  --plugin-host-fixture ../plugin/test/fixtures/plugin-host-fixture.mjs
```

## Release Rule

A Wanex change is not release-ready until `pnpm verify` passes.

Upper applications should run `pnpm verify` in the Wanex workspace before
adopting a new local revision. If an upper application keeps its own integration
suite, it should run that suite after `pnpm verify`, not instead of it.

## Boundary

This contract does not define publishing, semantic versioning, artifact upload,
or a hosted CI vendor. It defines the local and CI command that must pass before
those workflows are allowed to proceed.

The release gate is not a gateway or daemon. It starts processes, waits for
them, and exits.

## Build Command

Wanex workspace development is source-first: package exports point at `src/`,
`tsconfig.base.json` is no-emit by default, and package-local `dist/` trees are
forbidden. Compiled distribution uses an isolated generated staging tree under
`target/sdk`.

Run:

```bash
pnpm build
```

The command intentionally performs:

```bash
pnpm check
node ./scripts/build-sdk.mjs
cargo build -p wanex-system-service
```

It does not recursively run package-local emitting `tsc` builds and does not
write package-local `dist/` directories. Use `pnpm release:sdk` for generated
manifests, deterministic tarballs, API/package validation, and the external
consumer smoke. Registry publication, signing, provenance upload, CLI/Product
packaging, and platform system-service embedding remain separate release work.
