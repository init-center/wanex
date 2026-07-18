# @wanex/product-app-command-host

## Entry Contract

Optional trusted hot host for Product App plugin command execution. It composes
one shared injected store, a resolved extension snapshot, principal-bound plugin
job submission, a grant-guarded plugin worker, and the safe Product App surface.
It depends directly on the plugin capability boundary and does not select broad
runtime composition or connector runtime.

## Use when

Use this entry when a product intentionally enables plugin-backed commands and
owns plugin installation, grants, worker lifecycle, and trusted host policy.

## Avoid when

Do not use it for the default Product App path, renderer code, connector hosting,
plugin discovery/installation, or as a generic gateway.

## Product Boundary

The returned trusted handle exposes Product App, its safe surface/client, status,
and lifecycle methods. It does not expose storage, plugin runtime, worker,
subprocess host, paths, grants, payloads, or secrets. The caller owns and closes
the injected storage client.

## Lifecycle

Create the host after plugin installs and extension resolution, call `start()`
for background work or `runOnce()` for deterministic/manual work, then call
`stop()` or `dispose()`. Construction never starts a worker.
