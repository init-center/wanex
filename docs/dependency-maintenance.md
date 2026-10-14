# Dependency Maintenance

## Version Ranges and Reproducible Installs

Use compatible caret ranges for ordinary JavaScript libraries and development
utilities. For a pre-1.0 package, caret normally stays within its current minor;
review a new minor explicitly. Keep React/react-dom and related peer dependencies
aligned when updating them across workspace consumers.

Published SDK manifests retain these third-party ranges. Wanex release members
and their optional native artifacts still use exact coordinated release versions;
external fixture roots select the exact locally published Wanex version.

Commit `pnpm-lock.yaml` and `Cargo.lock`. CI and release installs use
`pnpm install --frozen-lockfile`. An install reuses satisfying locked versions;
changing an exact specifier to a range does not automatically update the package.
Do not delete the lockfile to obtain upgrades or use `latest` as a manifest range.
Cargo's ordinary `version = "x.y.z"` already means a compatible range; it is not
equivalent to an exact npm version.

The retained exact constraints have specific owners and checks:

| Constraint | Reason | Upgrade validation |
| --- | --- | --- |
| TypeScript, esbuild | Compiler diagnostics and generated SDK/browser artifacts | Regenerate affected artifacts, inspect diffs, API reports, typechecks and SDK determinism |
| Electron | Downloaded artifact identity and native Desktop runtime | Electron preparation and installed Desktop acceptance |
| `@napi-rs/keyring` | Staging checks match platform bindings to the JS wrapper version | Credential staging and installed target-platform checks |
| `packageManager` pnpm version | One lockfile/install implementation across development and CI | Toolchain doctor, frozen install and workflow setup versions |
| GitHub Actions commit SHAs | Reviewed action implementation identity | Review upstream release, update SHA/comment and workflow validation |
| External consumer fixture versions | Assert which local release artifact was installed | Packed SDK consumer checks; these are not third-party update policy |

Exact constraints do not exempt these tools from update review. Node keeps the
existing supported floor rather than adding a local patch-version pin.

## Review and Update Procedure

At the start of dependency work, and in the weekly maintenance review, inspect
both root and package dependencies with existing pnpm commands:

```sh
pnpm outdated
pnpm -r outdated
```

An outdated result is review input, not a failing functional test. Group related
patch/minor updates. Review major versions and native/compiler upgrades
separately. Security fixes take priority over the routine cadence. These commands
do not schedule work; no extra bot, runner or paid CI schedule is installed.

For example, explicitly upgrade a root tool after reviewing its release:

```sh
pnpm -w up @microsoft/api-extractor@^7.59.4
```

Review both the manifest and lockfile diff. Use `pnpm why` to investigate affected
transitive dependencies. Do not run a blanket `--latest` update across unrelated
major versions. Use pnpm's default minimum release age (one day in pnpm 11),
without a workspace override or release-age exclusions. Age is a delay,
not evidence that a release has no defects; compatible releases can still contain
regressions. It does not schedule or perform updates. Preserve the build-script
policy. An urgent verified security fix may justify a narrow version-specific
age exception after review; remove it when the release reaches the required age.

For each changed graph:

1. Reassess every override affected by the update. Prefer the upstream declared
   range and current safe lock resolution over a permanent transitive pin.
2. Run frozen install and `pnpm security:js`; keep both production and complete
   audits. Run `pnpm security:rust` for the consolidated release check.
3. Run affected functional checks and inspect generated output/API differences.
   Do not refresh API baselines merely to silence an unexpected diff.
4. Run the full `pnpm verify` at the snapshot boundary. Native, browser or
   packaging changes also require the corresponding installed acceptance.
5. Record resolved versions, override removals/retentions, validation and platform
   limits in the implementation log. Consolidate authorized remote acceptance
   after local checks; an update review does not authorize Actions by itself.

## API Extractor Exception

Wanex uses API Extractor's programmatic library for SDK reports. Version 7.59.4
still declares a CLI dependency that reaches vulnerable `sprintf-js` through
`argparse` 1.x. The only retained override removes that unused CLI dependency
from this specific Extractor version. Its bundled `api-extractor init/run` CLI
is not supported; Wanex CLI/TUI are unaffected.

The library closure, unchanged public API reports, signature-drift rejection and
compiler diagnostics remain checked by existing SDK tests. The version-specific
override deliberately does not apply to future Extractor releases. On upgrade,
inspect the new graph before deciding whether pruning remains valid; do not
broaden the selector automatically. Remove the override when an upstream release
eliminates the vulnerable chain or provides a supported separate library package.
Do not substitute argparse 2 across an incompatible interface, add an advisory
ignore, or rewrite the report analyzer merely to remove one configuration entry.

References: [pnpm update](https://pnpm.io/cli/update),
[pnpm overrides](https://pnpm.io/settings/dependency-resolution#overrides),
[sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
