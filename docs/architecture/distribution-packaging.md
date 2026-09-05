# Distribution And Packaging

## Default Closure

`@wanex/runtime` is the default headless distribution entry and `@wanex/app`
is the trusted backend entry. Optional plugins, connectors, teams, workspace,
TUI, UI, and concrete adapters must not enter either cold closure unless the
selected product imports them explicitly.

The generic `@wanex/cli` and `@wanex/assistant` entries also remain free of the
Workspace capability. Coding products select the dedicated trusted Coding
leaf; they do not make Workspace a transitive cost of ordinary conversation
products. Distribution graph and footprint audits reject Workspace in these
generic entries.

The private `@wanex/coding` leaf has the opposite executable contract: its
workspace closure is exactly Coding, Protocol, Runtime, Storage, and
Workspace. It must include Workspace, but must not absorb App, Assistant,
Assistant Host, Assistant Web, TUI, Desktop, Team, Plugin, Connector, or
another application leaf.
The footprint audit enforces this exact closure rather than treating the Coding
leaf as another generic cold entry.

The Rust system service is a resolved distribution artifact. Consumers must
not bundle arbitrary development `node_modules`, package-local tests, fixtures,
stores, caches, or concrete connector SDKs into the default Runtime payload.

## Artifact Resolution

Generated `@wanex/runtime` declares exact optional dependencies on four
platform-native System Service packages. A normal local Runtime/App install
resolves the exact matching package automatically. npm records all four
optional identities but physically installs only the package matching the host
`os` and `cpu`. Remote-only consumers may omit optional dependencies.

Trusted hosts resolve the System Service through `@wanex/runtime/bootstrap` in
this order:

1. explicit path;
2. `WANEX_SYSTEM_SERVICE_BIN`;
3. explicit manifest plus artifact directory;
4. exact installed native package for the current host.

The first three are trusted development or custom-packaging overrides. Package
resolution is relative to installed `@wanex/runtime`, never the current working
directory. Every manifest path still passes closed-shape, target, realpath
containment, regular-file, byte-size, SHA-256, executable/readability, and
filename validation. There is no cross-architecture fallback or runtime
download.

Local/profile Runtime and App storage owns the spawned process. Remote and
injected storage do not resolve or require a local artifact. Low-level
`@wanex/storage` and advanced Runtime Host construction continue to accept an
explicit binary because they intentionally expose the process boundary.

The first-release native target matrix is intentionally closed:

- `linux-x64` / `x86_64-unknown-linux-gnu` for headless Runtime/SDK;
- `darwin-arm64` / `aarch64-apple-darwin` for headless and Desktop;
- `darwin-x64` / `x86_64-apple-darwin` for headless and Desktop;
- `win32-x64` / `x86_64-pc-windows-msvc` for headless and Desktop.

Linux arm64 and Windows arm64 are not inferred or cross-selected. A declared
target becomes supported only after its own native runner stages and executes
the release binary.

The generated native npm identities are:

- `@wanex/system-service-linux-x64`;
- `@wanex/system-service-darwin-arm64`;
- `@wanex/system-service-darwin-x64`;
- `@wanex/system-service-win32-x64`.

They are generated release artifacts, not source workspace packages. Each
contains only `package.json`, the existing `runtime-artifacts.json`, and one
target executable. It has exact `os`/`cpu`, no JavaScript dependency tree,
scripts, postinstall, downloader, source, tests, stores, caches, or
`node_modules`. Native packages use `npm pack` because it preserves the Unix
executable mode; the JavaScript SDK continues to use the existing pnpm pack
pipeline.

## Release Gates

- distribution graph and footprint audits keep optional packages out of cold
  entries;
- facade footprint baselines constrain bytes, static inputs, and workspace
  closure;
- packlist audits exclude tests, fixtures, caches, stores, and bundles;
- packed external consumers prove export maps and dependency closure;
- Windows/Desktop validation must measure unpacked size and startup with the
  actual packaged system-service artifact.

The distribution footprint audit measures the same effective source packlist
as the package packlist audit. A file excluded by a package `files` field is
not part of footprint bytes or fixture metrics; a fixture under an effective
`src/` entry remains a release failure. The selector lives in
`scripts/audit/package-packlist/effective-packlist.mjs` so package policy and
closure metrics cannot drift apart.

The native staging directory contains exactly `runtime-artifacts.json` plus one
target executable. `pnpm proof:native-runtime` resolves that manifest through
the public Runtime bootstrap, executes a real turn, verifies immutable hashes,
disposes twice, and checks process cleanup. It must never copy workspace
`node_modules` beside the native artifact.

Distributed Rust executables use Cargo's release-profile symbol stripping.
Development builds retain their normal diagnostics; release staging must not
ship a static symbol table inside the runtime executable merely to satisfy a
later packaging step.

Desktop packaging contains one dependency-free application ASAR with
only `main.cjs`, `preload.cjs`, and `package.json`. External `native` and `credentials`
directories contain byte-identical manifested System Service and current-target
keyring artifacts. There is no application `node_modules`, preload, renderer
fixture, or `app.asar.unpacked` tree. The packaged main verifies target,
containment, regular-file identity, size, and SHA-256 before loading either
native boundary.

`docs/architecture/host-distribution-budget.json` owns executable/package
bytes, exact ASAR/native/credential file counts, native cold lifecycle maxima,
and separate Desktop cold/warm ceilings. Desktop interactivity ends
after the real Assistant document is loaded and the visible composer admits a
conversation without waiting for the asynchronous agent turn. Conversation
settlement and complete proof wall time are reported and bounded separately.
Static Runtime/App bundle bytes and input closure remain solely in the facade
footprint audit.

The first-release target ceilings are frozen from reviewed native distribution
runs. Byte limits use the largest observation plus 10 percent, rounded upward
to a stable size boundary. Package file limits use the largest observation
plus 10 percent, rounded upward to ten files. Native proof executes five
process-cold launches, each with a fresh Node process and store, and reports
their median, maximum, and raw timings. The samples share the staged executable
and do not claim a host-cache reset. Native performance gates use both a median
ceiling and a hard maximum: sustained regressions fail the median, while one
pathological launch still cannot exceed the hard physical boundary.

The Desktop proof has a different fixed contract: exactly one cold launch
followed by four warm launches. It reports the cold timing directly and the
warm median, maximum, and raw timings. The cold sample uses hard ceilings.
Warm host startup and interactive total use both median and hard ceilings;
bounded artifact verification, shutdown, settlement, and proof wall continue
to use maxima. Neither short sample set can establish a meaningful p95, and no
sample is trimmed or excluded from correctness.

The release-blocking Desktop proof owns functional distribution behavior, not
the temporary Assistant UI composition. It requires the packaged Renderer to
complete Provider onboarding/edit/removal/fallback, canonical conversations,
the supported Assistant workflow journeys, privacy checks, shutdown, and process
cleanup. Normal and narrow screenshots must be captured and nonblank, but their
layout, focus, drawer state, and exact requested content dimensions are
diagnostic until the replacement UI freezes a new visual/accessibility
acceptance contract. The receipt validates actual positive content/pixel
dimensions and scale because a host window manager may cap a requested size.

Desktop proof wall timing stops when the packaged process exits. Receipt
parsing and the mandatory process-table audit occur afterward and remain fatal
correctness checks, but their cost is excluded from both interactivity and
proof wall performance. Assistant streaming remains event-driven; the proof's
in-page observer checks the rendered DOM at a bounded 50ms interval until the
new user and assistant rows are both visible.
Each target owns its own cold and warm values; do not average heterogeneous
runner classes or refresh a failed ceiling without reviewing the artifact
closure, raw samples, and receipt history.

| Target | Native executable | Native total median/hard; wall median/hard | Desktop unpacked/files | Desktop cold interactive/settlement/proof wall | Desktop warm interactive median/hard; settlement/proof wall max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `linux-x64` | 10,800,000 B | 1,250/4,000; 2,000/5,000 ms | n/a | n/a | n/a |
| `darwin-arm64` | 10,800,000 B | 1,500/4,000; 2,000/5,000 ms | 565,000,000 B / 310 | 3,000 / 15,500 / 20,000 ms | 1,500/5,000; 15,500/20,000 ms |
| `darwin-x64` | 9,900,000 B | 2,000/6,000; 3,000/8,000 ms | 575,000,000 B / 310 | 8,000 / 15,500 / 25,000 ms | 3,500/8,000; 15,500/22,000 ms |
| `win32-x64` | 9,600,000 B | 6,000/12,000; 10,000/15,000 ms | 415,000,000 B / 90 | 3,000 / 15,500 / 20,000 ms | 2,500/5,000; 15,500/20,000 ms |

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
pnpm stage:native -- --target darwin-arm64
pnpm proof:native-runtime
pnpm proof:desktop
pnpm audit:host-distribution -- --target darwin-arm64
pnpm release:sdk
pnpm release:native -- --target darwin-arm64
pnpm proof:sdk-consumers -- --native-target darwin-arm64 \
  --native-package-report target/sdk/native/darwin-arm64/report.json
```

Run native and Desktop measurements before the external npm consumer proof.
The latter deliberately starts the packaged service several times and must not
contaminate cold/warm distribution evidence.

Do not preserve a package merely because an example or Eval Harness imports
it. Real production consumers, security boundaries, distinct dependency
closures, or process/lifecycle ownership must justify distribution identities.
