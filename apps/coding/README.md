# @wanex/coding

Private Coding application domain and trusted composition leaf.

The package has two explicit entries:

- `@wanex/coding` exports only the presentation-neutral Application contract,
  serializable read models, stable application errors, and event types;
- `@wanex/coding/host` owns trusted startup, local repository selection,
  Runtime/Storage/Workspace composition, and complete resource lifecycle.

The trusted Host may receive `CodingExecutionOptions.resolveModelEndpointId`.
When present, this resolver is called once for each new Turn with opaque
identity only. It returns an endpoint ID; Runtime reads the endpoint from the
canonical Store and freezes its normalized snapshot into the Turn binding.
This is the composition seam for a local Product's existing Provider
configuration owner. It makes a changed selection apply to the next Turn
without restarting the Host, while an admitted Turn keeps its original model
and capability evidence. Endpoint objects and credentials never cross this
port. Do not combine it with the static `modelEndpointId` option.

`startCodingApplication(...)` returns a trusted Host handle. Only that handle
accepts an absolute repository path. Its `application` property is the safe
surface for IPC, TUI, or another presentation adapter and accepts only opaque
project, Turn, Tool execution, and Proposal identities. Project read models do
not contain local paths.

Writable Turns execute through Runtime inside durable Workspace tasks and
isolated Git worktrees. Runtime remains the Session/Turn/provider/Tool authority.
Workspace remains the task/ChangeSet/Proposal/apply/undo authority. The Coding
Application projects their state, settles explicit commands, and emits bounded
ordered invalidations without polling or maintaining another durable state
machine.

While a Turn is running, `readLiveTurn(...)` exposes a bounded in-memory
presentation projection. It may contain visible assistant text and Tool names
and states, but never reasoning, Provider state, Tool arguments/results,
resources, paths, or execution authority. `turn_live_invalidated` is an
invalidation-only event; presentations reread the live model and fall back to
canonical Turn/Transcript reads after a stream gap or Host replacement. The
projection is removed when the Turn settles or its Host closes, and is never
written to Storage.

Proposal previews and mutation receipts contain bounded portable relative
paths, hashes, counts, and safe review data. They omit ChangeSet identity,
operation identity, trusted roots, Stores, claims, worktrees, native binaries,
and process handles. Cross-repository Proposal and Session use fails closed.

This package does not own a renderer, generic chat Product, second agent loop,
Proposal state machine, mutation engine, application database, Gateway,
polling loop, schema, or compatibility alias.
