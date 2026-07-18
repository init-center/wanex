# Runtime Composition

Wanex intentionally has no universal runtime-composition package.

The default headless lifecycle belongs to `@wanex/runtime`; trusted product
commands and read models belong to `@wanex/app`. Advanced products import only
the Runtime subpaths and optional capability owners they actually select.

This avoids a gateway-shaped singleton, optional dependency fan-in, eager
plugin/connector loading, synthetic umbrella APIs, and oversized packaged
closures. Product composition is explicit code in the trusted product host,
with constructed resources owned and injected resources borrowed.

See [Public Contracts](public-contracts.md) and
[App Integration Guide](app-integration-guide.md).
