# Package Governance

Wanex treats npm package identity as a publishing, dependency, security, or
lifecycle boundary. Internal source modules may remain fine-grained without
becoming workspace packages.

## Disposition Contract

`package-disposition.json` classifies every active workspace package as one of:

- `retain`: keep the package identity;
- `merge`: move behavior into the named owner and delete the old identity;
- `rename`: directly replace the old identity with the named owner;
- `delete`: preserve required behavior elsewhere, then remove the package;
- `value-gated`: retain or split only when a measured dependency, trust, or
  external-consumer boundary proves the value.

Every entry records its path, current role, target owner, target phase,
rationale, and evidence. Deleted package names remain in `tombstones`; a
tombstoned name cannot silently return as a workspace manifest.

## Consumer Baseline

`package-consumers.json` records every reverse workspace dependency and its
manifest field. `example` and `test` consumers are recorded but excluded from
`realConsumers`; they can test behavior but cannot justify a production package
boundary.

The baseline is exact. Adding, removing, or moving a workspace dependency
requires an explicit reviewed regeneration:

```bash
node ./scripts/audit-package-governance.mjs --write-baseline
```

Do not regenerate the baseline merely to make the audit pass. Review the
dependency direction and the package disposition first.

## Facade Footprint

`facade-footprint-baseline.json` records deterministic esbuild static bundles
for `@wanex/runtime` and `@wanex/app`. The gate allows closures to shrink but
rejects:

- output byte or static input count growth;
- a new workspace package entering either facade without review;
- plugin, connector, team, workspace, TUI, reference, or application packages
  entering a default facade.

After an intentional and documented boundary change, regenerate with:

```bash
node ./scripts/audit-facade-footprint.mjs --write-baseline --enforce
```

The current Phase 861 completion baseline is:

| Facade           |     Bytes | Static inputs | Workspace packages |
| ---------------- | --------: | ------------: | -----------------: |
| `@wanex/runtime` |   482,439 |           261 |                  3 |
| `@wanex/app`     | 1,379,902 |           459 |                  4 |

These are reviewed ceilings, not performance targets. Phase 807 directly
replaces placeholder compaction with model-derived semantic planning, bounded
source serialization, durable Provider generation evidence, and active-epoch
replay. Relative to the pre-Phase-807 ceiling, Runtime adds 15,142 bytes and App
adds 14,879 bytes while the static input counts decrease by one. Runtime remains
at three workspace packages and App remains at four. Product, Team, Plugin,
Connector, Workspace, TUI, and presentation packages remain outside both
default root facades.

Phase 808 adds 1,143 bytes to the shared Runtime closure for independent model
context/input/output/resource limits and truthful Tool capability enforcement.
App grows by the same 1,143 bytes because it transitively contains Runtime.
Static input counts and workspace package sets do not change.

Phases 809-810 add the inline capacity guard and Product recovery projection
without changing either workspace package set. Phase 811 adds only the private
Product Desktop leaf above Product Local. It changes neither facade closure;
the reviewed exact ceilings above match the complete Phase 811 repository gate.

Phase 860 adds the App-owned Provider mutation transaction as one explicit SDK
subpath and lets the App root invoke it only through a dynamic package-self
import when trusted onboarding is configured. The single-file footprint audit
counts that optional module, increasing the App envelope by 24,761 bytes and
one input relative to the previous 1,354,401-byte/458-input ceiling. Generated
SDK output preserves the dynamic import and the installed TUI emits a separate
chunk. Runtime is unchanged, no workspace package enters either facade, and
the local keychain adapter remains outside the App closure.

Phase 861 adds trusted-host coordinator binding and exact release during App
disposal or failed startup. This increases the App envelope by 740 bytes over
the Phase 860 ceiling while preserving 459 inputs and the same four workspace
packages. Product TUI directly declares App because its trusted executable
host consumes the explicit Provider mutation subpath; the full-screen renderer
still imports only Product Surface contracts, and neither keychain nor TUI
code enters the App facade.

TEAM-12C adds one reviewed leaf-recipe edge from `@wanex/tui` to the
presentation-neutral `@wanex/local-host/application` entry. This removes a
second TUI-specific Product/Team composition without starting Web or HTTP
infrastructure and without changing either default facade closure. The reviewed
workspace dependency graph now has 74 edges.

## Audit

Run focused governance checks with:

```bash
pnpm test:package-governance-audit
pnpm test:facade-footprint-audit
pnpm audit:package-governance
pnpm audit:facade-footprint
```
