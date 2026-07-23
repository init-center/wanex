# @wanex/connector

Thin connector/channel contract facade for Wanex.

This package does not implement concrete Telegram, QQ, WeChat, Slack, Discord,
email, webhook, socket, QR-login, or browser automation adapters. It exposes the
durable connector primitives used by such adapters:

- channel identity bindings;
- inbound event ingestion;
- inbound event state updates;
- outbound delivery submission as `channel.delivery` scheduler jobs;
- connector credential references and session leases;
- a generic connector host loop for SDK-agnostic adapter lifecycle.

`ConnectorHost` composes the lower primitives for adapter authors. It starts
a durable connector session, heartbeats ownership, exposes `ingestEvent`, wires
optional delivery handling through `worker-core`, and records terminal
`disconnected` or `failed` session states. Concrete channel SDKs stay outside
this package.

`ConnectorSupervisor` adds an in-process recovery policy for connector
hosts: startup retry, capped exponential backoff, inspectable lifecycle state,
and graceful stop. It is still SDK-agnostic; apps decide whether to run it in a
main process, worker thread, child process, or external service.

`sdk-loader` exposes a thin optional/lazy SDK contract for concrete adapters.
It helps adapters report missing SDKs as degraded states instead of hiding the
failure behind a gateway restart. The loader is intentionally injected and does
not perform package installation.

`runConnectorAdapterContractHarness` is the standard connector adapter lifecycle
contract. Concrete adapter packages can use it to prove they start through
`ConnectorHost`, resolve secrets through `@wanex/runtime/secrets`, ingest
inbound events durably, acknowledge delivery jobs atomically, and stop with the
expected connector session state.

`packaging` owns the connector adapter distribution contract. Adapter packages
declare `ConnectorAdapterPackagingSpec` from this package so hosts can validate
that SDK dependencies are lazy/optional/external or explicitly budgeted bundled
artifacts, that adapters do not require a gateway, and that app/runtime host
packages such as `@wanex/runtime-composition` stay out of adapter package
dependencies.
