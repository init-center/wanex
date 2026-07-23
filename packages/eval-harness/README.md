# @wanex/eval-harness

Structured scenario runner for product-level Wanex regressions.

The harness is intentionally small:

- scenarios are named functions;
- results are machine-readable;
- failures keep normalized error details;
- durable state still goes through explicit store facets and system-service.

It complements package unit tests and the reference app; it does not replace
either of them.

The built-in regression suite covers app composition, config hot reload,
explicit single-agent instruction/skill context composition, App Command Runtime
CLI/command-port/JSON/backend-shell/overview/TUI surface, Product App Web,
Product App Local, TUI CLI, and TUI line-session command
discovery/selector/detail/bounded-diagnostics contracts, plugins, connector
product contracts, TUI contribution/controller dispatch, memory compaction,
resources, workspace proposal flows, provider fidelity, team bounds, A2UI
projection, remote storage control-plane isolation, runtime-host execution over
remote HTTP storage, worker failure isolation, delegation through runtime-host,
and delegation graph step advancement, including terminal dependency policy for
failed, cancelled, and retrying graph work. The reference product flow also
includes a durable delegation graph recipe with app-owned scheduler job
execution.

The harness validates product contracts through reviewed public entries and
deterministic fixtures. It does not count as a real consumer and cannot retain
an otherwise unjustified package. Product backend scenarios use
`@wanex/product-app/backend`; ordinary App scenarios use `@wanex/app`; local
Product App Web lifecycle scenarios use `@wanex/product-app-local`.

Generic product-contract scenarios should not import leaf examples. Use public
runtime packages, deterministic adapters, and fixtures instead.

## CLI

Run the built-in regression suite:

```bash
node ./scripts/run-eval-harness.mjs
```

This repository runner selects Cargo's exact host executable name and is the
same eval path used by `pnpm verify`.

By default, the CLI creates an isolated temporary store and workspace for each
executed scenario. This keeps the release gate order-independent and prevents
scenario state from leaking into later scenarios.

Use `--store` or `WANEX_EVAL_STORE_DIR` only when you intentionally want a
shared persistent store for debugging.

Useful filters:

```bash
node ./scripts/run-eval-harness.mjs \
  --only workspace.apply-undo-reapply,provider.deepseek-thinking-fidelity
```

The command emits JSON and exits with code `1` if any selected scenario fails.

## Entry Contract

Use this package for executable product-contract coverage.

| Use when | Avoid when |
| --- | --- |
| A runtime/app integration needs regression coverage across packages. | A runtime package wants to depend on eval behavior. |
| A product recipe should be proven through public runtime contracts. | A scenario can be covered by a focused package unit test only. |
| Release verification needs machine-readable smoke output. | Leaf examples would become implementation dependencies. |
