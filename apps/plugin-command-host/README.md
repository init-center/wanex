# @wanex/plugin-command-host

## Entry Contract

Optional trusted hot host for application Plugin command execution. It composes
one shared injected store, durable active-install reconstruction, one immutable
Extension catalog source, principal-bound Plugin job submission, one
grant-guarded worker, and an exact-version execution-host registry. It returns
a narrow Product creation binding and an independently owned worker lifecycle;
it does not create a Product Shell, Surface, SurfaceClient, or second
application lifecycle.

## Use when

Use this entry when a product intentionally enables plugin-backed commands and
owns the trusted native source selector, grants, worker lifecycle, install
location, and host policy. When `management` is configured, the Host owns the
complete review/install/state/refresh transaction rather than asking the upper
composition to coordinate those steps.

## Avoid when

Do not use it for the default application path, renderer code, connector
hosting, remote package discovery, or as a generic gateway.

## Product Boundary

The returned trusted handle exposes only `productBinding`, optional bounded
`management`, `refresh()`, bounded status, and lifecycle methods. A trusted
upper composition passes
`productBinding` into its single Product Shell creation. The handle does not
expose storage, Plugin Runtime, the worker, subprocess hosts, install paths,
grants, payloads, or secrets. The caller owns Product and the injected storage
handle.

## Trusted Local Management

`CreatePluginCommandHostOptions.management` is optional and trusted-host-only.
It receives a fixed install base, actor identity, bounded inspection policy,
clock, and native `selectLocalPackage()` callback. A renderer never supplies or
receives a filesystem path.

The management handle lists safe installed-version summaries, creates bounded
TTL one-shot reviews, approves a reviewed local package, cancels a review,
performs exact expected-state changes, retries catalog reconciliation, and
publishes revision-only invalidations. Public review and snapshot values are
deeply frozen and omit source/install paths, entry commands, raw file lists,
layout, trust, actors, jobs, workers, grants, and payloads. Malformed durable
rows become fixed `record_invalid` diagnostics rather than raw parse errors.

Approval always reinspects the source. New packages are materialized to one
content-addressed immutable root and activated atomically. An existing disabled
or removed local artifact can be restored only after a fresh review of the same
artifact; ordinary state mutation cannot restore `removed`. Every successful
durable mutation runs through the Host's existing refresh owner. If durable
state changed but catalog rebuild failed, the result is `attention-required`
and the previous Product catalog remains active. Identical reconciliation emits
no management event. Local unsigned approval is an explicit user decision, not
signature verification or an OS sandbox claim.

## Package Command Projection

`projectPluginPackageCommandContributions()` is the trusted bridge from a
durable Plugin package layout to neutral Extension command contributions. It
always reparses the layout, validates every optional input schema, resolves each
command to an action in the same immutable package, and derives the
exact-version Plugin action handler reference. It also derives Plugin/user
provenance, `user_enabled` trust, and privileged execution status; package data
cannot supply those authority fields.

Projection is all-or-nothing. One malformed command or schema prevents a new
catalog generation from being published. A headless package projects an empty
list.

The Host owns catalog construction. Startup and explicit `refresh()` read the
durable `installed` records, require matching executable manifest/trust/layout
identity, create missing exact `pluginId@version` execution hosts, resolve the
complete command set, and publish one deterministic SHA-256 generation. A
failed refresh keeps the previous generation. Publishing identical content is
a no-op. Concurrent refresh calls share one promise and serialize any request
that arrived while the current pass was running.

The execution registry is append-only for one Host lifecycle. Catalog
replacement removes old versions from new Product resolution while preserving
the immutable host reference needed by already admitted or in-flight work. The
single long-lived worker remains the only `plugin.action` claim owner.

The Host publishes through its Product binding's Extension source. Product
projects a successful changed revision into its existing bounded Surface event
log; Web and TUI then reread `readProductCommands()`. The Host does not publish
renderer deltas or own a second event bus. Failed refresh keeps the previous
generation and emits no Product invalidation, while an identical refresh is a
silent no-op.

## Lifecycle

Create the host after opening Storage, create exactly one Product Shell with
`productBinding`, then call `start()` for background work or `runOnce()` for
deterministic/manual work. Prefer the optional management handle for local
install-state mutations because it couples exact CAS with refresh. `refresh()`
remains the explicit reconciliation operation for trusted non-management
composition flows. `stop()` drains only the owned worker; `dispose()` is terminal and
never disposes Product or Storage. Zero-Plugin startup is valid.

For the standard local lifecycle, pass `createPluginCommandComposition(...)`
as `StartLocalProductHostOptions.pluginComposition`. Its structural contract is
compatible with the named Local Host port without importing or depending on the
upper application package. Local Host prepares it from the one opened Storage
handle before Shell creation, starts it after Shell/Surface creation, and stops
it before Product and Storage disposal. Neither package depends on the other;
the trusted product leaf selects and connects both.
