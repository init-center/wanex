# Package Structure Rules

Wanex separates npm release identities from export entry points and internal
modules. A module split improves local ownership; it does not automatically
justify another package.

## Package Gate

A new package is allowed only when at least one condition is proven:

- independent publishing or versioning;
- a distinct security or trust boundary;
- a materially different dependency or platform closure;
- independent process/resource lifecycle;
- two independent real production consumers.

Eval, tests, examples, references, skeletons, and recipes are not real-consumer
evidence. Without this proof, add an internal module or export subpath to the
existing owner.

## Active Layers

| Layer | Package identities |
| --- | --- |
| Contract and persistence | `@wanex/protocol`, `@wanex/storage`, `@wanex/storage-control-plane` |
| Runtime facade | `@wanex/runtime` |
| Optional kernel capabilities | `@wanex/mcp`, `@wanex/workspace`, `@wanex/team`, `@wanex/extension`, `@wanex/plugin`, `@wanex/connector` |
| Trusted app facade | `@wanex/app` |
| Products | `@wanex/cli`, `@wanex/product-app`, `@wanex/product-app-command-host`, `@wanex/product-app-local`, `@wanex/product-app-web`, `@wanex/product-app-tui` |
| Non-production proof | `@wanex/eval-harness` plus non-workspace external consumer fixtures |

Production packages must not depend on examples, Eval, or upper products.
Runtime and App defaults must remain free of Workspace, Team, Plugin, Connector,
TUI, and concrete adapter closure.

## Source And Artifact Shape

The workspace source shape and npm artifact shape are intentionally separate.
Source manifests are private and export TypeScript under `src` so local checks,
tests, and `tsx` do not require a build. The SDK builder reads those public
exports and writes generated package manifests, ESM, rolled declarations, and
tarballs under `target/sdk`.

Generated first-RC SDK artifacts exist for the explicitly selected publication
set, not automatically for every public-facade or public-capability source
role. Every such role must be classified as either published or
source-preview. Internal Protocol is bundled; apps, tests, examples, preview
capabilities, and source-only test exports are excluded. Public Wanex
dependencies remain package dependencies when their publication, security,
dependency, or lifecycle boundary is real. A compiled artifact must not
contain source TypeScript, workspace paths/ranges, tests, fixtures, maps, or
internal Protocol module references.

## Internal Shape

`src/index.ts` is a small public facade or barrel. Focused implementation stays
in owner modules. Review an entry point above 250 lines and split an
implementation file above 600 lines when responsibilities are mixed. A large
cohesive parser or policy table may remain when splitting would reduce clarity.

Use export subpaths for narrow advanced contracts that need consumer access.
Do not expose internal filesystem paths or create forwarding packages.

## Current Consolidated Owners

- Runtime owns a lazy Execution-host subpath for bounded argv processes and
  process-tree cleanup; it is absent from Runtime/App root facade closure.
- Runtime owns the lazy Secrets subpath used by Provider execution and
  Connector hosts; secret values are resolved in trusted hosts and never enter
  durable provider profiles.
- Workspace owns changesets, review/apply, isolation, Git/worktrees, tasks,
  canonical path confinement, and explicitly registered coding tools.
- Team owns conversation, delegation, and delegation graphs as separate policy
  modules.
- Extension owns contribution contracts, deterministic resolution, and static
  source hosting without runtime dependencies.
- Plugin owns trust, install, sandbox, subprocess, catalog, and action workers;
  Product command projection belongs to Product App Command Host.
- Connector owns adapter contracts, packaging, leases, delivery, and
  supervision; it consumes Runtime Secrets rather than owning another resolver.
  Deterministic adapters are test fixtures only.
- Product App TUI owns its contribution resolver, shell read model, controller,
  presenter, and terminal host.

The active workspace has 18 package manifests. Deleted identities are recorded
only as governance tombstones and implementation history.

## Verification

Use `pnpm audit:structure` for file-level warnings and
`pnpm audit:package-governance` for package truth. Distribution, facade, and
source packlist audits enforce workspace dependency closure. `pnpm release:sdk`
and `pnpm audit:sdk-determinism` enforce the actual compiled publication shape.
