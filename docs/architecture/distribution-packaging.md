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

The first-release native target matrix is intentionally closed:

- `linux-x64` / `x86_64-unknown-linux-gnu` for headless Runtime/SDK;
- `darwin-arm64` / `aarch64-apple-darwin` for headless and Electron;
- `darwin-x64` / `x86_64-apple-darwin` for headless and Electron;
- `win32-x64` / `x86_64-pc-windows-msvc` for headless and Electron.

Linux arm64 and Windows arm64 are not inferred or cross-selected. A declared
target becomes supported only after its own native runner stages and executes
the release binary.

## Release Gates

- distribution graph and footprint audits keep optional packages out of cold
  entries;
- facade footprint baselines constrain bytes, static inputs, and workspace
  closure;
- packlist audits exclude tests, fixtures, caches, stores, and bundles;
- packed external consumers prove export maps and dependency closure;
- Windows/Electron validation must measure unpacked size and startup with the
  actual packaged system-service artifact.

The native staging directory contains exactly `runtime-artifacts.json` plus one
target executable. `pnpm proof:native-runtime` resolves that manifest through
the public Runtime bootstrap, executes a real turn, verifies immutable hashes,
disposes twice, and checks process cleanup. It must never copy workspace
`node_modules` beside the native artifact.

Desktop packaging contains one dependency-free application ASAR and an
external `native` directory with the same manifest/executable bytes. There is
no application `node_modules` directory and no `app.asar.unpacked` tree.

`docs/architecture/host-distribution-budget.json` owns executable/package
bytes, exact ASAR/native file counts, native cold lifecycle maxima, and
separate Electron cold/warm ceilings. Static Runtime/App bundle bytes and input
closure remain solely in the facade footprint audit.

The first-release target ceilings are frozen from reviewed native distribution
runs. Byte limits use the largest observation plus 10 percent, rounded upward
to a stable size boundary. Package file limits use the largest observation
plus 10 percent, rounded upward to ten files. Native proof executes five
process-cold launches, each with a fresh Node process and store, and reports
their median, maximum, and raw timings. The samples share the staged executable
and do not claim a host-cache reset. The Electron proof has a different fixed
contract: exactly one cold launch followed by four warm launches. It reports
the cold timing directly and the warm median, maximum, and raw timings. Neither
short sample set can establish a meaningful p95, so the release gate truthfully
enforces explicit maxima.

Electron wall timing stops when the packaged process exits. Receipt parsing
and the mandatory process-table audit occur afterward and remain fatal
correctness checks, but their cost is excluded from startup performance. Each
target owns its own cold and warm values; do not average heterogeneous runner
classes or refresh a failed ceiling without reviewing the artifact closure,
raw samples, and receipt history.

| Target | Native executable | Native total/wall max | Electron unpacked/files | Electron cold total/wall | Electron warm total/wall max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `linux-x64` | 10,800,000 B | 1,000 / 2,000 ms | n/a | n/a | n/a |
| `darwin-arm64` | 9,600,000 B | 1,500 / 2,000 ms | 565,000,000 B / 310 | 3,000 / 5,000 ms | 1,500 / 2,500 ms |
| `darwin-x64` | 9,900,000 B | 2,000 / 3,000 ms | 575,000,000 B / 310 | 8,000 / 12,000 ms | 3,500 / 6,000 ms |
| `win32-x64` | 9,600,000 B | 6,000 / 10,000 ms | 415,000,000 B / 90 | 3,000 / 5,000 ms | 2,500 / 3,000 ms |

Manifest hashes prove the staged resources remain immutable during a proof and
match the packaged native files. They do not claim cross-build reproducibility:
MSVC PE timestamps/debug identity, and later signing or notarization, may
change artifact hashes between otherwise equivalent builds.

Run:

```bash
pnpm audit:distribution-graph -- --enforce
pnpm audit:distribution-footprint -- --enforce
pnpm audit:facade-footprint
pnpm audit:package-packlist
pnpm release:sdk
pnpm proof:sdk-consumers
pnpm stage:native -- --target darwin-arm64
pnpm proof:native-runtime
pnpm proof:electron-boundary
pnpm audit:host-distribution -- --target darwin-arm64
```

Do not preserve a package merely because an example or Eval Harness imports
it. Real production consumers, security boundaries, distinct dependency
closures, or process/lifecycle ownership must justify distribution identities.
