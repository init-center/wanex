# Distribution And Packaging

## Default Closure

`@wanex/runtime` is the default headless distribution entry and `@wanex/app`
is the trusted backend entry. Optional plugins, connectors, teams, workspace,
TUI, UI, and concrete adapters must not enter either cold closure unless the
selected product imports them explicitly.

The Rust system service is a resolved distribution artifact. Consumers must
not bundle arbitrary development `node_modules`, package-local tests, fixtures,
stores, caches, or concrete connector SDKs into the default Runtime payload.

## Artifact Resolution

Trusted hosts resolve the system-service binary through
`@wanex/runtime/bootstrap` using an explicit path, environment, manifest, or
packaged artifact directory. Local/profile storage owns the spawned process;
remote and injected storage do not require a local artifact.

## Release Gates

- distribution graph and footprint audits keep optional packages out of cold
  entries;
- facade footprint baselines constrain bytes, static inputs, and workspace
  closure;
- packlist audits exclude tests, fixtures, caches, stores, and bundles;
- packed external consumers prove export maps and dependency closure;
- Windows/Electron validation must measure unpacked size and startup with the
  actual packaged system-service artifact.

Run:

```bash
pnpm audit:distribution-graph -- --enforce
pnpm audit:distribution-footprint -- --enforce
pnpm audit:facade-footprint
pnpm audit:package-packlist
pnpm release:sdk
pnpm proof:sdk-consumers
```

Do not preserve a package merely because an example or Eval Harness imports
it. Real production consumers, security boundaries, distinct dependency
closures, or process/lifecycle ownership must justify distribution identities.
