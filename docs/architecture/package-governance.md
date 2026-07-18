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
- plugin, connector, team, workspace, TUI, reference, or Product App packages
  entering a default facade.

After an intentional and documented boundary change, regenerate with:

```bash
node ./scripts/audit-facade-footprint.mjs --write-baseline --enforce
```

The current Phase 755 baseline is:

| Facade | Bytes | Static inputs | Workspace packages |
| --- | ---: | ---: | ---: |
| `@wanex/runtime` | 246,385 | 236 | 3 |
| `@wanex/app` | 959,631 | 415 | 4 |

These are reviewed ceilings, not performance targets. Phase 755 changed App's
`jobStatuses` projection from transient worker states to durable scheduler job
states, adding 42 bytes without changing its 415 inputs or four-package
closure. Runtime remained unchanged.

## Audit

Run focused governance checks with:

```bash
pnpm test:package-governance-audit
pnpm test:facade-footprint-audit
pnpm audit:package-governance
pnpm audit:facade-footprint
```
