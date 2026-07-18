# @wanex/extension

Pure source-neutral app extension contribution contracts.

## Entry Contract

Use this package to describe and resolve app-level contributions before they
reach App Shell or product UI layers.

It owns:

- contribution provenance, source, trust, scope, priority, and diagnostics;
- instruction, skill, command, agent, tool, provider catalog, and lifecycle
  contribution shapes;
- a bounded JSON Schema Draft 2020-12 profile for optional command inputs,
  including safe parsing, normalization, cloning, and diagnostics;
- deterministic contribution resolution and conflict reporting.

It does not load plugins, scan files, read storage, render UI, or execute tools.
It also does not validate command input instances; App Command Runtime owns common
preflight and each command handler remains the final validation authority.

## Use when

- combining built-in, policy, file, plugin, marketplace, connector, or runtime
  override contributions;
- exposing a resolved contribution snapshot to App Shell;
- validating extension contribution ordering, trust, and conflicts.

## Avoid when

- loading plugin packages or subprocesses;
- discovering `AGENTS.md` or `SKILL.md` files directly;
- executing plugin actions or durable jobs;
- rendering TUI or desktop surfaces.

## Product Boundary

Products own contribution sources. App Shell consumes resolved snapshots. This
package is the pure contract between those two layers.
