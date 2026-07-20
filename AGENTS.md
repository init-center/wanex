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

Phase 758 Product App Chat-First Surface is complete. Phase 759 Post-Slice
Product Evidence And Replan is now the current frozen phase. The completed
Phase 758 record is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1017-phase-758-product-app-chat-first-surface-plan.md`

Until Phase 759 is replanned and frozen:

- do not add another Product App microfeature or package;
- inspect the completed chat-first product evidence and choose the next real
  user journey before implementation;
- preserve the mode split: chat is primary conversation, workbench and
  diagnostics are explicit surfaces;
- do not reopen lower Runtime/App/Storage/schema or native distribution work
  unless the replan identifies an executable blocker.

The frozen reconstruction route is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/0999-wanex-best-practice-reconstruction-master-plan.md`

Phase 757 evidence remains the release baseline. Phase 758 must not reopen its
deleted package identities, compatibility code, schema migration chain, or
native distribution decisions. The feature freeze is lifted only for the
bounded Phase 758 user journey, not for unrelated Product App microfeatures.

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
