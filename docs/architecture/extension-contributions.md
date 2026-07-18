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
3. App/Product reads contributions and explains provenance.
4. The product allow-list selects supported handler references.
5. Built-in handlers execute in App, or Product App Command Host submits an
   approved Plugin action through `@wanex/plugin`.

`@wanex/plugin` owns manifest, trust, install-plan, sandbox, subprocess, and
durable action lifecycle. It is not the extension registry. Product command
projection is internal to `@wanex/product-app-command-host`, keeping Plugin out
of default App and Product closures.

## File Instructions And Skills

`@wanex/runtime/context` discovers and validates `AGENTS.md` and `SKILL.md`
inputs under Runtime trust policy. Upper products may project those snapshots
into neutral Extension contributions. File conventions do not become Plugin or
UI concepts.

## TUI Contributions

Terminal-specific contribution resolution, shell read models, controller, and
presenters belong to `@wanex/product-app-tui`. They are internal modules and
public subpaths of the terminal product, not generic npm packages.

The TUI invokes Product commands through the renderer-safe Product surface
client. It does not load plugins, open storage, resolve secrets, or execute tools
directly. A future independent TUI SDK requires its own package-gate evidence.

## Packaging And Security

Default App/Product paths must not package Plugin, Connector, channel SDKs,
plugin dependencies, or terminal renderer dependencies. Optional hosts load
heavy code lazily and own the processes they construct.

Project and package contributions remain untrusted until product policy allows
them. Privileged actions require explicit permission. Provider/auth data never
appears in contribution read models. Unsupported domains and handler refs fail
closed.
