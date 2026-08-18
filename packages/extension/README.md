# @wanex/extension

Pure source-neutral app extension contribution contracts.

## Entry Contract

Use this package to describe and resolve app-level contributions before they
reach App Shell or product UI layers.

It owns:

- contribution provenance, source, trust, scope, priority, and diagnostics;
- instruction, skill, command, agent, tool, provider catalog, and lifecycle
  contribution shapes;
- immutable versioned catalog generations and their presentation-neutral
  read/publication contract;
- a bounded JSON Schema Draft 2020-12 profile for optional command inputs,
  including safe parsing, normalization, cloning, and diagnostics;
- deterministic contribution resolution and conflict reporting.

It does not load plugins, scan files, read storage, render UI, or execute tools.
It also does not validate command input instances; App Command Runtime owns common
preflight and each command handler remains the final validation authority.

## Use when

- combining built-in, policy, file, plugin, marketplace, connector, or runtime
  override contributions;
- exposing a resolved contribution catalog to App Shell and Product;
- publishing complete replacement generations without rebuilding consumers;
- validating extension contribution ordering, trust, and conflicts.

## Avoid when

- loading plugin packages or subprocesses;
- discovering `AGENTS.md` or `SKILL.md` files directly;
- executing plugin actions or durable jobs;
- rendering TUI or desktop surfaces.

## Product Boundary

Products own contribution discovery and trusted publication. App Shell and
Product consume an `AppExtensionCatalogSource`; they do not discover packages
or mutate a catalog. This package is the pure contract between those layers.

## Catalog Generations

An `AppExtensionCatalogSource` exposes only:

```text
current() -> { revision, snapshot }
subscribe(listener) -> unsubscribe
```

Use `createAppExtensionCatalog()` when a trusted composition owner needs to
publish complete generations. Publication clones and freezes the complete
snapshot before replacing the current generation. Resolver maps are exposed as
read-only views rather than mutable `Map` objects. A repeated revision is a
no-op; listener failures are reported to the publisher without rolling back the
new generation or preventing later listeners from running.

Use `createStaticAppExtensionCatalogSource()` for products with a fixed
generation. A revision identifies complete catalog content and must be stable
and deterministic; timestamps and process-local counters are not catalog
identity. The trusted publisher computes that identity. Extension does not read
Storage or infer active Plugin state.

Consumers capture one generation per logical operation. In particular, one
agent context admission and one Product command read/preview/execute operation
must not mix snapshots from different revisions.
