# Product, Host, And Execution Strategy

Date: 2026-08-29
Status: active architecture; Route 1 through Route 4D complete on verified Unix
and macOS Seatbelt platforms

## Decision Summary

Wanex has one user-visible product per platform, not separate Chat, Work, and
Coding applications. Internally, the product keeps Assistant and Coding as
separate application domains over shared Runtime infrastructure.

The user works with understandable objects:

- conversations for questions and iterative discussion;
- tasks for substantial work with a reviewable outcome;
- projects for repository-scoped software work;
- connections for local, remote, and cloud Agent Hosts.

Chat, long-running work, and coding are experience profiles composed from
orthogonal capabilities. They are not Kernel modes and must not become a
`chat | work | coding` enum in Protocol, Storage, or Runtime.

The target shape is:

```text
Desktop / Web / Mobile / TUI
  -> Product shell
      -> Assistant application
      -> Coding application
      -> Host directory and connection UI
  -> AgentHostClient
      -> local or remote Agent Host
          -> Runtime
          -> one authoritative Session Store
          -> ExecutionEnvironment
              -> Native
              -> local OS sandbox
              -> container
              -> later managed execution provider
```

Client placement, Agent Host placement, Store authority, execution placement,
and sandbox policy are independent decisions. A Gateway is optional routing
or control-plane infrastructure; it is never the Runtime owner or mandatory
local product entry.

## Product Experience

### Do Not Ask Users To Classify Internal Modes

The default composer does not require a user to choose Chat, Work, or Codex
before writing a request. Product routing uses explicit context and required
capabilities:

```text
simple question without a workspace -> conversation
clear multi-step deliverable         -> task
repository context or code mutation  -> project task
```

Automatic routing may suggest a workflow, but it cannot silently expand
authority. When a request needs a repository, local application, remote Host,
network access, secret, or stronger execution permission, the Product asks for
that resource or permission directly. Explicit project selection always wins
over intent inference.

The Product may offer a lightweight `Auto | Conversation | Task` preference.
Repository entry selects the Coding workbench by context; it does not require
another Codex-mode switch.

### Shared Surface, Separate Domains

The unified platform product may project Assistant and Coding activity into one
navigation system, notification center, settings surface, and visual language.
The canonical domains remain separate:

- Assistant owns ordinary conversation, artifacts, plans, goals, schedules,
  teams, media generation, and everyday tool workflows.
- Coding owns trusted repository admission, repository-scoped Sessions,
  Workspace tasks, isolated worktrees, Tool activity, Proposals, apply, undo,
  and code-oriented recovery.
- The platform shell owns navigation, connection selection, shared Provider
  setup, Secret Store access, and platform permissions.

A visible conversation may create or link a Task or Project activity. That
does not merge their durable state machines. Cross-domain handoff stores typed
references and bounded context rather than copying histories or exposing
authority objects.

### Product Information Architecture

The stable top-level concepts are:

```text
Conversations
Tasks
Projects
Connections
```

Internal jobs, attempts, leases, claims, worktrees, event cursors, and Runtime
identities are diagnostic evidence, not ordinary navigation concepts.

## Naming And Package Ownership

The ambiguous pre-release `@wanex/product` identity described an architectural
role rather than the domain it owned. Route 1 directly renamed it to
`@wanex/assistant`; no compatibility package or export alias is retained.

The current application identities are:

```text
@wanex/app        trusted application facade
@wanex/assistant  Assistant application domain
@wanex/coding     Coding application domain
@wanex/desktop    one unified Electron product
@wanex/tui        one terminal product
```

The owner audit also proved that the old `@wanex/web`, `@wanex/local-host`, and
`@wanex/plugin-command-host` closures are Assistant-specific. They now exist
only as `@wanex/assistant-ui`, `@wanex/assistant-host`, and
`@wanex/assistant-plugin-host`. The old package names, routes, environment
variables, bins, wire kinds, and report paths have no live aliases.

Do not add `@wanex/coding-desktop`, `coding-web`, a generic shell package, a
design-system package, or a composition umbrella speculatively. Coding UI can
live under the existing Desktop product until a second real presentation
consumer proves an independent package boundary.

## Agent Host And Store Authority

An Agent Host owns Runtime lifecycle, Session admission, workers, approvals,
event streams, execution bindings, and canonical reads. A client is a remote
control surface and never becomes an accidental second authority.

Rules:

- one Session has exactly one authoritative Agent Host and Store at a time;
- a local Coding Session normally remains authoritative on the machine that
  owns its repository;
- a cloud Assistant Session uses an account-scoped cloud Store and can sync
  across clients;
- a mobile or Web client connected to a computer reads that Host's history; it
  does not copy the database into an account Store;
- SQLite files are never synchronized and local/cloud writers never share one
  Session through dual writes;
- active work never migrates to another Host silently;
- migration, fork, import, and snapshot restore are explicit operations;
- workspaces use explicit clone, upload, mount, snapshot, or artifact flows,
  not transparent filesystem synchronization.

The first remote invariant is:

```text
Wanex Server runs where commands execute.
```

A later remote execution provider may place an execution environment elsewhere,
but that is an explicit Host capability and does not change the client
protocol or Store authority.

## Execution Environment And Sandbox

Sandboxing is required as a supported capability, but it is not a user-visible
product mode and not a separate Agent Kernel. Runtime exposes a capability-based
`ExecutionEnvironment` through the existing execution owner.

The environment must cover every path that can affect the workspace or host:

- process execution and process-tree cleanup;
- filesystem reads, writes, metadata, and temporary files;
- PTY and terminal sessions;
- Git and repository operations;
- LSP and other long-lived development processes;
- network policy;
- secret projection;
- resource and artifact export.

Putting only Bash in a sandbox while Node file tools, Git, or LSP access the
Host directly is not an isolation boundary. Environment capabilities are
declared explicitly; unsupported capabilities fail closed.

Initial providers are:

1. Native execution, preserving current behavior with truthful capability and
   risk reporting.
2. Local OS sandbox: Seatbelt on macOS, a reviewed Landlock/seccomp or
   Bubblewrap path on Linux, and restricted token, Job Object, and directory
   ACL composition on Windows.
3. Container execution for stronger isolation and reproducibility.
4. Managed providers only after a concrete product need proves lifecycle,
   persistence, workspace, secret, network, and recovery requirements.

Requesting isolation must never silently fall back to Native execution. A Turn
freezes environment identity, capability snapshot, workspace strategy, Tool
binding, Provider binding, and permission evidence at admission. Changes apply
to later Turns.

### Capability Boundary

The environment is intentionally smaller than a generic operating-system or
application service locator. It owns only the primitive effects whose placement
and enforcement must agree:

- bounded one-shot and managed process execution;
- structured filesystem access and temporary locations;
- optional PTY execution;
- network policy and, when provided, an environment-local HTTP capability;
- explicit Secret projection into an admitted process;
- bounded export of environment-local bytes.

Git, worktree, snapshot, and transaction semantics remain owned by Workspace
and adapt the process/filesystem ports. LSP remains a Coding protocol over a
managed process. Artifact persistence remains owned by Runtime Resources.
Provider HTTP and Storage transport remain trusted Host control-plane traffic.
This prevents `ExecutionEnvironment` from becoming a kitchen-sink owner while
still ensuring that task effects cannot bypass its placement or policy.

An environment is constructed and lifecycle-owned by trusted Host composition.
An execution scope is a borrowed, bounded view for one repository operation,
Workspace task attempt, plugin action, or similarly explicit operation. The
scope contains process and filesystem authority plus an immutable binding; it
is never exposed to a renderer, model, plugin manifest, or remote client.

### Durable Evidence

Environment evidence and application scope are separate contracts.

`executionEnvironment` is a typed neutral binding containing environment and
provider identity, provider contract revision, a bounded capability snapshot,
the admitted policy snapshot, and canonical digests. It contains no absolute
path, resolved Secret, claim token, or process handle.

`applicationScope` is a typed opaque envelope whose semantics belong to the
application domain. Coding uses it to bind repository, Workspace, task, and
access evidence. Protocol and Storage validate its shape and digest without
learning Coding semantics. The old generic `environmentSnapshot` field is
removed directly during Route 2; Wanex is unpublished and retains no alias or
dual-write path.

Workspace tasks persist the same exact environment binding as their enclosing
Coding Turn. Recovery resolves and compares that binding before any process or
filesystem effect. Missing, changed, or unsupported evidence fails closed into
an explicit recovery/attention result.

### Native Provider Truthfulness

Native is an explicit provider, not the default meaning of a missing provider.
It starts child processes from a reviewed launch-variable allowlist rather than
all of `process.env`; credentials and Provider keys require explicit Secret
reference projection. Direct and supervised process strategies are explicit
construction choices, and Coding requires supervised cleanup.

The initial Native capability snapshot reports no OS isolation, only
library-level filesystem guarding, unrestricted network, no PTY, explicit-only
Secret projection, and bounded byte export. A request for stronger isolation,
restricted network, PTY, or another unsupported capability fails during scope
binding. Native execution is useful for development, but its truthful evidence
must never be presented as sandbox confinement.

## Remote Host Protocol

Remote storage RPC and remote Agent control are different contracts. The
remote Agent Host protocol is an application protocol over the existing safe
application surfaces. It supports:

- authenticated Host and connection identity;
- capability discovery and version negotiation;
- bounded canonical reads and strict commands;
- ordered advisory events with stream identity and sequence;
- reconnect, replay-window loss, Host replacement, and canonical reread;
- cancellation, approval, recovery, and artifact delivery;
- explicit connection and task lifecycle.

Clients send opaque object identities and credentials. They cannot select a
Store path, submit an arbitrary repository path, or address another tenant's
Store. Local IPC and remote TLS transports adapt the same application
semantics; neither transport becomes a Gateway-owned state machine.

## Mobile Strategy

The Mobile product has three independent roles:

1. Cloud client for account-scoped conversations, tasks, media, and history.
2. Remote Host controller for a user's computer, server, or managed sandbox.
3. Device Capability Bridge exposing approved phone capabilities as structured
   tools to an authoritative Agent Host.

The Bridge is not an Agent Host: it does not own the Session, model loop,
worker, canonical Store, or task state. It is a leased, reconnectable Tool
Provider. A phone becomes an Agent Host only in a separate future composition
that actually runs Runtime and owns its Store on the device.

### Maturity Tiers

Mobile Agent capability is not one uniformly mature feature:

| Tier | Capability | Current product status |
| --- | --- | --- |
| 0 | Cloud conversation and remote Host control | production target |
| 1 | This-app and OS-mediated camera, picker, share, location, notification, and document actions | production target after native permission proof |
| 2 | Structured cross-application actions such as Android AppFunctions and Apple App Intents | experimental and platform-gated |
| 3 | General screen understanding, clicking, typing, and cross-app UI automation | research-only; no release commitment |

As of 2026-08-27, Android AppFunctions remains an experimental preview,
requires Android 16 or later, and its Gemini integration is limited to a
private preview for trusted testers. Apple and HarmonyOS expose useful
platform actions, but do not give an ordinary third-party application a
portable, unrestricted cross-app Agent authority. Wanex therefore freezes the
Bridge contract now but does not put Tier 2 or Tier 3 on the first Mobile
release critical path.

Device capabilities prefer platform contracts over screen automation:

```text
camera capture
photo or document selection
calendar and reminder actions
location reads
notifications
share sheet
contact selection
app-provided actions
```

Android should adopt AppFunctions as it matures and use ordinary Android
permission APIs meanwhile. Apple platforms use App Intents, Shortcuts, and
document/share contracts where available. HarmonyOS uses its official
capability and permission APIs. Each native client adapts platform tools to a
common Wanex Tool contract without pretending platform permissions are equal.

Device tools require foreground/background capability declaration, a bounded
lease, explicit permission evidence, idempotency where applicable, minimal
result data, and approval for consequential actions. Device disconnects fail
clearly; they do not redirect work to an unrelated Host.

The Host receives a short-lived capability snapshot rather than assuming that
an installed mobile client can perform an action. An action request binds exact
device identity, capability revision, permission state, foreground requirement,
sensitivity, idempotency key, and lease expiry. Consequential confirmation is
performed on the device at action time. Expired, offline, revoked, or changed
capabilities fail closed and are never replaced by screen automation.

Screen understanding and simulated input are a later, high-risk
`MobileComputerUse` capability. They require visible operation, immediate stop,
strict platform policy review, and per-action approval for messages, purchases,
authentication, permissions, and other consequential effects. Accessibility
APIs are not the default integration strategy.

## Multi-Agent And Workflow Rules

Many Agents cooperate through separate Sessions and Jobs, not concurrent Turns
inside one Session. One Session admits at most one active Turn; child Sessions
can execute concurrently under durable graph, budget, cancellation, and
fairness policy.

Plan, Goal, scheduled work, steering, and side queries remain application
workflows over Runtime primitives. Team conversation is a separate policy
domain from delegated task graphs even though both reuse Sessions, Jobs, and
Agent execution.

File changes converge through isolated worktrees, Proposals, hash validation,
review, and transactional apply/undo. Agents never resolve conflicts by last
writer wins against a shared checkout.

## Frozen Implementation Route

### Route 1: Product Ownership And Naming Reset (Complete)

- superseded the unimplemented standalone `@wanex/coding-desktop` plan;
- audited Assistant/Web/Assistant Host/Plugin Host/TUI ownership;
- directly renamed the four Assistant-owned packages and their contracts;
- updated package governance, source directories, docs, tests, and distribution
  rules in one atomic pre-release change;
- retained no aliases, forwarding packages, deprecated exports, or migration
  layer.

### Route 2: Execution Environment Foundation (Complete)

- Route 2A directly replaces `ExecutionHost`/`NodeExecutionHost` with
  capability-based environment, scope, process, managed-process, and filesystem
  contracts under the existing Runtime execution owner;
- Route 2B routes Workspace path, read, Git, worktree, snapshot, transaction,
  recovery, and Tool effects through one admitted scope and removes all
  implicit Native clients;
- Route 2C replaces the misnamed untyped `environmentSnapshot` with typed
  `executionEnvironment` and `applicationScope` evidence, persists the same
  environment on Workspace tasks, and composes one environment through Coding;
- Route 2D binds Plugin subprocesses and artifact export, proves Secret and
  unsupported-capability semantics, and closes the boundary with conformance
  and architecture audits;
- retain current safe Application/transport contracts and add no package.

The exact frozen implementation and verification plan is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1455-route-2-execution-environment-foundation-plan.md`

### Route 3: Unified Desktop Coding Workbench (Complete Through Route 3C)

- evolve the existing `@wanex/desktop` into the single platform shell;
- compose Assistant and Coding trusted owners in Electron main;
- keep one Provider/Secret configuration authority;
- add Coding project selection, Sessions, live activity, approvals, Proposal
  review, apply, undo, cancellation, and recovery as a Desktop feature;
- use strict preload IPC and the safe `@wanex/coding` client;
- do not add a second Electron executable or HTTP Gateway.

Native execution remains an explicit development option and is labelled
truthfully. macOS Desktop Coding now selects the Seatbelt provider by default;
other platforms remain Native until a real provider passes their platform
conformance gate. The installed Desktop is a real development product, while
untrusted cross-platform execution is not yet a release claim.

### Route 4: Local Sandbox And Container Providers (Complete Through Route 4D)

- Route 4A policy and provider admission is complete.
- Route 4B macOS Seatbelt provider and common execution conformance are
  complete.
- Route 4C trusted Coding composition selection is complete. Desktop selects
  Seatbelt on macOS by default and Coding policy follows provider capability.
- Route 4D PTY / Interactive Process Foundation is complete on Unix and macOS
  Seatbelt. Its implementation and evidence are recorded in
  `1482-route-4d-pty-interactive-process-completion.md`.
- PTY is an optional `ExecutionScope.terminal` capability using the existing
  Rust supervisor, raw-byte events, explicit resize, and the same Scope
  cleanup authority as ordinary execution. Windows continues to report PTY
  unavailable until real ConPTY and Job Object evidence exists.
- Windows/Linux OS providers and containers remain independently gated follow-up
  decisions. Unsupported requests fail closed; no provider silently falls back
  to Native or pipe-mode execution.
- add a container provider only after the environment conformance suite and a
  concrete lifecycle requirement are stable.

### Route 5: Agent Host Protocol And Connections (In Progress Through Route 5C)

The route plan and its implementation boundary are recorded in
`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1483-post-route-4d-architecture-review-and-route-5-agent-host-plan.md`.
Route 5A has completed the typed protocol envelopes and boundary validators in
the existing `@wanex/protocol`; its completion record is
`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1484-route-5a-agent-host-protocol-completion.md`.
Route 5B has completed the in-process endpoint and reusable protocol client;
its completion record is
`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1485-route-5b-in-process-agent-host-port-completion.md`.
Route 5C Unix local IPC is complete and recorded in
`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1486-route-5c-unix-agent-host-local-ipc-completion.md`.
Authenticated remote TLS and product integration are gated on a new Route 5D
review and their own transport/security evidence. Windows named pipes remain
platform-gated. No new Gateway or generic Host package is authorized by the
plan.

### Route 6: Cloud Assistant Composition

- deploy account-scoped Assistant Hosts with authoritative cloud Stores;
- support cross-device conversation/task history and cloud scheduling;
- keep repository-bound Coding history on its execution Host unless a user
  explicitly uses a managed cloud repository environment.

### Route 7: Native Mobile Clients

- build Swift, Kotlin, and HarmonyOS clients against AgentHostClient;
- deliver cloud conversations and remote Host control first;
- add Tier 1 structured device tools behind platform permission adapters;
- keep Tier 2 cross-application actions behind explicit platform maturity,
  distribution-policy, permission, and conformance gates;
- treat Tier 3 general screen-control automation as research with no release
  commitment until product, security, and store-policy requirements are proven.

### Route 8: TUI Convergence And Managed Environments

- let the existing TUI expose Assistant and Coding journeys through their safe
  application contracts without duplicating Host state;
- extract shared presentation code only after Desktop and TUI prove a real
  common owner;
- add SSH or managed sandbox providers only for concrete deployment demand.

### Route 9: Release Hardening

- conformance suites for every ExecutionEnvironment and Agent Host transport;
- security, permission, reconnect, crash recovery, and multi-Agent load tests;
- packed SDK and platform distribution evidence;
- startup, footprint, process cleanup, and platform-native permission proof;
- remove obsolete pre-release names and routes rather than preserving them.

Each route ends with an architecture, package-ownership, distribution, and
test review before the next route is frozen. Package count or file length alone
never authorizes another package.

## Explicit Rejections

- three Kernel modes named Chat, Work, and Coding;
- separate user-visible Assistant and Coding desktop applications by default;
- a mandatory all-purpose Gateway;
- remote Storage treated as remote execution;
- transparent SQLite or workspace synchronization;
- silent task migration or sandbox-to-Native fallback;
- renderer access to Store, Runtime, secrets, repository paths, or process
  handles;
- Accessibility-based phone control as the primary mobile tool contract;
- speculative shell, bridge, composition, design-system, or provider packages.

## Reference Evidence

OpenAI's current public documentation describes Chat, ChatGPT Work, and Codex
as different user experiences with overlapping capabilities. It states that
Work and Codex share core execution, isolation, and permission mechanisms, and
that Cloud Work runs the Codex harness in an isolated managed environment.
Wanex adopts the useful architectural lesson, not the user-facing mode naming.

- <https://learn.chatgpt.com/docs/use-chatgpt>
- <https://learn.chatgpt.com/docs/get-started-with-work>
- <https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview>
- <https://learn.chatgpt.com/docs/cloud>
- <https://developer.android.com/ai/appfunctions>

The repository comparisons with Codex, OpenCode, Pi, DeepSeek Harness, Octo,
Hermes, OpenHanako, and OpenClaw support the same separation: client location,
Host authority, execution environment, isolation, and persistence must remain
orthogonal even when one product composes them together.
