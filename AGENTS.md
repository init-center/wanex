# AGENTS.md

This file defines the working rules for AI agents contributing to Wanex.

## Project

Wanex is an Agent Runtime Kernel project.

The implementation must proceed from the bottom of the architecture upward:

1. protocol
2. system service
3. storage client
4. session runtime
5. provider fidelity
6. minimal agent loop
7. CLI harness
8. tool/resource core
9. budget/scheduler
10. team conversation
11. plugin core
12. connector/channel contracts and optional control plane
13. upper applications

Do not pull upper-layer concerns into lower-layer packages.

## Current Post-Gate Route

Phases 742-757 completed the architecture course correction and native release
gate. The historical route remains in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/architecture-course-correction.md`

Phases 758-770 are complete. The initial Phase 765 exact-input/cancellation
audit was superseded before implementation by a deeper pre-release state-model
audit. Phase 765 Durable Turn Contract Reconstruction and Phase 766 Exact
Recovery Evidence And Safe Resume are complete. Phase 767 Cancellation,
Steering, And Active Abort is also complete, including its full repository,
SDK, Rust, and Eval release gates. The completed durable operation evidence and
current route are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1021-phase-762-product-local-real-provider-conversation-slice.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1022-phase-763-post-real-provider-product-evidence-and-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1023-phase-764-durable-conversation-operation-foundation.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1024-phase-765-session-run-identity-binding-and-cancellation-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1025-reference-repository-refresh-and-wanex-revalidation.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1026-wanex-pre-release-clean-architecture-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1027-phase-765-durable-turn-contract-reconstruction.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1028-phase-766-exact-recovery-evidence-and-safe-resume-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1029-phase-766-exact-recovery-evidence-and-safe-resume.md`

Phase 767 completion record:

/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1030-phase-767-cancellation-steering-active-abort-replan.md

Phase 768 Runtime/App Public Facade Reconstruction is complete. It directly
replaced the duplicate thin App root and `@wanex/app/backend` identity with one
trusted `@wanex/app` App Host, removed public `WanexAppShell*` vocabulary,
completed the Runtime root's durable submit/read/cancel lifecycle, and proved
configurable workers, next-turn-only provider selection, and fresh-turn
regeneration. It added no compatibility export, schema change, package,
gateway, or second execution authority. The implementation and verification
record is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1031-phase-768-runtime-app-public-facade-reconstruction.md`

Phase 765 completed the following:

- replace the old `session.run` model with durable inbox input, stable logical
  turn, explicit physical attempt, canonical sequenced conversation entries,
  and immutable execution binding;
- keep admitted inbox work outside provider replay until atomic promotion;
- bind exact `jobId + turnId + inputId` and use one scheduler/concurrency
  lease instead of a separate session runner lease;
- remove claim-next behavior, `SessionRunId`, `session_run`,
  `session_runner_lease`, public `once | to_completion`, and generic
  session-turn scheduler retry;
- make a session turn a bounded to-completion operation and settle canonical
  message, attempt, turn, input, job, budget, and events atomically;
- persist complete provider replay state and freeze provider, context, tool,
  permission, and environment evidence at admission;
- remove custom UI-surface protocol concepts from Kernel; official A2UI
  payloads travel as immutable resources for upper App/Product rendering;
- fail closed after ambiguous provider/tool execution; automatic crash
  continuation is limited to checkpoints proven safe by canonical evidence;
  ambiguous provider or non-idempotent effects are never replayed
  automatically;
- migrate all first-party callers directly with no compatibility aliases,
  migration chain, old fields, or dual read/write path;
- keep the existing 18-package graph and add no execution package.

Phase 767 completed the following:

- keep durable cancellation, interrupt, steering, recovery classification, and
  terminal settlement authoritative in System Service;
- add exact process-local active abort by job and attempt only as a Runtime
  latency mechanism, with durable-first Host commands and cross-process control
  observation;
- drain provider and tool cleanup before settlement, classify partial provider
  output as `recovery_required`, and never replay ambiguous effects;
- apply steering only at declared safe points and preserve pending steer exactly
  once across safe owner-loss recovery;
- serialize heartbeats, await in-flight heartbeat shutdown, and turn timeout,
  lease loss, and host shutdown into cleanup-aware structured abort reasons;
- expose bounded App cancel, interrupt, steer, and operation read-model
  contracts without exposing the internal active-abort registry in the SDK;
- retain the existing 18-package graph and pass the complete `pnpm verify`
  release gate with all 52 Eval Harness scenarios.

The historical reconstruction master plan remains in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/0999-wanex-best-practice-reconstruction-master-plan.md`

The completed route through Phase 770 is governed by the Phase 1026, Phase
1028, Phase 767, Phase 768, Phase 769, and Phase 770 records above. Phase 757 evidence remains the
distribution/package baseline: do not reopen deleted package identities,
compatibility code, schema migration chains, or native artifact decisions.
Phase 767 passed the pre-implementation course-correction guardrail in document
1030; do not revive the child-specific checkpoint scope removed by Phase 1028.
Phase 769 Product Conversation Progress And Cancel UX is complete. It replaced
the Product blocking chat path with exact durable
operation submit/read/cancel/regenerate commands, retains canonical App reads as
truth, and carries only bounded provider-neutral assistant deltas through the
existing app-owned surface transport. It adds no package, gateway, schema
version, migration, durable delta log, renderer Storage access, compatibility
alias, or second execution authority. The complete implementation and final
repository verification record is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1032-phase-769-product-conversation-progress-cancel-ux-replan.md`

Phase 770 Resource-Bearing Conversation Input Fidelity is complete. The former
broad multimodal phase mixed existing-resource conversational input with
specialized asynchronous media generation. The corrected route first freezes
exact resource and capability evidence, adds bounded location-neutral byte
reads, and completes provider-native image/document input lowering. Durable
messages contain references rather than bytes/base64, and unsupported or
changed resources fail before provider dispatch. The complete implementation
and final repository verification record is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1033-phase-770-resource-bearing-conversation-input-fidelity-replan.md`

Phase 771 Product Multimodal Attachment UX is complete. It is an upper Product
journey over the frozen Runtime/App resource contract. It added bounded
trusted-host binary upload, reference-only Product drafts, safe previews and
removal, and canonical resource-bearing conversation submission. It added no
package, schema table, gateway, provider upload cache, or media-generation
contract. The implementation and final repository verification record is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1034-phase-771-product-multimodal-attachment-ux.md`

The final Phase 771 gate passed all 53 Eval Harness scenarios, package checks
and tests, SDK compilation/consumer proofs, Rust formatting/tests/clippy, and
distribution audits. Phase 772 Media Generation Operation Runtime and Phase
773 Optional Capability Turn-Contract Evidence are complete. The completed
Phase 773 record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1036-phase-773-optional-capability-turn-contract-evidence.md`

Phase 773 retained the existing Tool Registry and permission evidence,
normalized registered definitions, used locale-independent canonical ordering,
kept internal evidence helpers out of the public SDK, and failed before
provider dispatch on executable drift. Its final gate passed 55 Eval scenarios,
212 Runtime tests, the complete compiled/packed SDK proofs, Rust checks, and
`pnpm verify`.

Phase 774 Cross-Platform And Distribution Gate is now the current
implementation route. Its frozen plan and implementation record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1037-phase-774-cross-platform-distribution-gate-plan.md`

Implement only the missing native evidence: Windows-safe atomic replacement,
real process-tree proof, `linux-x64` artifact support, explicit target staging,
two-host remote load/cancellation, native CI on Linux x64/macOS arm64/macOS
x64/Windows x64, and enforced physical receipts for the existing headless and
Electron boundaries. Do not turn platform evidence into Kernel concepts or
widen cold Runtime/App dependency closure merely to simplify packaging.

The local macOS arm64 implementation now includes all of those code and test
paths without adding a package, Protocol field, Storage RPC command, schema
version, gateway, or compatibility alias. The former narrow remote Eval,
Electron-only workflow, and stale Runtime physical baseline were replaced
directly. Phase 774 remains incomplete until native CI passes complete
`pnpm verify` on Linux x64, macOS arm64, macOS x64, and Windows x64; executes
each staged binary; executes the three Electron targets; reviews every receipt;
freezes final target ceilings; and passes a second enforcing run.

Run 40 exposed and the local implementation corrected a Windows-only SDK
declaration bundling defect: cross-host module-ID classification now treats
POSIX, drive-letter, and UNC absolute paths as filesystem paths, never package
imports. Workspace package tests now use controlled two-level parallelism
(two packages, one Vitest worker per package by default) rather than forced
package serialization or unconstrained nested worker pools. Complete local
`pnpm verify` passes; the correction still requires authoritative Windows CI
evidence.

## Course-Correction Guardrail

Every phase from Phase 744 onward must pass this gate before code changes:

1. Name the shortest runtime/SDK user journey advanced by the phase.
2. List the existing owner and every package/public concept the change adds or
   removes.
3. Reject a new package unless publishing, security, dependency closure,
   lifecycle, or two independent real consumers require it.
4. Separate npm package identity, export entry points, and internal modules.
5. State resource ownership: constructed resources are owned; injected
   resources are borrowed; `stop()` and `dispose()` are distinct.
6. Freeze an executable external or production-boundary acceptance test before
   adding implementation detail.

At phase completion, repeat the gate with evidence from manifests, imports,
packlists, lifecycle tests, and consumer tests. If the phase mostly increases
Product App/UI/read-model surface, package count, compatibility code, or test
harness detail without shortening the runtime/provider/tool/SDK/distribution
main path, stop and replan before continuing.

Real-consumer evidence excludes Eval Harness, package-local tests, references,
skeletons, examples, and spikes. Those can verify behavior but cannot justify a
production package or preserve an otherwise unused capability. A public facade
must also be physically narrow: manifest dependency count, static bundle input
graph, eager imports, and packed closure matter in addition to root export
types. Test-only consumption and a narrow TypeScript barrel do not prove a
boundary is best practice.

Before freezing a cross-language schema, classify each command as core or an
explicit optional capability and name its retained owner. Do not encode an
accidental historical surface merely because both sides already implement it.
Optional storage capabilities must compose over one transport through narrow
ports; do not grow another inheritance-based mega client.

## Required Workflow

- Before or while performing each implementation step, update the implementation docs under:
  `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation`
- Best-practice corrections are allowed during implementation, but they must go through roadmap change control first:
  - document why the old plan is insufficient;
  - document the new phase order;
  - document which phases are inserted, renamed, or shifted;
  - document unchanged boundaries and explicit non-goals;
  - only then continue implementation.
- Every step must record:
  - goal
  - changes made
  - design decisions
  - validation performed
  - whether the result is still best practice for the whole architecture
  - corrections needed if the result is not best practice
- Continue iterating autonomously until the current phase goal is genuinely complete.
- A phase is complete only when it is executable and all relevant tests/checks pass.
- Do not stop at scaffolding if the phase goal requires working behavior.
- Do not use shortcuts that bypass required behavior.
- Do not fake tests, skip assertions, or mark goals complete by weakening requirements.

## Best-Practice-First Policy (No Compatibility Debt)

Wanex is a pre-stable, workspace-stage kernel. There are no backward-compatibility
obligations to external consumers. Architectural correctness outranks preserving
existing code.

- Plan for the best-practice end state, not for compatibility with current code.
- When a design is found to violate best practice, replace it fully. Do not add
  compatibility shims, adapters, flags, or patches whose purpose is to keep a
  known-wrong design alive.
- Do not continue down a path already known to be wrong just to avoid rework.
  Sunk cost is not a reason to keep a bad design.
- Turning around is mandatory when best practice requires it, even when the cost
  is large: rewrites, deletions, reordered phases, or breaking existing internal
  APIs are all acceptable in service of the correct architecture.
- Prefer deleting and rebuilding a wrong abstraction over wrapping it.
- Knowingly accepted technical debt is a blocker to be resolved, not a shortcut
  to ship.

This policy is not a license for undisciplined churn. Every such reversal must
still go through the roadmap change control defined in Required Workflow:

- document why the old design violates best practice;
- document the corrected design and the new phase order;
- document what is being removed or replaced, and the unchanged boundaries and
  non-goals;
- only then carry out the rewrite.

The goal is a clean architecture with no compatibility cruft, reached through
explicit, auditable course corrections rather than silent patching.

## Dependency Policy

- Use recent stable dependency versions whenever practical.
- If the local toolchain is too old for current dependencies, update or select a compatible modern baseline explicitly and document the decision.
- Do not pin old versions unless there is a documented compatibility reason.
- Do not introduce large dependencies for small problems.

## Architecture Rules

- Runtime execution must not import gateway, plugin host, team conversation,
  desktop shell, React, or A2UI renderer code.
- Admitted session input is an inbox record, not model-visible history. Provider
  replay reads only canonical conversation entries in per-session sequence.
- Logical turn, scheduler job, physical attempt, provider invocation, and tool
  execution are distinct identities connected by exact durable references.
- A logical tool execution is identified by canonical assistant message plus
  tool call. Each physical tool invocation has its own fenced attempt; finish
  and retry transitions require the active session-turn lease. Runtime code
  must not choose durable recovery through an unfenced callback/action API.
- One scheduler/concurrency lease is the execution ownership source. Do not add
  another session lease or process-local lock that can disagree with it.
- An admitted turn has one immutable, secret-free execution binding. Mutable
  provider profiles, instructions, skills, tools, permissions, or environment
  must not silently change it.
- Durable conversation resource parts store immutable identity, digest, size,
  kind, and media-type evidence only. They must never persist raw bytes or
  base64 payloads.
- Provider modalities are explicit and frozen per turn. Runtime must resolve
  resource bytes through bounded Storage reads, verify the final digest, and
  reject unsupported or changed content before provider dispatch.
- Running cancellation is a durable request followed by owner/recovery
  settlement. Do not publish terminal cancellation while effects may still be
  active or release the session to another turn early.
- Never automatically replay an attempt after partial provider output or an
  ambiguous non-idempotent side effect.
- SubAgents that use tools or need recovery run in separate durable child
  sessions/turns. They must not write the parent transcript directly; the
  parent merges durable delegation results at a safe boundary.
- Provider-specific wire and replay quirks must stay in
  `@wanex/runtime/provider` adapters.
- Runtime state must go through the storage/system-service boundary.
- Node.js, Electron renderer, plugins, and workers must not directly write runtime JSON state files.
- SQLite is the runtime source of truth.
- JSON/JSONL is allowed for manifest, user-editable config, import/export, and debug data, but not as the primary runtime state store.
- Gateway is optional control plane, not the default runtime entry.
- Plugin runtime must be lazy-loaded and must not be part of cold start.

## Testing Rules

- Add or update tests for meaningful behavior.
- Tests must exercise the real behavior required by the phase.
- If a test cannot run, document why and treat it as a blocker unless the phase explicitly excludes that area.
- Run all relevant checks before finishing a phase.

## Documentation Rule

Implementation logs are not optional.

If code changes and the implementation log does not explain the step, the work is incomplete.
