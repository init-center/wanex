# @wanex/plugin

Durable Plugin contracts, package inspection, action submission, and worker
execution for Wanex trusted hosts.

## Runtime boundary

`PluginRuntime` owns Plugin manifest/install persistence and submits
`plugin.action` scheduler jobs. Actions must appear in an explicit catalog.
Every execution identity includes an exact Plugin version. Submission and the
worker both atomically recheck the durable manifest, active install, trust,
declared capability, sandbox request, and host policy. At most one install
version per Plugin is active; an action already inside its immutable execution
host may finish after a later version is activated.

Trusted callers can activate an already verified declarative
`PluginInstallPlan` with `activateInstallPlan()`. Manifest and install records
are validated and written by one `activate-plugin-install` Storage transaction;
an install conflict cannot leave a newly registered manifest behind.

## Local package flow

A local package is a directory containing `wanex.plugin.json`. That file is a
`wanex.plugin.package.layout.v1` document and declares every package file with
its exact byte count, lowercase SHA-256 digest, and executable state.

The host flow is deliberately split:

```text
inspectLocalPluginPackage (read-only)
  -> trusted UI or CLI review
  -> installLocalPluginPackage
       -> inspect source again
       -> copy to same-volume staging
       -> inspect staging again
       -> atomically promote immutable artifact
       -> activate manifest + install in one Storage transaction
```

Inspection never imports the entry point, starts a process, runs a package
manager, or executes lifecycle scripts. It rejects undeclared files, missing or
mutated content, symlinks, non-regular entries, unsafe paths, executable drift,
and packages outside configured file, byte, path, depth, and dependency
budgets.

Materialized roots are content addressed:

```text
<installBase>/<pluginId>/<version>/<artifactSha256>
```

Promotion uses a staging directory on the same filesystem. An existing target
is reused only after complete reinspection proves that it is the same artifact.
POSIX package files and directories are sealed read-only after promotion.

Local packages are unsigned by default. Explicit approval changes the trust
decision to `allow`, records the approving actor and artifact digest, and keeps
the signature absent. Approval must never be represented as
`signature.verified: true`; cryptographic verification requires a separate
trusted verifier.

## Product command declarations

A package may declare up to 128 Product commands under
`contributes.commands`. Each declaration is data-only and contains a bounded
command id, invocation name, title, optional description/category/aliases,
explicit `visible` or `hidden` palette visibility, an action id from the same
layout, and an optional JSON input schema. A package with no command declarations
is a valid headless Plugin.

The package cannot declare a handler reference, provenance, source, trust,
priority, conflict policy, or executable function. Unknown declaration fields,
duplicate command ids, ambiguous names/aliases, dangling action references, and
out-of-budget values are rejected. The package/manifest version is the only
action version source; actions do not carry a second version field.

`@wanex/plugin-command-host` reparses the durable layout, validates command input
schemas with the neutral Extension schema parser, and derives exact-version
handler references plus Plugin/user/user-enabled provenance. A malformed schema
fails the complete generation projection; no partial command catalog is
published.

## Dependencies and execution

Bundled runtime dependencies must be declared, lazy-loaded, and bounded by a
positive packed-byte budget. Peer, optional, and external-artifact dependencies
remain explicit host requirements and cannot be hidden inside the local package
closure.

`createSubprocessPluginActionHost` provides bounded JSONL subprocess execution
with timeout, abort, stderr/stdout limits, and process-tree termination. Trusted
subprocess hosts resolve relative commands inside the durable immutable install
root and use that exact root as `cwd`. The parent still owns authorization and
sandbox policy; a child process boundary alone is not proof of OS isolation.

`createInProcessPluginActionHost` exists for explicitly trusted local handlers
and tests. Third-party packages should use a stronger host isolation boundary.

## Out of scope

This package does not render Plugin UI, download marketplace artifacts, install
npm dependencies, run package lifecycle scripts, manage connector networking,
resolve Product command conflicts, or provide a complete OS sandbox. Product
composition and Plugin management UX belong to trusted application hosts above
this package.
