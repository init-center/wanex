# @wanex/plugin

Durable plugin manifest and action-submission facade for Wanex.

This package records manifests, submits `plugin.action` scheduler jobs, and
provides the plugin action host contract used by workers.

Plugin actions must be registered in an explicit catalog. Before a handler runs,
the runtime rechecks manifest state, declared capability, and sandbox policy.
Sandbox declarations can request resource, network, filesystem, and execution
time access; the default policy denies resource, network, and filesystem access
unless a host-supplied guard allows it. Trusted local handlers can be adapted
with `createInProcessPluginActionHost`; production plugin execution can provide a
different host without changing the durable scheduler path.

`createSubprocessPluginActionHost` provides the first isolated host prototype. It
spawns a child process per action, sends a single JSONL execute request, reads a
single JSONL result/error response, bounds both output streams, rejects
truncated protocol output, and terminates the process tree on timeout or abort.
The parent still owns manifest, capability, and sandbox checks; the shared
Execution host is process lifecycle infrastructure, not proof of OS isolation.

Subprocess plugins can be declared directly in `manifest.entry` using
`wanex.plugin.host.subprocess.v1`. `createSubprocessPluginActionHostFromManifest`
validates that entry and builds the host from the manifest-owned plugin id,
version, command, and action descriptors.

Production paths should prefer
`createTrustedSubprocessPluginActionHostFromManifest`. It combines the manifest
entry with `wanex.plugin.package.trust.v1` metadata, requires an `allow` decision,
checks plugin id/version identity, rejects unverified signatures, and resolves
relative subprocess commands inside the installed plugin root.

Installer implementations can use `wanex.plugin.package.layout.v1` and
`wanex.plugin.install-plan.v1` as pure contracts. The layout validates package
files, runtime dependencies, entry actions, and capabilities; the install plan can
derive both `RegisterPluginManifestRequest` and `PluginPackageTrustRecord`
without the runtime downloading packages or verifying signatures itself.
Bundled runtime dependencies must be lazy-loaded and declare a positive
`maxPackedBytes` budget. Optional, peer, and external-artifact dependencies can
remain app-selected without forcing a host product to package every plugin
dependency by default.

This package does not install npm packages, render plugin UI, implement connector
networking, or claim to provide a full OS/process sandbox. Strong isolation is a
plugin-host concern layered above this runtime contract.
