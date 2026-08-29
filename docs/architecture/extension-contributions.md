# Extension Contributions

## Neutral Contract

`@wanex/extension` is the source-neutral, dependency-free contribution owner.
It describes provenance, trust, scope, priority, diagnostics, command input
schemas, and instruction, skill, command, agent, tool, provider-catalog, and
lifecycle contributions. Resolution is deterministic and fails closed on
invalid or conflicting input.

Products own contribution sources. Built-ins, policy, project files, plugins,
marketplaces, connectors, and runtime overrides all normalize into the same
contract before App or a product surface consumes them.

Extension does not scan files, read storage, install packages, spawn processes,
execute actions, render UI, or own secrets.

## Loading And Execution

Discovery and execution are separate trust boundaries:

1. A trusted product loads enabled sources.
2. `@wanex/extension/host` resolves a bounded immutable snapshot.
3. The trusted composition owner publishes the complete snapshot as one
   immutable `{ revision, snapshot }` catalog generation.
4. App/Assistant captures one generation per logical operation and explains
   provenance.
5. The product allow-list selects supported handler references.
6. Built-in handlers execute in App, or Command Host submits an
   approved Plugin action through `@wanex/plugin`.

`@wanex/plugin` owns manifest, trust, install-plan, sandbox, subprocess, and
durable action lifecycle. It is not the extension registry. Assistant command
projection is internal to `@wanex/assistant-plugin-host`, keeping Plugin out
of default App and Assistant closures.

Plugin packages may provide bounded data-only `contributes.commands`
declarations. They do not provide `handlerRef`, provenance, trust, source,
priority, conflict policy, or executable functions. The trusted Plugin Command
Host reparses the durable package layout, resolves each declaration to an action
in the same exact package version, validates optional input schemas through this
package, and derives the privileged Extension contribution. One malformed
declaration fails the complete generation; headless Plugins project no Assistant
commands.

## Versioned Catalog Publication

`@wanex/extension` owns a presentation-neutral catalog source contract:

```text
current() -> { revision, snapshot }
subscribe(listener) -> unsubscribe
```

The read source is separate from publisher authority. A trusted composition
owner receives the controller and publishes only complete replacement
generations; App, Assistant, Assistant Web, and TUI receive only the source. Publication
structured-clones and deeply freezes the snapshot, exposes resolver maps through
read-only views, and makes the generation current before notifying listeners.
One failing listener cannot roll back publication or suppress another listener.

Revision is content identity for the complete active artifact set and resolved
contributions. The trusted host must derive it deterministically; a timestamp,
random value, or process-local counter is not valid hot-composition identity.
Publishing the same revision is a no-op and emits no invalidation.

One agent context admission captures one generation. Likewise, each Assistant
command read, explain, preview, or execute operation captures one generation.
An execute operation resolves its exact-version handler from that captured
generation, so a later publication affects only later operations. Assistant may
cache built-ins plus external contributions by revision, but cannot treat that
cache as Plugin installation truth.

The catalog source does not scan packages, read Storage, compute Plugin trust,
or own worker lifecycle. Those are trusted host responsibilities. Surface
invalidation is also separate: subscribers signal that upper presentation
should reread canonical Assistant state rather than pushing install paths, raw
trust records, jobs, or mutable contribution deltas into a renderer.

Assistant owns that presentation projection. It treats `source.current().revision`
as the subscription baseline, so a source that replays its current generation
on subscribe cannot create a false startup invalidation. A changed generation
produces exactly one `assistant.command-catalog.invalidated` event containing only
`sequence`, `at`, and `revision`. Surface records the corresponding
`assistant.surface.command-catalog.invalidated` event in its existing bounded
replay log and points consumers to `readAssistantCommands()`.

Web and TUI never apply command deltas. They invalidate any open or cached
palette state and reread the canonical Assistant catalog after a catalog event,
event gap, or event transport failure. Multiple events reconciled in one pass
still require only one catalog read. Failed Plugin Host refresh retains the
published revision and emits no Assistant/Surface invalidation; publishing an
identical revision is likewise silent. The event payload never contains command
rows, Plugin identity, versions, paths, trust records, grants, jobs, workers,
action payloads, or secrets.

`@wanex/assistant-plugin-host` is the Plugin-specific publication authority. It
reconstructs the complete active set from durable installs, verifies matching
manifest/trust/layout identity, keeps one exact-version execution registry and
one action-claim worker, and publishes one deterministic complete generation.
Callers do not provide a Plugin catalog or Plugin target list. A failed rebuild
retains the current generation; an identical rebuild emits no invalidation.
Local products may satisfy the named `@wanex/assistant-host/application` port
using the structurally compatible `createPluginCommandComposition()` result.
Plugin Host and Assistant Host do not depend on each other; the trusted product leaf
connects them. Default Assistant Host and presentation packages do not depend on
Plugin.

## Trusted Plugin Management

Plugin installation is a trusted-host concern, not an Extension or renderer
concern. The optional management core lives inside the one Plugin Command Host
that already owns catalog reconstruction and worker lifecycle. Its native local
package selector is injected by the platform host; browser and renderer
requests never name a source directory or install root.

The management core keeps full inspection evidence and paths only in a bounded
in-memory TTL registry. It returns deep-frozen safe reviews and installed
summaries, consumes reviews exactly once, reinspects before approval, and
serializes durable mutation with the existing catalog refresh owner. Storage
enforces required `expectedState` CAS in one immediate transaction, including
atomic sibling-version disable. The management policy rejects ordinary
`removed -> installed`; only a new review of the same immutable artifact may
explicitly restore it.

Management invalidation contains only `{ sequence, at, revision }`, where the
revision hashes the safe installed projection. It carries no command delta,
path, layout, trust JSON, actor, job, worker, grant, or payload. A failed catalog
refresh retains the previous Assistant generation and returns an attention state;
retry is explicit and event-driven, with no timer or polling loop. This local
approval proves a user reviewed an unsigned package. It does not claim package
signature verification, process isolation, or operating-system sandboxing.

## File Instructions And Skills

`@wanex/runtime/context` discovers and validates `AGENTS.md` and `SKILL.md`
inputs under Runtime trust policy. Upper products may project those snapshots
into neutral Extension contributions. File conventions do not become Plugin or
UI concepts.

## TUI Contributions

Assistant command contributions are normalized and validated by application.
`@wanex/tui` reads the resulting dynamic command catalog through
the renderer-safe Assistant Surface client. It does not own a second terminal
contribution resolver, static command palette, or generic shell contract.

Every command contribution declares `paletteVisibility` explicitly. The full
catalog remains available to trusted hosts and developer tooling, while
ordinary Web/TUI command palettes consume only `visible` commands. Missing or
invalid visibility is a resolver error and excludes the contribution. A UI
must not infer visibility from command ids, categories, handlers, or source
kind.

The TUI invokes Assistant commands through the renderer-safe Assistant surface
client. It does not load plugins, open storage, resolve secrets, or execute tools
directly. Its schema-guided line input may consume neutral Extension field
descriptors already present in the Assistant command catalog. A future
independent TUI SDK requires its own package-gate evidence.

`inputSchema === undefined` means that a command accepts no input. Commands
that accept an optional object still declare a closed-object schema and use an
empty object when no fields are selected. Assistant performs final schema and
handler validation; upper palettes may provide bounded local feedback but do
not replace Assistant authority or fall back to an arbitrary command string.

## Packaging And Security

Default App/Assistant paths must not package Plugin, Connector, channel SDKs,
plugin dependencies, or terminal renderer dependencies. Optional hosts load
heavy code lazily and own the processes they construct.

Project and package contributions remain untrusted until product policy allows
them. Privileged actions require explicit permission. Provider/auth data never
appears in contribution read models. Unsupported domains and handler refs fail
closed.
