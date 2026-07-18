# Storage Migration Policy

Wanex currently uses SQLite, owned by the Rust `system-service`, as the default
local runtime source of truth. Runtime packages, workers, plugins, Electron
apps, and upper applications must access durable runtime state through
`CoreStore` or an explicit optional store facet instead of writing state files directly.

This document defines how SQLite schema changes are allowed to evolve for the
local system-service backend.

## Current Version

The current schema version is `6`.

`system-service doctor` reports the current schema version from the
`schema_migration` table. Upper applications may use this value for diagnostics,
support bundles, and upgrade checks, but should not branch normal product logic
on it unless a compatibility window explicitly requires that.

## Migration Shape

Wanex keeps two migration concepts separate:

- the baseline migration, `0001_initial.sql`, creates a new store;
- incremental migrations advance existing stores from one schema version to the
  next.

New stores apply the baseline and then record every current incremental
migration row. Existing stores must not replay the baseline if they already
record version `1`; they advance through incremental migrations only.

This split is intentional. The baseline may be kept current for fresh installs,
while old stores preserve their existing data and move forward through explicit,
auditable upgrade steps.

## Rules

- Every durable schema change must have an explicit schema version.
- Every successful schema change must record a row in `schema_migration`.
- Incremental migrations must be idempotent, because a process can crash after
  partial DDL on some platforms.
- Compatibility helpers such as `ADD COLUMN IF MISSING` are allowed only inside
  a named versioned migration.
- Unversioned, open-ended compatibility patches are not allowed.
- Downgrade is not supported unless a phase explicitly designs and tests it.
- Runtime state migrations belong in `system-service`; TypeScript clients only
  observe the resulting contract.

## Validation Expectations

A storage migration phase must include tests for:

- fresh store creation;
- upgrading at least one simulated older store;
- data preservation across upgrade;
- idempotent reopen after migration;
- doctor reporting the current schema version.

The release gate remains:

```bash
pnpm verify
```

For focused debugging, run the Rust package tests first:

```bash
cargo test -p wanex-system-service
```

## Non-Goals

This policy does not introduce a third-party migration framework, SQL rollback
generation, hosted upgrade orchestration, or app-level feature flags. Those can
be added later if product distribution needs them, but the kernel baseline is a
small, explicit, versioned migration chain.
