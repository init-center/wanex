# Storage Schema Policy

Wanex uses SQLite behind the Rust `system-service` as its default local durable
store. Runtime packages, workers, plugins, Electron hosts, and upper
applications access it through `CoreStore` or an explicit optional store facet;
SQLite is an implementation of the Store/Transport/Locator boundary, not a
kernel concept exposed to applications.

## Current Baseline

The current unpublished schema identifier is version `1` with marker name
`baseline`.

`system-service doctor` reports the numeric identifier for diagnostics. Product
logic must not branch on it. A store is current only when its
`schema_metadata` table contains exactly the single current marker.

## Pre-Release Rule

Wanex has not published a durable-store compatibility contract. Therefore:

- `0001_initial.sql` is the complete current schema for a fresh empty store;
- baseline creation and marker insertion occur in one transaction;
- reopening a current store is idempotent;
- a non-empty store without the current marker fails closed;
- a store with any historical or unexpected marker fails closed;
- there is no incremental upgrade chain, compatibility column patch, legacy
  data conversion, rollback script, or automatic importer.

When the schema changes before the first public durability commitment, update
the complete baseline and its one current identifier. Old development stores
are deliberately invalidated and must be recreated. Do not add `apply_v*`
functions or preserve obsolete rows merely because an internal store exists.

## Post-Release Gate

Incremental migrations become valid only after Wanex explicitly retains a
public or production store contract. That decision requires a separate frozen
phase covering supported source versions, data-preservation guarantees,
failure recovery, upgrade ordering, downgrade policy, and native-platform
evidence. A migration framework must not be introduced speculatively.

## Validation

Every pre-release schema change must prove:

- fresh store creation from the complete baseline;
- exactly one current schema marker;
- idempotent reopen;
- rejection of an unsupported marked store;
- rejection of a non-empty unmarked store;
- doctor reporting the current identifier;
- all Rust, Storage, Runtime, App, SDK consumer, Eval, and native boundaries
  still pass.

Focused Rust validation uses:

```bash
cargo test -p wanex-system-service
```

The repository release gate runs the same behavior through the bounded Phase
757 command groups; no compatibility path is exempt from those gates.
