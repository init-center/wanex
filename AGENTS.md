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

The current Product UI route has completed Phase UI-10 Trusted-host Resource
Delivery Contract. Resource identity and bounded reads remain below Product,
while local HTTP authorization, opaque grant lifetime, Range delivery, and
Host-session redemption are owned by the trusted Product Host. Image preview
uses this sole path; audio/video playback UX is not yet claimed complete. The
frozen plan and completion evidence are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1256-phase-ui-10-trusted-host-resource-delivery-contract-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1257-phase-ui-10-trusted-host-resource-delivery-contract-completion.md`

Phase UI-11 Demand-driven Media Playback is complete. Its plan and completion
record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1258-phase-ui-11-demand-driven-media-playback-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1259-phase-ui-11-demand-driven-media-playback-completion.md`

Phase UI-12 Conversation Content Actions is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1260-post-ui-11-gap-review-and-phase-ui-12-conversation-content-actions-plan.md`

Phase UI-12 is complete. Its completion and immediate source-architecture
review are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1261-phase-ui-12-conversation-content-actions-completion.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1262-post-ui-12-product-source-identity-and-layout-review.md`

Phase UI-13 Product Source Identity And Layout Reconstruction is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1263-phase-ui-13-product-source-identity-and-layout-reconstruction-plan.md`

Phase UI-13 is complete. Its completion evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1264-phase-ui-13-product-source-identity-and-layout-reconstruction-completion.md`

The package identities are now `@wanex/product`, `@wanex/web`,
`@wanex/local-host`, `@wanex/desktop`, `@wanex/tui`, and
`@wanex/plugin-command-host`. Product/Web source is organized by owner; browser style
sources are colocated CSS Modules and only generated browser assets are embedded.
Upper application handles use role names such as `shell` and `controller`, not
`productApp` or framework-derived identities. Do not restore a hand-authored
TypeScript stylesheet string, `react/` as a product-domain directory,
`wanex-react-*` selectors, `ProductApp*`/`productApp` repetition,
prefix-sorted type families, retired package paths, or compatibility aliases.

Phase UI-14 TUI And Local Host Source Ownership Reconstruction is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1265-phase-ui-14-tui-and-local-host-source-ownership-reconstruction-plan.md`

UI-14 must reduce the remaining TUI and Local Host source-owner ambiguity
without adding packages, changing Runtime/Storage semantics, or turning
development/demo composition into a product runtime identity.

Phase UI-14 is complete. Its implementation and verification evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1266-phase-ui-14-tui-and-local-host-source-ownership-reconstruction-completion.md`

Phase UI-15 Settings Information Architecture And Provider Onboarding is
frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1267-phase-ui-15-settings-information-architecture-and-provider-onboarding-plan.md`

UI-15 returns to a real upper-product journey. It must keep one Provider
management surface, use progressive disclosure for optional capabilities, keep
architecture/privacy implementation vocabulary out of ordinary Settings, and
must not resume package or line-count-driven source splitting.

Phase UI-15 is complete. Its implementation and verification evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1268-phase-ui-15-settings-information-architecture-and-provider-onboarding-completion.md`

Phase UI-16 Conversation Library Management is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1269-phase-ui-16-conversation-library-management-plan.md`

UI-16 completes the existing rename/archive/restore Product contract in the
Web conversation library. It must add no package, schema, Runtime state, local
copy of canonical sessions, destructive archive confirmation, or compatibility
DOM/CSS alias. Search covers active and archived sessions; transient menu,
rename draft, and disclosure state remain owned by the Web component.

Phase UI-16 is complete. Its implementation and verification evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1270-phase-ui-16-conversation-library-management-completion.md`

The next route is Phase UI-17 Recovery UX, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1271-post-phase-ui-16-product-gap-review-and-phase-ui-17-recovery-ux-plan.md`

UI-17 must translate existing recovery decisions into human-readable Product
UI while preserving explicit safety review, available-decision authority,
recovery revision, and canonical snapshot settlement. It must remove JSON
editing and internal operator language from ordinary Web UI without changing
the Product/Runtime recovery contract.

Phase UI-17 is complete. Its implementation and verification evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1272-phase-ui-17-recovery-ux-completion.md`

The next route is Phase UI-18 Approval UX, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1273-post-phase-ui-17-product-gap-review-and-phase-ui-18-approval-ux-plan.md`

UI-18 must add only per-approval-item Web lifecycle state. It must preserve
Product approval authority, expected revisions, canonical snapshot settlement,
and independent operation of multiple approval items.

Phase UI-18 Approval UX is complete. Its implementation and verification
evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1274-phase-ui-18-approval-ux-completion.md`

UI-18 established the final current approval interaction contract: each
approval item has local pending state, failed actions recover in place, and the
Web App dispatch gate keys approval actions by `approvalId` rather than using a
single coarse lock for every approval. Do not add approval history, an
approval service, a global UI state library, or a compatibility action alias.

The next route is Phase UI-19 Product Entry Review, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1275-post-phase-ui-18-product-entry-review-and-phase-ui-19-plan.md`

Before adding another Web feature, verify the real desktop vertical slice
around `@wanex/desktop`, `@wanex/local-host`, and the existing Web surface;
verify that TUI has its own Product surface entry; and keep `demo:web*` and
`demo:tui*` explicitly disposable development entries. Do not treat the demo
host, browser asset, or an architecture sample as the final product. Do not
continue adding cards or packages until this entry review is complete.

Phase UI-19 Product Entry Review is complete. Its implementation, real
Desktop/TUI entry evidence, distribution measurements, and best-practice
review are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1276-phase-ui-19-product-entry-review-completion.md`

The current Desktop proof contract reads the actual Product owner
`data-ui-product-shell` and the interactive selected-session contract
`data-ui-session-select + aria-current`. Do not restore retired renderer or
row-level selection aliases for proof compatibility.

The next route is Phase UI-20 Contextual Command Palette, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1277-phase-ui-20-contextual-command-palette-plan.md`

UI-20 makes the existing Product command catalog, declarative input, preview,
and execute contract reachable from the Desktop/Web Composer. It must not add
a package, a second command registry, a generic action dashboard, arbitrary
string command parsing, Plugin Runtime access in Web, or internal handler/job
identities in ordinary UI.

Phase UI-20 Contextual Command Palette is complete. Its contract correction
and final implementation/verification record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1278-phase-ui-20-command-contract-correction.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1279-phase-ui-20-contextual-command-palette-completion.md`

The final command contract is strict: missing `inputSchema` means the command
accepts no input; every contribution explicitly declares `paletteVisibility`;
the Product catalog remains complete while ordinary Web/TUI palettes show
only visible commands. Web's canonical snapshot retains `commandCatalog`, but
its filtered presentation model is `commandPalette` / `commandPaletteCount`.
Do not restore `raw` input mode, the old Web presentation names, implicit
visibility, arbitrary JSON input, or compatibility aliases.

The next route is Phase UI-21 Appearance Truthfulness, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1280-post-phase-ui-20-product-gap-review-and-phase-ui-21-appearance-truthfulness-plan.md`

UI-21 must make the already durable Product theme and density preferences real
in the packaged Web/Desktop product through semantic tokens and canonical
`update-preferences` settlement. Do not add Renderer-local persistence, a theme
runtime, CSS-in-JS, a package, fake controls, or a second preference owner.

Phase UI-21 Appearance Truthfulness is complete. Its implementation and
verification evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1281-phase-ui-21-appearance-truthfulness-completion.md`

The Product Shell now truthfully projects the durable `theme` and `density`
preferences. Settings owns only the controls and canonical action dispatch;
Product remains the preference authority. Packaged Desktop proof records
`appearanceConfigured: true` after setup and `appearanceRestored: true` after
relaunch. Do not add Renderer persistence, a theme runtime, CSS-in-JS, a
package, or compatibility aliases for this behavior.

The post-UI-21 Product gap review selected Phase UI-22 TUI Provider Lifecycle
Management. Its frozen plan is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1282-post-phase-ui-21-product-gap-review-and-phase-ui-22-tui-provider-lifecycle-plan.md`

UI-22 must give the installed full-screen TUI post-first-use Provider list,
edit, active endpoint selection, removal, fallback, and blocked-state journeys
through the existing `@wanex/app` mutation authority. It must not add a TUI
write path, local credential state, package, schema, gateway, polling loop, or
compatibility alias. Web/Desktop must not receive a second Provider lifecycle
contract.

Phase UI-22 TUI Provider Lifecycle Management is complete. Its implementation
and installed distribution evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1283-phase-ui-22-tui-provider-lifecycle-completion.md`

The current TUI supports Provider list/add/credential rotation/model editing,
active endpoint selection, removal with fallback or blocked state, and
configured relaunch without process restart. Do not add another Provider
management contract or surface.

The post-UI-22 Product release-readiness review and next route are frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1284-post-phase-ui-22-product-release-readiness-review-and-phase-ui-23-plan.md`

The next route is Phase UI-23 Cross-Platform Product Release Readiness. It
must prove native/TUI journeys and immutable distribution receipts on
linux-x64, darwin-arm64, darwin-x64, and win32-x64. Configured Desktop targets
(darwin-arm64, darwin-x64, win32-x64) additionally prove Electron startup,
artifact footprint, native/keyring loading, shutdown, privacy, and `EPERM`
rename evidence; Linux remains an explicit headless native/TUI target until a
separate Linux Desktop contract is frozen. It must not add feature UI, package
layers, platform logic to Runtime/Storage/App, polling loops, or compatibility
aliases.

Phase UI-23 release-evidence implementation is complete locally and recorded
in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1285-phase-ui-23-cross-platform-release-readiness-completion.md`

The distribution workflow now runs the installed TUI proof on every target,
writes `target/distribution/tui/installed-proof.json`, includes TUI in the
host-distribution budget, and uploads the TUI receipts. POSIX targets require
the real PTY proof; Windows has an explicit line-mode-only contract because we
do not introduce a second native PTY harness solely for CI. The local
darwin-arm64 proof and host audit pass. The phase is not allowed to be called
cross-platform complete until the four CI target receipts are green; do not
infer Windows or Linux behavior from the local macOS receipt.

Phase UI-24 Web Visual Composition Reconstruction is complete. It is a
presentation-only correction over the existing Product Web surface: the
conversation reading axis and composer are aligned, the empty state is
centered, navigation and status controls have lower visual weight, and
light/dark/system themes have consistent surface hierarchy. It adds no
Product, Runtime, Storage, Protocol, App, Desktop, package, schema, or
compatibility surface. Its implementation and screenshot evidence are
recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1286-phase-ui-24-web-visual-composition-reconstruction-completion.md`

The next route is content-density acceptance across long text, code blocks,
tool timeline, approval, Resource/media, and recovery states at desktop and
narrow viewports. Do not continue arbitrary color tuning or add another UI
package before that review.

Phase UI-25 macOS Integrated Window Chrome is complete and recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1287-phase-ui-25-macos-integrated-window-chrome-completion.md`

Product Desktop uses `hiddenInset` on macOS so native traffic lights and the
existing Product session topbar form one immersive chrome. Desktop owns the
platform policy, Local Host carries the typed `integrated-macos` presentation
hint, and Web remains Electron-free. Standard browser documents omit the hint.
Do not reintroduce a native `Wanex` title row, User-Agent detection, URL flags,
preload/IPC solely for chrome, or self-drawn macOS window controls. Windows and
Linux retain standard chrome until separately planned and proven.

The DeepSeek Harness comparative review temporarily returns the route to
lower-layer correctness before further Product density work. The frozen
comparison and correction route are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1288-deepseek-harness-comparative-review-and-correction-route.md`

Phase 862 Provider Reasoning Replay Fidelity is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1289-phase-862-provider-reasoning-replay-fidelity-plan.md`

Phase 862 is complete. Its implementation and verification evidence are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1290-phase-862-provider-reasoning-replay-fidelity-completion.md`

Phase 863 Skill Observation Generations is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1291-phase-863-skill-observation-generations-plan.md`

Phase 863 is complete. Its implementation and verification evidence are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1292-phase-863-skill-observation-generations-completion.md`

Phase 864 Atomic Config Generations is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1293-phase-864-atomic-config-generations-plan.md`

Phase 864 is complete. Its implementation and verification evidence are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1294-phase-864-atomic-config-generations-completion.md`

Phase 865 Durable Projection Invariants is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1295-phase-865-durable-projection-invariants-plan.md`

Phase 865 is complete. Its implementation and verification evidence are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1296-phase-865-durable-projection-invariants-completion.md`

Phase 866 Stream And Compaction Evidence Review is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1297-phase-866-stream-and-compaction-evidence-review-plan.md`

Phase 866 is complete. Its implementation, verification, retained boundaries,
and the closure of the DeepSeek Harness comparison route are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1298-phase-866-stream-and-compaction-evidence-review-completion.md`

Do not add another DeepSeek-specific phase by default. The next Product route
returns to content-density acceptance for long text, code, Tool timeline,
approval, Resource/media, and recovery states. Freeze that route from current
Product evidence before changing UI code.

Phase UI-26 Conversation Content Density is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1299-phase-ui-26-conversation-content-density-plan.md`

Its production owner is `apps/web` presentation. Do not change lower Product,
Runtime, Storage, Protocol, or Desktop contracts for visual grouping, and do
not add a package or second Renderer merely to host visual fixtures.

Phase UI-26 is complete. Its implementation, focused verification, desktop and
narrow visual evidence, and best-practice review are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1300-phase-ui-26-conversation-content-density-completion.md`

Do not continue arbitrary color tuning. The next planning cycle must compare
safe human-readable Tool activity details with incremental long-Session history
loading and choose from current Product/Storage evidence.

That review selected Phase UI-27 Incremental Conversation History, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1301-post-ui-26-gap-review-and-phase-ui-27-incremental-conversation-history-plan.md`

UI-27 must implement real Storage keyset pagination over canonical per-Session
message sequence, preserve explicit App/Product page evidence, and make older
history demand-loaded in Web/Desktop. It must not fake pagination by slicing an
already unbounded array, add a transcript cache/authority, expose Storage
sequence in ordinary UI, or dump Tool input/result JSON without a Tool-owned
safe presentation contract.

Phase UI-27 is complete. Its bounded Storage/App/Product/Web implementation,
focused Rust and TypeScript verification, real 112-message Local Host desktop
and 390px scroll-anchor evidence, and best-practice review are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1302-phase-ui-27-incremental-conversation-history-completion.md`

Do not continue arbitrary history UI work. The next planning cycle must review
the nearest remaining installed-Product gap and explicitly compare safe Tool
activity presentation with any competing reliability or interaction defect.
Generic Tool input/result JSON remains forbidden: any user-visible detail must
come from a bounded, purpose-built, secret-safe contract owned by the Tool
descriptor/permission owner.

That review selected Phase UI-28 Tool Activity Presentation Contract, frozen
in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1303-post-ui-27-gap-review-and-phase-ui-28-tool-activity-presentation-plan.md`

UI-28 must persist UI-neutral, bounded Tool-owner call/result presentation at
the execution boundary and expose it through a narrow safe Storage projection.
App/Product/Web/TUI must never receive generic Tool input/result/descriptor or
run Tool-owned Renderer callbacks. The unpublished baseline becomes schema 9;
do not add a v8 compatibility migration or a second presentation registry.

Phase UI-28 is complete. Its durable execution evidence, safe bounded query,
Product presentation correction, focused verification, and real desktop/390px
privacy and layout evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1304-phase-ui-28-tool-activity-presentation-completion.md`

The final Product boundary exposes one current Tool `presentation`, not raw
call/result evidence. It deterministically merges call context with result
facts under the existing 16-detail bound, and Product removes correlated pure
Tool-result protocol rows that contain no remaining visible content. Do not
restore Renderer-local call/result selection, generic Tool JSON, empty `tool`
message rows, or Tool-specific Renderer registries.

The post-UI-28 review selected Phase UI-29 Truthful Tool Lifecycle, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1305-post-ui-28-gap-review-and-phase-ui-29-truthful-tool-lifecycle-plan.md`

UI-29 must carry the existing safe exact Tool execution state through App and
map it once into Product semantic state. It must retain state for Tools without
a presentation, delete the ambiguous Product `requested` state, and remove
Web substring-based state inference. It must not change schema 9, add polling,
copy approval/recovery actions into generic Tool rows, or expose lower
execution identities and retry/attempt details.

Phase UI-29 is complete. Its exact App state projection, exhaustive Product
semantic mapping, Web/TUI presentation, focused verification, and desktop/390px
non-spinning state evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1306-phase-ui-29-truthful-tool-lifecycle-completion.md`

The final Product Tool state union is `running | waiting | succeeded | failed |
cancelled | needs_attention`. Do not restore `requested`, Renderer substring
parsing, or the loss of activityless third-party Tool state. Only a truly
running Tool may use a spinner.

The post-UI-29 review selected Phase UI-30 Tool Failure Presentation, frozen
in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1307-post-ui-29-gap-review-and-phase-ui-30-tool-failure-presentation-plan.md`

UI-30 must let the Tool owner produce bounded failure presentation for thrown,
cancelled, and timed-out invocations through the existing durable activity
evidence. It must not expose raw exception/error/result data, add a schema or
Renderer registry, reinterpret declared failed results, or let presenter
failure alter the real Tool outcome.

Phase UI-30 is complete. Its Runtime contract, first-party Workspace Tool
presenters, fail-closed privacy evidence, focused verification, and
best-practice review are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1308-phase-ui-30-tool-failure-presentation-completion.md`

The final contract requires `presentFailure` to be paired with `presentCall`
and invokes it only after the Tool invocation actually starts. Invalid,
throwing, or oversized failure presentation is discarded and cannot alter the
durable failed/cancelled outcome. Declared failed Tool results still use only
`presentResult`. Do not project raw exception/error/result data, add a
failure-only compatibility path, or let Product/Renderer interpret arbitrary
Tool failures.

The post-UI-30 route audit selected Phase TEAM-1 Team Foundation Integrity
Reset, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1309-post-ui-30-team-route-audit-and-phase-team-1-foundation-integrity-reset-plan.md`

TEAM-1 must remove the misleading synchronous Team speaker loop,
`maxTurns`-only policy, `team.round.close` worker adapter, and authority-free
App diagnostic injection before Product integration. It directly replaces
`tl | free | hybrid` with `orchestrated | peer | hybrid`; no compatibility
alias is allowed. Preserve the durable conversation/participant/turn ledger,
delegation graph, `team.delivery` scheduler kind, and Team-round budget scope.
Do not make generic Product depend on `@wanex/team` or build group-chat UI over
the current foundation.

Phase TEAM-1 is complete. Its direct contract replacement, obsolete-loop
removal, generated wire/SDK cleanup, full affected-owner verification, and
best-practice review are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1310-phase-team-1-foundation-integrity-reset-completion.md`

The post-TEAM-1 replan selected Phase TEAM-2 Canonical Team Message Admission
And Routing Ledger, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1311-post-team-1-replan-and-phase-team-2-canonical-message-routing-ledger-plan.md`

TEAM-2 must directly replace unpublished `TeamTurn` with canonical durable
`TeamMessage`, persist explicit targets, and atomically write routing decision,
pending deliveries, message state/revision, and event evidence. It must not run
an Agent, materialize a scheduler job, implement discussion-round policy, add
a package, retain a TeamTurn compatibility facade, or connect generic Product
to `@wanex/team`. Delivery execution belongs to TEAM-3 only after TEAM-2 proves
the ledger and transaction invariants.

Phase TEAM-2 is complete. Its direct TeamMessage replacement, atomic routing
and delivery ledger, Channel projection update, rollback/idempotency evidence,
Rust owner split, and full affected-owner verification are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1312-phase-team-2-canonical-message-routing-ledger-completion.md`

The completed contract keeps admission separate from routing, requires an
exact message revision claim, and commits decision, pending deliveries,
message state/revision, and event evidence in one System Service transaction.
Do not reintroduce TeamTurn aliases, synchronous speaker loops, process-local
delivery ownership, or automatic Agent execution during message admission.

The post-TEAM-2 replan selected Phase TEAM-3 Delivery Materialization And
Exact Agent Session Binding, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1313-post-team-2-replan-and-phase-team-3-delivery-materialization-plan.md`

TEAM-3 must bind each local agent participant to one exact child agent session,
atomically create a `team.delivery` materialization outbox job with each routed
delivery, and convert a claimed delivery into a child input/turn/session-turn
job through the existing session transaction contract. `team.delivery` is a
short materialization command only; it must never run a Provider or Agent loop.
The child `session.turn` job remains the sole model execution lease. Generic
job completion must not bypass specialized delivery settlement, and Team
workers must use specialized fenced acknowledgement. Reply/pass/round policy
and Product UI remain TEAM-4/5 work.

Phase TEAM-3 is complete. Exact participant/session binding, atomic route
outbox creation, fenced child-turn materialization, response-loss replay,
retry/failure/cancellation synchronization, SQL fault-injection rollback, and
the full affected-owner verification are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1314-phase-team-3-delivery-materialization-completion.md`

The post-TEAM-3 review split the previously oversized next phase. Phase TEAM-4
Child Turn Outcome Outbox And Projection is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1315-post-team-3-replan-and-phase-team-4-child-outcome-projection-plan.md`

TEAM-4 must atomically enqueue a specialized outcome job when a linked child
`session.turn` reaches a real terminal state, then project it idempotently into
either one canonical reply TeamMessage or a failed/cancelled delivery fact.
It must not infer pass from text, empty output, stop reason, or failure; pass
and discussion-round policy move to TEAM-5, while Product group UX moves to
TEAM-6. Generic scheduler completion must not bypass specialized projection,
and no Team policy may enter Session Runtime.

Phase TEAM-4 is complete. Atomic child-terminal outcome outbox creation,
specialized reply/failure/cancellation projection, generic scheduler guards,
response-loss replay, worker failure synchronization, SQL fault-injection
rollback, internal owner split, and all affected release gates are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1316-phase-team-4-child-outcome-projection-completion.md`

The post-TEAM-4 review split participation decision from round policy. Phase
TEAM-5 Explicit Pass Decision Tool And Durable Projection is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1317-post-team-4-replan-and-phase-team-5-explicit-pass-decision-plan.md`

TEAM-5 must express pass only through one exact-delivery-bound first-party
`team_pass` Tool and validate its existing durable Tool execution evidence
during outcome projection. It must not infer pass from natural language, empty
assistant content, stop reason, error, or UI intent. Discussion-round closure
and fairness move to TEAM-6; Product group UX moves to TEAM-7.

Phase TEAM-5 is complete. The exact-bound first-party Tool, immutable
tool-snapshot validation, typed delivery provenance, forged/duplicate evidence
rejection, pass replay/rollback, terminal assistant lookup correction, and all
affected release gates are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1318-phase-team-5-explicit-pass-decision-completion.md`

Phase TEAM-6 Durable Discussion Round Closure And Fair Opportunity Policy is
frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1319-post-team-5-replan-and-phase-team-6-durable-discussion-round-plan.md`

TEAM-6 must create one finite round atomically with a deliver route, give each
snapshotted participant at most one delivery opportunity, and close the round
only when every delivery is terminal. It must not use max-speaker truncation,
automatically route replies, recurse into a free-chat loop, or let admission
callers choose internal round ids. Speaker selection, cross-round policy, and
Product UX remain outside this phase.

Phase TEAM-6 is complete. Route-owned round creation, exact participant
opportunity uniqueness, atomic terminal reconciliation, typed outcome counts,
stable read APIs, response-loss replay, closure fault rollback, cross-language
codecs, and all affected release gates are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1320-phase-team-6-durable-discussion-round-completion.md`

The post-TEAM-6 review split application composition from host execution and
renderer UX. Phase TEAM-7 Durable Team Application Command And Read Model
Composition is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1321-post-team-6-replan-and-phase-team-7-application-composition-plan.md`

The TEAM-7 implementation-entry audit found that composing the snapshot from
many list calls would create an N+1 remote-transport path and could not bound
participants. The corrected read-owner plan is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1322-phase-team-7-entry-audit-and-read-page-owner-correction.md`

TEAM-7 must compose admission plus exact routing as a recoverable idempotent
application command and expose one bounded, typed conversation page through a
single Team storage-owner read transaction. It
must not infer participants, open Storage from a renderer, start workers,
render group chat, or create another package. Local host execution composition
moves to TEAM-8 and Product group UX moves to TEAM-9.

Phase TEAM-7 is complete. Recoverable admission/route composition, one-
transaction bounded page reads, stable cursors, participant query batching,
cross-language codecs, exact RPC ownership, SDK reports, and all affected
release gates are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1323-phase-team-7-application-composition-completion.md`

The TEAM-7 completion review found that starting the two existing Team handlers
without the App's exact model/context/resource binding would create a working-
looking but incorrect host. Phase TEAM-8 Local Host Execution And Worker
Composition is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1324-post-team-7-replan-and-phase-team-8-local-host-execution-composition-plan.md`

TEAM-8 must use one scheduler lease system, an owner-derived child
materialization plan, the same App context resolver used by ordinary turns,
delivery-scoped `team_pass`, validated resource evidence, and explicit Local
Host lifecycle ownership. It must not use fake bindings, global Team tools,
renderer-supplied execution context, duplicate context resolution, arbitrary
Team MessagePart input, or separate process locks. Product/Web/Desktop group
UX remains TEAM-9.

Phase TEAM-8 is complete. Exact Rust-owned child plans, generic App binding
preparation, delivery-scoped context, one Team execution host, strict public
text/resource projection, trusted Local Host composition, reply/pass/modality
end-to-end journeys, route-after-exit recovery, lifecycle/wake evidence, and
all affected sequential release gates are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1325-phase-team-8-local-host-execution-composition-completion.md`

The post-TEAM-8 review selected Phase TEAM-9 Product Group Conversation
Journey, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1326-post-team-8-replan-and-phase-team-9-product-group-conversation-plan.md`

TEAM-9 must keep raw Team Runtime/Storage in Local Host, inject one optional
Product-owned Team port, directly replace parallel selection fields with a
discriminated session-or-team selection, deliver only finite peer rounds, and
drive Web/Desktop refresh through typed invalidation rather than renderer
polling. It must not preserve `selectedSessionId` as a compatibility state,
expose jobs/bindings/leases, fake TL/hybrid policy, add a package, or make
generic Product depend eagerly on `@wanex/team`. TEAM-9A starts with the state
contract correction before Team UI code.

This route may absorb provider-loop details, skill observation generations,
atomic config generations, and reconstruction invariants. It must not adopt an
everything-is-plugin kernel, micro-package each capability, replace durable
Wanex execution facts with JSONL, add compatibility aliases, or introduce a
new package solely to mirror DeepSeek Harness.

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

Phase 774 Cross-Platform And Distribution Gate is complete. Its frozen plan,
implementation record, and two unchanged-SHA native matrix reviews are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1037-phase-774-cross-platform-distribution-gate-plan.md`

Phase 775 First Public Release Candidate Audit is complete as a release No-Go.
Its evidence and corrected release route are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1038-phase-775-first-public-release-candidate-audit-and-replan.md`

Phase 776 Release Surface And Security Baseline is complete. Its implementation
and verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1039-phase-776-release-surface-security-baseline.md`

Commit `cf51542` passed GitHub Actions run `30172845259`, including the
four-platform Verify/distribution matrix, Linux JavaScript and Rust security
scans, and the Node 24 packed-core proof.

Phase 777 Native System Service npm Distribution is complete. Its frozen
implementation and final verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1040-phase-777-native-system-service-npm-distribution-plan.md`

Commit `1cbd40c1054a4aa6c80eaf11c98e23903f5a7080` passed GitHub Actions
run `30179550460`, including all four complete Verify jobs, the Node 24
packed-core proof, all four native npm distribution jobs, and all three desktop
Electron proofs. Each host passed four isolated external consumers with
automatic Runtime/App native resolution and no explicit binary path, source
checkout, Rust toolchain, downloader, postinstall, or bundled development
`node_modules`. The source topology remains exactly 18 packages.

Phase 778 owns license/version/metadata, trusted publishing, provenance, SBOM,
checksums, signing policy, and repository security. It is owner-gated: do not
start publication work, select a license, claim npm scope ownership, or replace
the current internal `0.0.0`/`UNLICENSED` metadata without explicit owner
decisions. Phase 779 remains the unchanged-SHA first RC acceptance gate.

The owner deferred Phase 778 and Phase 779 on 2026-07-26 to prioritize Product
functionality. Phase 780 Product Browser Interaction Integrity is complete. It
fixes the proven in-flight polling race and protects uncommitted form state
without changing polling transport, Kernel concepts, package topology, or
public release metadata. Its implementation and verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1042-phase-780-product-browser-interaction-integrity-plan.md`

Phase 781 Unconfigured Product And Trusted Provider Setup is complete. It
removed implicit production fake profiles from App, Product, local Web, generic
CLI, Product TUI, and Runtime convenience execution; established a truthful
zero-provider lifecycle; and retained only the trusted host's redacted
`secretRef` setup path. The implementation and final verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1043-phase-781-unconfigured-product-and-trusted-provider-setup.md`

Phase 782 Injected Credential Store And Product Onboarding is complete. It
adds a narrow injected `SecretStorePort`, confines the concrete OS keychain and
raw Provider setup input to the trusted local Product host, and protects every
loopback mutation with a per-launch host-session capability. Credentials and
secret references remain absent from Product read models, renderer snapshots,
logs, and SQLite values. Its implementation and verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1044-phase-782-injected-credential-store-and-product-onboarding.md`

Phase 783 Chat-First Product Journey And Information Architecture is complete.
It adds only the Product-level `startNewConversation` selection intent,
preserves first-message session creation and durable operation ownership, makes
chat the clear primary journey, and moves trusted local Provider setup between
onboarding and secondary placement using redacted readiness only. Its record
is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1045-phase-783-chat-first-product-journey-and-information-architecture.md`

Phase 784 Product Provider Presets And Safe Setup Input is complete. It directly
replaced the local browser's low-level raw-credential request with
trusted-host-owned standard Provider presets plus one explicit custom
compatible endpoint; standard endpoints cannot be overridden, custom endpoint
IDs are opaque and deterministic, and successful browser setup immediately
transitions to secondary Host chrome. It added no hidden/billable connection
probe, static model catalog, renderer secret API, schema, package, gateway, or
compatibility request shape. Its implementation and verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1046-phase-784-product-provider-presets-and-safe-setup-input.md`

Phase 785 Durable Session Lifecycle is complete. It closes the existing
title/active/archived data model through explicit rename, archive, and restore
commands; uses a monotonic Session revision rather than timestamps for
compare-and-swap; rejects archive while durable work is unfinished; separates
active and archived Product agent-conversation rows; and keeps selection
reconciliation in Product. It adds no delete, generic patch, model discovery,
desktop shell, package, gateway, second lock, compatibility shape, or schema
migration chain. Its implementation and verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1047-phase-785-durable-session-lifecycle.md`

The post-Phase-785 architecture and Product workflow audit is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1048-post-phase-785-product-workflow-roadmap-replan.md`

Phase 786 Product Canonical Conversation History And Submission Integrity is
complete. Product Web now renders the complete selected Session transcript
independently from current tracked-operation state; unsupported attachments fail
closed at picker, trusted-upload, and final-admission boundaries; and browser
drafts clear only after a durable found-operation receipt. The phase added no
package, Gateway, schema, clock, compatibility path, duplicate transcript, or
optional capability to the default Product. Its implementation and final
verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1049-phase-786-product-canonical-conversation-history-and-submission-integrity.md`

The post-Phase-786 correctness and Product delivery replan is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1050-post-phase-786-tool-ambiguity-and-product-streaming-replan.md`

Phase 787 Durable Tool Ambiguity And Reconciliation is complete. Tool results
now distinguish succeeded, failed, and ambiguous outcomes; System Service
atomically moves Tool/Turn domain records to recovery required while failing
and releasing the physical Scheduler Job; and fenced confirmation, bounded
idempotent retry, and abandon decisions prevent unsafe replay. Runtime appends
no fabricated Tool result and performs no Provider continuation on ambiguity.
The phase added no package, Gateway, compatibility result shape, callback-based
recovery authority, or schema migration chain. Its implementation and final
verification record is included in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1050-post-phase-786-tool-ambiguity-and-product-streaming-replan.md`

Phase 788 Product Recovery Review is complete. App projects bounded trusted
recovery evidence and exact fenced decisions; Product replaces trusted
execution and reconciliation identity with opaque references; Web provides
refresh-safe confirm, bounded retry, and abandon review while ordinary submit,
cancel, and regeneration remain disabled. The real acceptance path confirms an
ambiguous non-idempotent Tool without replay, resumes the same Turn, and
abandons a second Turn without another execution. Recovery authority remains
in System Service and execution remains in Runtime. The implementation,
package-internal structure correction, complete 56-scenario Eval, compiled SDK,
external-consumer, and governance evidence are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1051-phase-788-product-recovery-review.md`

Phase 789 Event-Driven Product Streaming is complete. Runtime emits only a
transport-neutral durable settlement invalidation; App and Product project it
through their existing trust boundaries; Product owns one bounded process-local
replay stream; and the trusted Local Host carries it over authenticated
fetch-SSE with bounded replay, queues, frame size, reconnect, and cleanup.
Browser deltas are transient, every reset/invalidation/uncertain cursor is
serialized through canonical Product reconciliation, and no permanent polling
fallback remains. The native keychain adapter is also isolated behind an
explicit Product Local subpath and is absent from default Electron staging.
The phase added no package, schema, Gateway, durable delta log, renderer
Storage access, compatibility transport, or second event authority. Its final
101-test Local suite, complete 56-scenario Eval, SDK, packaging, and governance
evidence is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1052-phase-789-event-driven-product-streaming.md`

Phase 790 Product Guided Follow-Up And Workflow Routing Integrity is complete.
System Service atomically validates the exact current Session head; App owns one
non-blocking workflow admission path; Product retains one trusted pending
reference and opaque guided command; Web exposes explicit queue-after-current
UX; and the real journey preserves current streaming, immutable per-Turn
Provider binding, exact promotion, provenance, and stale-reference rejection.
Duplicate Product workflow policy, blocking workflow admission, obsolete
result shapes, and dead Eval policy fixtures were deleted directly. The package
count remains 18 and no schema version, Gateway, Product queue, compatibility
alias, renderer Storage access, polling fallback, timer, lock, or second
execution authority was added. Its complete 57-scenario Eval, package, SDK,
Storage RPC, Rust, distribution, and residue evidence is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1053-phase-790-product-guided-follow-up-and-workflow-routing-integrity.md`

Phase 791 Product Ephemeral Side Query is complete. It reuses Runtime's
tool-free ephemeral execution, adds abort propagation only at the existing
Runtime/App request boundary, and gives Product one bounded process-local
start/read/cancel/dismiss coordinator. Web and TUI retain only opaque transient
identity and reconcile over the existing Surface/SSE invalidation path. The
question and answer never become a Session Turn, message, Job, Tool execution,
or durable record. The phase added no package, schema, Gateway, WebSocket,
polling fallback, endpoint, timer, lock, compatibility path, or second Provider
execution owner. Its complete 58-scenario Eval, 77-test Product suite, SDK,
Storage RPC, package, distribution, residue, and architecture evidence is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1054-post-phase-790-product-ephemeral-side-query-replan.md`

The post-Phase-791 architecture review is complete. It found that the old Plan
ledger lacked exact source/provider binding, revision CAS, and atomic execution
binding while duplicating canonical Turn/Job outcome in proposal state. The
frozen correction route is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1055-post-phase-791-plan-workflow-architecture-replan.md`

Phase 792 Durable Plan Contract Reconstruction And App Orchestration is
complete. It directly replaced the old ledger with decision-only
`open | approved | rejected | withdrawn` state, exact source and Provider
generation evidence, revision CAS, and one atomic approved-Plan plus Session
Turn admission transaction. Runtime remains Plan-unaware and exposes only
generic ephemeral evidence and prepared-Turn admission; App owns prompt,
structured-output, review, and execution orchestration; execution status is
projected only from canonical Input/Turn/Job. Exact retries return the existing
binding while conflicting execution identities fail closed. The package count
remains 18, all affected package/Rust/schema/SDK/distribution gates passed, and
no compatibility alias, migration chain, duplicate execution state, Gateway,
polling loop, timer, lock, or Product dependency was added. The implementation
and verification record is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1056-phase-792-durable-plan-contract-reconstruction.md`

Phase 793 Product Plan Review And Execution Journey is complete. It delivered
generation, canonical review, revision CAS, approved Turn admission, and shared
Web/TUI presentation without duplicating durable proposal or execution truth.
Its implementation and verification record is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1058-phase-793-product-plan-review-execution-journey.md`

Phase 794 Objective/Goal Contract Reconstruction is complete. It directly
replaced the unsafe generic ledger with one revisioned, Session-bound Objective
contract; atomic Objective-attempt plus Session-Turn admission; canonical
Turn/Job projection; strict verification evidence; bounded continuation;
settlement-aware cancellation; startup recovery; and a separate App Goal
invalidation channel. Runtime remains Objective/Goal-unaware. App owns Goal
policy and exposes trusted root commands; Product Goal UI remains absent. The
old Objective workflow export, mutable operation API, schema, SDK report, and
governance target were deleted without compatibility code. The package count
remains 18 and no polling loop, timer, Gateway, lock, Session kind, worker kind,
or second execution authority was added.

The frozen plan and completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1059-phase-794-objective-goal-contract-reconstruction-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1060-phase-794-objective-goal-contract-reconstruction.md`

The post-Phase-794 Pi and multimodal architecture review found lower
Turn/Tool, Provider modeling, capability routing, and Resource-bearing Tool
result blockers. The previous Product Goal candidate was never frozen and is
deferred until the corrected Provider/media route proves one real vertical
slice. The route through Phase 799 is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1061-post-phase-794-pi-multimodal-best-practice-replan.md`

Phase 795 Runtime Turn And Tool Integrity Closure is complete. Provider finish
evidence and assembled Tool content now obey a bidirectional invariant in both
the stream assembler and Runner side-effect boundary. Every Tool has mandatory
`parallel_safe | exclusive` evidence; consecutive safe groups use the existing
bound while exclusive calls form ordered barriers and results retain Provider
order. Mutating Tools cannot register as parallel-safe, unknown and MCP Tools
default to exclusive, and `parentTurnId` was deleted from source, SQL, schema,
generated RPC, SDK reports, and tests without compatibility code. The package
count remains 18 and all focused TypeScript, Rust, schema, SDK, residue, and
architecture gates passed. The completion record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1063-phase-795-runtime-turn-tool-integrity-closure.md`

Phase 796 Provider Connection, Protocol, And Model Reconstruction is complete.
It directly replaced Provider Profile with separate connection, open protocol,
model descriptor, selectable endpoint, and immutable endpoint execution
binding concepts. OpenAI and DeepSeek now share
`openai-chat-completions`; model behavior owns reasoning replay requirements;
App owns redacted endpoint persistence and active selection; and admitted Turns
freeze the complete endpoint. The old aliases, config keys, codecs,
`requestConfig`, and DeepSeek-specific adapter were deleted without a
compatibility path. The package graph remains 18 packages. The final gate
passed all package, schema/RPC, SDK/API, external-consumer, Rust, distribution,
residue, and architecture checks, including the complete `pnpm verify` and all
59 Eval scenarios. Its frozen plan and completion record are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1064-phase-796-provider-connection-protocol-model-reconstruction-plan.md`

Do not restore Provider Profile/kind aliases, old config keys, dual codecs, or
the DeepSeek-specific adapter class. Phase 797 Semantic Capability Routing And
Dynamic Tool Materialization is complete. Tools declare normalized semantic
requirements, App owns mutable route policy and process-local executor
readiness, and admitted Turns/media operations freeze complete endpoint
bindings. One executable candidate auto-resolves; multiple candidates require
selection; stale, ineligible, or unavailable configured routes fail closed;
and App media requests cannot select endpoints. Storage and System Service
strictly validate canonical route and media evidence, including digests. The
package graph remains 18 packages and the complete `pnpm verify` passed with
all 59 Eval scenarios. Its plan and completion record are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1065-phase-797-capability-routing-dynamic-tool-materialization-plan.md`

Do not add vendor inference, a second durable endpoint/capability registry,
App-level media endpoint selectors, compatibility request shapes, or mutable
route lookup for admitted execution. Phase 798 Resource-Bearing Tool Results
And Media Provenance is complete. It replaced scalar Tool results with ordered
bounded content, added invocation-scoped Resource publication and one
append-only provenance relation, made Tool/media settlement validate exact
Resource evidence, and added provider-native replay without durable bytes or
base64. Context compaction preserves Resource evidence, MCP embedded media uses
the same Tool Resource port, and recovery/reuse does not duplicate provenance.
The package graph remains 18 packages and the complete `pnpm verify` passed
with all 59 Eval scenarios. Its plan and completion record are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1066-phase-798-resource-bearing-tool-results-media-provenance-plan.md`

Do not restore scalar Tool `result`, `result_json`, transcript bytes/base64,
Tool access to unrestricted Storage, inferred provenance, provider-independent
binary Tool-result blocks, or compatibility request shapes. Resource remains
the immutable content-addressed object; causal occurrences belong to the one
append-only provenance relation. Phase 799 Durable Media Suspension And Wake
is complete. Its frozen plan, implementation, completion review, and
verification record are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1067-phase-799-durable-media-suspension-replan.md`

The previous provisional single-composer phase incorrectly assumed the media
Runtime already released worker leases. Phase 799 directly replaced the 100 ms
in-worker polling loop and checkpoint-only command with atomic durable
suspension, scheduled wake, restart-safe backoff, exact terminal poll evidence,
and correct accepted-operation cancellation. One worker activation now observes
at most one Provider poll; suspended operations own no lease or heartbeat;
restart never resubmits accepted work; and cancellation wakes the existing Job.
The schema baseline is 5, the package graph remains 18, and the complete
`pnpm verify` passed with all 59 Eval scenarios.

Phase 800 Single-Composer Image Generation is complete. Ordinary conversation
can select the standard `image_generate` Tool, durably suspend the current
physical Session/Tool attempts, release the Session lease, execute through the
single media Runtime, settle canonical Resource-bearing Tool content, and
resume the same logical Turn in a new physical Session attempt. Product performs
no media-intent inference. The first vertical slice permits one exclusive
deferred Tool call per Provider batch and rejects mixed or multiple deferred
calls before side effects. The unused `tool.deferred_result` scheduler kind was
deleted rather than implemented. The schema baseline is 6, the package graph
remains 18, and the complete `pnpm verify` passed with all 60 Eval scenarios.
The frozen route, implementation record, and final verification evidence are
in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1068-phase-800-single-composer-image-generation-replan.md`

Do not block a Session worker, use keyword intent heuristics, append a synthetic
user message, invent Product-only durable truth, add a second scheduler/worker
for deferred results, or add a compatibility API or migration ladder.

Phase 801 Trusted Generated Resource Preview is complete. It
projects the existing bounded Resource chunk read through the trusted App host,
assembles and verifies at most 25 MiB of allowlisted image content in Product
Local, and serves it through the existing per-launch authorized local Node host.
Product and its Surface remain reference-only; browser previews use temporary
Blob URLs and revoke them deterministically. Protocol, schema, System Service,
Storage RPC, Runtime Resource authority, and the 18-package graph remain
unchanged. The implementation also corrected an Eval lower-to-upper dependency
rather than widening the source-import allowlist. The complete `pnpm verify`
passed with all 60 Eval scenarios, 28 SDK entry points, and Rust 4 unit, 77
integration, and 6 CLI tests. The frozen route, implementation record, final
verification evidence, and completion review are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1069-phase-801-trusted-generated-resource-preview-plan.md`

Do not add renderer Storage access, inline bytes/base64, host credentials in
URLs, durable preview state, ResourceTicket redemption without a remote sharing
journey, a media server package, or video/audio Range behavior in Phase 801.

Phase 802 Hot-Configured OpenAI Image Generation is complete. It directly
replaced startup endpoint-owned media adapters with process-local protocol
adapters, made App capability executability derive from the current durable
endpoint catalog, added one bounded OpenAI Images executor, and lets Product
Local configure conversation plus optional image endpoints over one
connection-scoped credential without restart. Ordinary conversation can now
generate and preview exact image bytes through the Phase 800/801 path in the
same process. Packed consumers and Eval scenarios explicitly persist endpoints
after startup rather than attaching durable configuration to adapters. The
complete implementation, course corrections, acceptance evidence, and final
best-practice review are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1070-phase-802-hot-configured-openai-image-generation-plan.md`

Do not retain endpoint-owned adapter aliases, snapshot executable endpoint IDs,
infer media intent in Product, persist credential bytes, add a second endpoint
registry, or introduce a Provider SDK/package solely for Phase 802.

The final gate passed all 60 Eval scenarios, 29 compiled SDK entries and API
reports, all 4 packed external consumers, Rust formatting/tests/Clippy, and the
complete `pnpm verify`. Package count remains 18; Runtime/App static facade
input counts remain 256/451.

Phase 803 Trusted Capability Setup And Linked Continuation is complete. An
App-validated capability interaction is rendered by Product, Product Local
reuses an existing Host-managed OpenAI credential to configure and route image
generation, and Product starts one fresh linked Turn whose newly frozen Tool
snapshot generates and previews the requested image without restart. Product
history folds only the repeated regenerated user row while canonical Storage
retains both durable inputs. The frozen ownership, implementation record,
acceptance evidence, A2UI decision, and final best-practice review are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1071-phase-803-trusted-capability-setup-linked-continuation-plan.md`

The final gate passed all 61 Eval scenarios, 29 compiled SDK entries and API
reports, all 4 packed external consumers, Rust formatting/tests/Clippy, and the
complete `pnpm verify`. Package count remains 18; Runtime/App static facade
input counts remain 256/451 and their workspace package closures remain 3/4.
The reviewed App facade byte increase is limited to typed capability
projection, existing regeneration lineage, and the credential-redacted sibling
endpoint command.

Do not expose generic Tool JSON, parse transcript text in Product, send a
`secretRef` to a renderer, mutate an admitted Turn, model capability
continuation as guided follow-up or crash resume, duplicate the original user
bubble, introduce a private A2UI dialect, add a package/schema/registry, or add
compatibility aliases after Phase 803.

Phase 804 Product Goal Mode Journey is complete. It projects the existing Phase
794 App-owned Goal authority through Product, Web, and TUI; maps advisory Goal
invalidations through the existing Surface event stream; and keeps every
refresh canonical and event driven. Its ownership, implementation, acceptance
evidence, and completion review are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1072-phase-804-product-goal-mode-journey-plan.md`

Do not add a Product Goal coordinator or durable Goal copy, renderer Storage
access, polling/timers, a new Session/worker/scheduler kind, generic Tool
approval, a package/schema/Gateway, or compatibility behavior in Phase 804.

The final gate passed all 62 Eval scenarios, Product App/Web/TUI tests, Runtime
and Product Local tests, Rust formatting/tests/Clippy, all 29 SDK entries/API
reports, all 4 external SDK consumers, and the complete repository audits.
Package count remains 18, no schema changed, and Runtime/App static facade input
counts remain 256/451. The deterministic Goal journey proves stale-revision
rejection, pause/resume at a verification boundary, terminal independent
verification, ordinary durable Input/Turn/Job attempts, bounded ordered
invalidations, canonical Web/TUI agreement, and the absence of Product Goal
persistence.

Do not start a Phase 805 implementation by extending Goal Mode speculatively.
The next route requires a fresh post-Phase-804 architecture review.

The post-Phase-804 architecture review is complete. It found that the existing
`approval_required` Tool state is semantically false: Runtime persists it but
immediately emits a rejection Tool result and continues the Turn. The corrected
route is Phase 805 Durable Tool Approval Contract Reconstruction, followed by
Phase 806 Product Tool Approval Journey. The review and frozen Phase 805 plan
are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1073-post-phase-804-tool-approval-architecture-review.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1074-phase-805-durable-tool-approval-contract-reconstruction-plan.md`

Phase 805 must directly replace the old immediate-rejection behavior with
durable Tool/Turn/Job suspension, lease release, exact revision-fenced
approve-once or deny, restart-safe same-Turn resume, canonical denial, bounded
App SDK projection, and approval-wait cancellation. It adds no Product UI,
package, Gateway, polling loop, worker/scheduler kind, remembered allow policy,
compatibility alias, or migration ladder.

Phase 805 is complete. It directly replaced the false immediate-rejection
semantics and passed the complete repository gate: 63/63 Eval scenarios,
Runtime 254 tests plus 1 existing skip, Storage 71 tests, App 93 tests,
Product App 87 tests, MCP 2 tests, Rust 4 unit/77 integration/6 CLI tests,
Clippy, 29 SDK API reports, and 4 packed external SDK consumers. The existing
18-package topology remains unchanged. The lower contract now guarantees:

- approval-required Tool admission invokes no Tool effect and no further
  Provider call;
- Tool, Session attempt, Turn, and Job suspend atomically and release the
  lease;
- bounded App approval reads contain no raw Tool input or private evidence;
- approve-once or deny is revision-fenced, idempotent, restart-safe, and wakes
  the same Turn;
- approved execution invokes exactly once, denial invokes zero times and emits
  one canonical Tool result, and waiting cancellation prevents later approval;
- request-response MCP fails explicitly after durable suspension because it has
  no human continuation protocol;
- internal Registry preflight helpers are absent from compiled public API
  reports.

Phase 806 Product Tool Approval Journey is complete. It projects the Phase 805
App approval authority through Product, the shared Surface, Web, and TUI using
opaque approval identity, canonical reread, revision-fenced approve-once or
deny, and bounded secret-free presentation. Its implementation and complete
verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1075-phase-806-product-tool-approval-journey-plan.md`

The final gate passed all 64 Eval scenarios, Product App 88 tests, Product Web
40 tests, Product TUI 47 tests, Eval Harness 17 tests, Runtime 254 tests plus
one existing skip, Rust formatting/tests/Clippy, all 29 SDK API reports, all 4
packed external consumers, and the complete `pnpm verify`. The existing
18-package topology and schema remain unchanged; Runtime/App facade input and
package-closure counts remain 256/3 and 451/4.

Do not add a second approval authority, Product-owned Tool state, renderer
Storage access, raw Tool input projection, approval polling, a package,
Gateway, worker/scheduler kind, schema migration, or compatibility alias after
Phase 806.

Phase 807 Semantic Context Compaction Contract Reconstruction is complete. It
directly replaced placeholder/per-Part replacement compaction
with durable model-generated semantic checkpoints plus an exact recent Turn
tail. Canonical Session history remains unchanged; each Session has one active
epoch; complete Turn boundaries, frozen model/source/policy/request evidence,
and scheduler-lease fencing are mandatory. The frozen plan and completed
implementation record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1076-phase-807-semantic-context-compaction-contract-reconstruction-plan.md`

Do not restore `context_replacement`, `CloneContextEpoch`, `policyVersion`, a
fixed 32k model limit, placeholder truncation, generic scheduler Provider
retries, mutable-current-profile summary dispatch, or compatibility paths.

The final Phase 807 gate passed Runtime 250 tests plus one intentional skip,
Storage 70 tests, App 93 tests, CLI 25 tests, Eval Harness package 17 tests and
all 64 operational scenarios, Rust formatting/87 tests/Clippy, all 29 SDK API
reports, 4 deterministic SDK tarballs, 4 packed external consumers, and the
complete `pnpm verify`. Storage RPC ownership is 160/160 with the deleted
Context commands explicitly rejected. Runtime/App static facade closure remains
3/4 workspace packages; the reviewed baselines are 467,885 bytes / 255 inputs
and 1,325,899 bytes / 450 inputs. The existing 18-package topology remains
unchanged.

Phase 807 did not authorize a Phase 808 implementation. The required fresh
shortest-user-journey, ownership, package-closure, and executable acceptance
review has now completed below.

The post-Phase-807 long-session continuity review is complete. It found that
the Product path lacks truthful model limits, normal Host loops do not plan the
Phase 807 maintenance Job, and Turn-after maintenance cannot protect a large
next input or same-Turn Tool result. The corrected route is Phase 808 Model
Catalog And Context-Limit Fidelity Reconstruction, Phase 809 Inline
Pre-Dispatch Context Capacity Guard, then Phase 810 Product Long-Session
Continuity Evidence. The review and frozen Phase 808 plan are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1077-post-phase-807-long-session-continuity-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1078-phase-808-model-catalog-and-context-limit-fidelity-plan.md`

Phase 808 must directly replace ambiguous model-limit semantics with explicit
context/input/output facts; keep catalog resolution and refresh in the trusted
Product Local Host; use an attributed, versioned offline snapshot plus an
explicit bounded refresh cached through existing SQLite config; preserve
unknown metadata as unknown; and make Runtime Tool/parallel projection obey the
frozen model descriptor. It adds no package, schema table, startup/background
network fetch, Provider probe, arbitrary catalog URL, Gateway, worker, Job kind,
polling loop, guessed fallback limit, or compatibility alias.

Phase 808 Model Catalog And Context-Limit Fidelity Reconstruction is complete.
It replaced the ambiguous limit contract with independent context/input/output/
resource facts, added a generated attributed offline catalog plus explicit
bounded SQLite-backed refresh inside the trusted Product Local Host, preserved
unknown models conservatively, and made Tool schema/parallel projection obey
the frozen model descriptor. The completed plan, implementation record, gate
corrections, and final architecture review are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1078-phase-808-model-catalog-and-context-limit-fidelity-plan.md`

The final gate passed 972 TypeScript package tests plus one intentional Runtime
skip, Runtime 251, Product Local 128, Storage 70, App 93, Product App 88, CLI
25, Web 40, TUI 47, all 64 operational Eval scenarios, Rust formatting/87
tests/Clippy, all 29 SDK API reports, 4 deterministic SDK tarballs, 4 packed
external consumers, and the complete `pnpm verify`. The existing 18-package
topology and schema remain unchanged. Runtime/App static facade closure remains
3/4 workspace packages and 255/450 inputs; reviewed exact ceilings are 469,028
and 1,327,042 bytes.

Do not add catalog discovery to Protocol/Runtime/App, export the concrete
Product Local resolver, infer capabilities for unknown models, fetch at
startup, poll models.dev, accept renderer-selected catalog URLs/headers, mutate
existing endpoints during refresh, restore ambiguous limit semantics, or add
compatibility paths after Phase 808.

Phase 809 Inline Pre-Dispatch Context Capacity Guard is frozen and authorized
by the following plan:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1079-phase-809-inline-pre-dispatch-context-capacity-guard-plan.md`

It must freeze ordinary output tokens in the Turn execution binding, estimate
the complete replay/Tool/resource request before every Provider dispatch, and
reuse the existing Context Epoch state machine under the current session.turn
Job lease. It may compact only complete terminal Turns before the running Turn,
must rebuild and recheck once, and must fail structurally before ordinary
Provider invocation when safe capacity remains unavailable. Do not add a
memory Job, second lease/lock, current-Turn summary, transcript mutation,
fallback model window, Product enablement, package, schema table, polling loop,
Gateway, or compatibility binding.

Phase 809 Inline Pre-Dispatch Context Capacity Guard is complete. It freezes a
required output-token request in every Turn execution binding, checks the exact
replay/Tool/resource/output-reserve projection before every ordinary Provider
dispatch, and performs at most one semantic compaction under the current
`session.turn` Job lease before rebuilding and rechecking. The maintenance and
inline paths share one durable Context Epoch executor; the Rust mutation
authority accepts only matching-Session `memory.compaction` or `session.turn`
leases. Unknown limits remain unknown, known overflow fails before dispatch,
the current Turn is never summarized, and canonical user input remains visible.
The completed implementation and verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1079-phase-809-inline-pre-dispatch-context-capacity-guard-plan.md`

The final gate passed 980 TypeScript package tests plus one intentional Runtime
skip, Runtime 259 tests, Rust formatting/87 tests/Clippy, all 29 SDK API
reports, four deterministic SDK tarballs, four packed external consumers, all
64 operational Eval scenarios, and the complete `pnpm verify`. The package
graph remains 18 packages and the existing 20 structure warnings did not grow.
Runtime/App facade closure remains 3/4 workspace packages; reviewed exact
ceilings are 479,645 bytes / 260 inputs and 1,337,659 bytes / 455 inputs. The
shared executor, recovery error, forced-planning flag, and emergency input
ceiling are internal implementation details and are not public SDK contracts.

Do not bypass the guard in a Product path, add guessed context limits, make the
completion binding optional, restore separate Context Epoch state machines,
summarize the running Turn, or add a second Job/lease/lock after Phase 809.

Phase 810 Product Long-Session Continuity Evidence is complete. The existing
Runtime inline guard now produces a Protocol-owned bounded durable capacity
failure; App validates and redacts it; Product, Web, and TUI keep the failed
user input visible and recover through the existing explicit model selection
and regeneration commands. The completed plan, implementation record, and
post-implementation architecture review are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1080-phase-810-product-long-session-continuity-evidence-plan.md`

The final gate passed 994 TypeScript package tests plus one intentional Runtime
skip, all 65 operational Eval scenarios, Rust formatting/87 tests/Clippy, all
29 SDK API reports, four deterministic SDK tarballs, four packed external
consumers, and the complete `pnpm verify`. The package graph remains 18
packages and the existing 20 structure warnings did not grow. Runtime/App
facade closure remains three/four workspace packages; reviewed exact ceilings
are 481,018 bytes / 261 inputs and 1,343,022 bytes / 457 inputs. Runtime Context
Epoch executors and recovery controls remain absent from public SDK reports.

Do not add a second estimator, memory subsystem, automatic fallback, hidden
retry, current-Turn summary, Product persistence, schema version/table, Job
kind, lease/lock, timer, polling loop, Gateway, Runtime public executor, or
compatibility decoder after Phase 810.

The post-Phase-810 architecture replan rejected more Kernel surface and selected
the missing installed desktop journey. The frozen review, Phase 811 plan, and
completed implementation record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1081-post-phase-810-desktop-product-architecture-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1082-phase-811-product-desktop-vertical-slice-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1083-phase-811-product-desktop-vertical-slice-implementation.md`

Phase 811 Product Desktop Vertical Slice is complete. One private
`@wanex/desktop` leaf owns the Electron process, exact-origin
BrowserWindow policy, Product Local lifecycle, native-resource verification,
packaging, and packaged proof. It loads the real Product Web UI and directly
replaces the old synthetic Electron fixture. Its source manifest has one
workspace dependency, `@wanex/local-host`; Electron does not enter
Product Local/Web/App/Runtime. The bundled ASAR contains exactly `main.cjs` and
`package.json`; the package has no application `node_modules`, preload, generic
IPC, or `app.asar.unpacked` tree.

The local `darwin-arm64` packaged proof passed one cold and four warm launches,
real DOM conversation settlement, target keyring loading, nonblank screenshot,
immutable native-resource checks, and process cleanup. The package graph is 19
packages with 65 workspace dependency edges and zero governance failures.
Runtime/App facade closures remain three/four workspace packages at 481,018
bytes / 261 inputs and 1,343,022 bytes / 457 inputs. The complete repository
gate passes 1,008 TypeScript package tests plus one intentional Runtime skip,
Rust formatting/87 tests/Clippy, all 65 Eval scenarios, 29 SDK API reports, four
deterministic SDK tarballs, and four packed external consumers.

Do not add Electron to Product Local/Web/App/Runtime, restore a synthetic
renderer or duplicate desktop build, introduce preload/general IPC without an
actual OS capability, add a Gateway/fixed port/daemon/restart loop, or treat
stale pre-Phase-811 cross-platform receipts as current Product Desktop evidence.
Fresh `darwin-x64` and `win32-x64` package evidence belongs to the existing CI
matrix and must not be replaced by speculative budget relaxation.

Phase 811 closes the desktop vertical-slice route. No Phase 812 implementation
was authorized until a fresh shortest-user-journey, ownership, package-closure,
and executable-acceptance replan was documented.

That replan and the frozen Phase 812 route are now:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1084-post-phase-811-product-interaction-architecture-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1085-phase-812-conversation-composer-and-workflow-disclosure-plan.md`

The completed Phase 812 implementation and verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1086-phase-812-conversation-composer-and-workflow-disclosure-implementation.md`

Phase 812 Conversation Composer And Workflow Disclosure is complete. Chat now
renders one canonical transcript and one primary compose dock. Idle Goal, Plan,
and Side Query workflows are mutually exclusive native disclosures; active or
result state opens contextually. Session selection remains direct while
rename/archive/restore are secondary disclosures. Successful Operation and
ready Provider detail no longer duplicate ordinary chat, but blocked, failed,
and attention state remains visible. Text-only models no longer render a
disabled file picker.

Disclosure continuity is browser-local and is restored only while its
authoritative workflow/session state is unchanged. It did not become Product,
App, Runtime, Protocol, Storage, schema, or event state. No package, public SDK
entry, workspace edge, renderer framework, Gateway, timer, lock, polling
fallback, compatibility path, or lower contract was added. The package graph
remains 19 packages and 65 workspace dependency edges; the same 20 structure
warnings remain.

The complete `pnpm verify` passes approximately 1,010 TypeScript package tests
plus one intentional Runtime skip, Rust formatting/87 tests/Clippy, all 65 Eval
scenarios, 29 SDK API reports, four deterministic SDK tarballs, and four packed
external consumers. Packaged Desktop proof passed five launches with the latest
assistant response, primary composer, and collapsed idle workflows visible; it
found no EPERM rename evidence and left no owned process. The ASAR remains two
entries / 2,164,282 bytes with no application `node_modules` or
`app.asar.unpacked` tree. A 390 x 844 browser pass had no horizontal overflow
or overlapping workflow/composer controls.

The post-Phase-812 replan, frozen Phase 813 plan, and completed implementation
record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1087-post-phase-812-structured-conversation-fidelity-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1088-phase-813-structured-conversation-timeline-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1089-phase-813-structured-conversation-timeline-completion.md`

Phase 813 Structured Conversation Timeline And Safe Rich Text is complete. It
directly replaced Product conversation rows' lossy `text + resources` shape
with ordered redacted text, visible reasoning, Tool activity, and Resource
Parts shared by canonical history and tracked-operation projection. Web owns a
private safe CommonMark renderer, keeps transient streaming escaped, disables
raw HTML, dangerous protocols, and Markdown images, and preserves existing
trusted Resource preview behavior. TUI, Local, and Eval consume the typed Parts
without restoring compatibility fields.

The real 390 x 844 browser gate now contains a 1,570-pixel code line inside its
own scroll area with document scroll width equal to client width and no
transcript/workflow/composer overlap. The final packaged Desktop proof passed
five launches with rich H1/code, one composer, nonblank screenshots, no EPERM
rename evidence, and no owned process after exit. Its ASAR remains two entries /
2,353,093 bytes with no application `node_modules` or `app.asar.unpacked` tree.

The complete `pnpm verify` passes 1,013 TypeScript package tests plus one
intentional Runtime skip, all 65 Eval scenarios, Rust formatting/87 total
tests/Clippy, 29 SDK API reports, four deterministic tarballs, and four packed
external consumers. The package graph remains 19 packages and 65 workspace
edges; the same 20 structure warnings remain. A public-contract failure removed
the new capability Eval's direct Web source import and replaced it with the
existing authenticated Product Local refresh boundary; no allowlist was added.

Do not restore flattened Product row fields, placeholder Tool/Resource strings,
raw Tool payload or execution identity, hidden reasoning, unsafe Markdown,
remote Markdown images, or the rejected Eval source import. Phase 813 closes
this route. The required fresh shortest-user-journey review is now frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1090-post-phase-813-product-chat-interaction-continuity-replan.md`

Phase 814 Product Chat Interaction Continuity is complete. Its frozen plan and
completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1091-phase-814-product-chat-interaction-continuity-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1092-phase-814-product-chat-interaction-continuity-completion.md`

Plain Enter now submits composition-safely, Shift+Enter remains multiline, and
accepted conversation actions express explicit follow intent. Browser-local
document and nested transcript scroll positions are tracked independently, so
long chats follow the latest assistant while upward reading remains stable.
Primary chat no longer exposes opaque Operation text, manual refresh, or
duplicate Workbench navigation; narrow workflow summaries render in full.

The final packaged Desktop proof passes one cold and four warm launches with
keyboard admission, latest assistant/composer visibility, nonblank screenshots,
no EPERM rename evidence, and no owned process. Complete `pnpm verify` passes
1,022 TypeScript package tests plus one intentional Runtime skip, all 65 Eval
scenarios, Rust formatting/87 tests/Clippy, 29 SDK API reports, four
deterministic tarballs, and four packed external consumers. The package graph
remains 19 packages and 65 workspace edges; the same 20 structure warnings
remain. No package, dependency, public contract, lower concept, schema, event,
Job, worker, timer, polling fallback, Gateway, preload, or IPC was added.

Phase 815 Conversation Model Selection Integrity is complete. Its governing
review, frozen plan, and completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1093-post-phase-814-conversation-model-selection-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1094-phase-815-conversation-model-selection-integrity-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1095-phase-815-conversation-model-selection-integrity-completion.md`

App owns the mutable default conversation endpoint for future Turns. Runtime
owns final conversation-capability validation before admission and immutable
per-Turn endpoint binding. Product/Web may present redacted ready choices and
submit the existing selection intent, but must not construct execution policy,
persist a competing selection, or override an admitted Turn. Media-only
endpoints remain available to capability routes and tools but cannot become
conversation defaults.

The packaged Desktop proof switches between two fake conversation endpoints
through the real selector, preserves the draft across canonical replacement,
submits through a real KeyboardEvent, and requires the second model's canonical
response. Complete verification passes 1,026 TypeScript tests plus one
intentional Runtime skip, all 65 Eval scenarios, Rust and SDK gates, five
packaged launches, and responsive browser geometry at 390 x 844 and 1280 x 800.
No package, dependency, public concept, schema, event, worker, timer, Gateway,
preload, IPC, or compatibility path was added.

Phase 816 Product First-Viewport Chat Readiness is complete. Its governing
review, frozen plan, and completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1096-post-phase-815-product-first-viewport-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1097-phase-816-product-first-viewport-chat-readiness-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1098-phase-816-product-first-viewport-chat-readiness-completion.md`

Product Web now models Header, navigation, and Workspace as three explicit
rows, bounds desktop Chat history inside the conversation, keeps the complete
composer in the first viewport, and presents conversation before Chats on
narrow screens. At Phase 816 completion, Product Local owned the trusted
Provider-setup chrome and an outer `auto minmax(0, 1fr)` Host grid. Phase 817
directly supersedes that outer-grid composition while preserving the same Host
ownership; do not move raw Provider setup into Product Web or lower layers.

The final real-browser gate passes 390 x 844 and 1280 x 720 with complete
composer containment and no horizontal overflow. The packaged Desktop proof
passes one cold and four warm launches over growing durable history, with a
1280 x 768 content viewport, 48px navigation, full surface/composer
containment, exact model selection, preserved draft, KeyboardEvent submission,
nonblank screenshots, no EPERM rename evidence, and no owned process. Complete
`pnpm verify` passes 1,026 TypeScript package tests plus one intentional Runtime
skip, all 65 Eval scenarios, Rust formatting/87 tests/Clippy, SDK consumers,
and distribution gates. The graph remains 19 packages / 65 edges with the same
20 structure warnings.

Do not restore `auto 1fr`, document-level desktop Chat history growth,
intersection-only composer proof, runtime viewport measurement, or a second
Host stylesheet endpoint. Phase 816 added no package, dependency, public
contract, lower concept, schema, event, Job, worker, timer, polling path,
Gateway, preload, IPC, or compatibility path.

Before any later phase, repeat the shortest-user-journey review; do not infer
it from remaining large files, existing structure warnings, or feature lists.

Phase 817 Trusted Provider Setup Product Integration is complete. Its review,
frozen plan, and completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1099-post-phase-816-trusted-provider-setup-integration-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1100-phase-817-trusted-provider-setup-product-integration-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1101-phase-817-trusted-provider-setup-product-integration-completion.md`

Product Local now owns one explicit trusted Provider chrome contract: missing
Provider readiness is bounded onboarding over an inert Product shell, while a
ready Product exposes a header-level `Provider settings` trigger and modal.
Open/close/Escape behavior, credential clearing, focus restoration, fixed-
source model-catalog refresh, and the successful required-to-secondary
transition remain Host-owned. Product Web still sees only redacted readiness
and endpoint selection; do not add raw setup input to Product actions or
snapshots.

The old top-level `Change provider` disclosure and its outer Host layout row
were deleted directly. Do not restore
`data-wanex-provider-setup-secondary`, a secondary body grid, arbitrary Host
HTML slots, compatibility chrome, or a second renderer transport. Complete
`pnpm verify` passes 1,027 TypeScript tests plus one intentional skip, all 65
Eval scenarios, Rust formatting/87 tests/Clippy, SDK and distribution gates.
The packaged Desktop proof passes one cold and four warm launches with the
Product surface beginning at viewport top, the settings trigger fully visible,
the dialog initially closed, and all existing conversation geometry and
privacy evidence preserved. Topology remains 19 packages / 65 edges with the
same 20 structure warnings.

Before any later phase, repeat the shortest-user-journey review; do not infer
it from remaining large files, existing structure warnings, or feature lists.

Phase 818 Product Chat-First Progressive Disclosure is complete. Its review,
frozen plan, and completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1102-post-phase-817-chat-first-product-journey-replan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1103-phase-818-product-chat-first-progressive-disclosure-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1104-phase-818-product-chat-first-progressive-disclosure-completion.md`

Ordinary Chat now renders one compact `More` disclosure for inactive Goal and
Plan creation. Existing Goal or Plan state renders directly, and `Ask aside`
appears only during an active conversation window or while a non-idle side
query needs attention. Product Web derives this composition entirely from the
existing canonical snapshot and stores no competing workflow state.

Do not restore three permanent idle Goal/Plan/Ask-aside cards, expose idle Ask
aside after a terminal response, persist workflow disclosure as Product state,
or move workflow ownership into Product Local/Desktop. Complete `pnpm verify`
passes 1,027 TypeScript tests plus one intentional skip, all 65 Eval scenarios,
Rust formatting/87 tests/Clippy, SDK and distribution gates. The packaged
Desktop proof passes one cold and four warm launches with exact one-entry
chat-first disclosure, complete composer containment, and all prior privacy and
shutdown evidence. Topology remains 19 packages / 65 edges with the same 20
structure warnings.

Before any later phase, repeat the shortest-user-journey review; do not infer
it from remaining large files, existing structure warnings, or feature lists.

Phase 819 Conversation Identity And Navigation Integrity is complete. Its
review, frozen plan, and completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1105-post-phase-818-conversation-identity-review.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1106-phase-819-conversation-identity-and-navigation-integrity-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1107-phase-819-conversation-identity-and-navigation-integrity-completion.md`

Runtime derives automatic Session identity only when first-message admission
creates a Session without an explicit title. It uses one bounded meaningful
line and never rewrites the admitted message. Explicit titles and revision-
fenced manual renames remain canonical and do not pass through automatic
derivation. Product Web may constrain that canonical title to one ellipsized
navigation line but must not create, persist, or submit a second display title.

Do not restore whole-message whitespace collapse as automatic Session title,
add a hidden model-generated title operation, normalize explicit/manual titles
through the automatic rule, or truncate canonical title data in a renderer.
The packaged Desktop proof must preserve exact selected/listed title together
with complete rich first-message content.

Before any later phase, repeat the shortest-user-journey review; do not infer
it from remaining large files, existing structure warnings, or feature lists.

Phases 820 and 821 are complete. Session lifecycle actions now use one
accessible row-owned disclosure, and the Chats heading and native `New chat`
command share one compact semantic navigation header. Their completion records
are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1111-phase-820-session-navigation-action-ergonomics-completion.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1114-phase-821-chat-navigation-header-density-completion.md`

Do not restore permanent Session action rows, duplicate the new-conversation
command, reverse conversation-first narrow ordering, or introduce custom
popover state for these controls.

Phase 822 Conversation Timeline And Composer Space Allocation is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1116-phase-822-conversation-timeline-and-composer-space-allocation-plan.md`

It must leave exactly one desktop vertical conversation scroll owner, preserve
tail-follow and upward-reading restoration, and use a compact native-resizable
composer without persisted layout state, auto-grow measurement, or lower-layer
changes.

Phase 822 is complete. Its final installed-product and repository evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1117-phase-822-conversation-timeline-and-composer-space-allocation-completion.md`

Do not restore transcript scroll ownership, transcript-specific replacement
state, the 108-pixel default conversation textarea, or a second conversation
scroll container.

Phase 823 Session Navigation State Truth is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1119-phase-823-session-navigation-state-truth-plan.md`

It must remove the misleading visible `kind + status` Session subtitle while
retaining canonical lifecycle data and machine evidence. Do not replace it with
renderer-owned `ready`, `idle`, `complete`, presence, or activity state.

Phase 823 is complete. Its final browser, packaged-product, and repository
evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1120-phase-823-session-navigation-state-truth-completion.md`

Phase 824 Canonical Snapshot / Stream Cursor Handoff is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1122-phase-824-canonical-snapshot-stream-cursor-handoff-plan.md`

It must continue the SSE stream strictly after the canonical snapshot's
existing event position, suppress only already covered verified frames, and
preserve later streaming and fail-closed reconciliation. Do not infer delta
freshness from text or operation state, add timers/polling, or create a second
event cursor authority.

Phase 824 is complete. Its final browser, packaged-product, repository, and
architecture evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1123-phase-824-canonical-snapshot-stream-cursor-handoff-completion.md`

Phase 825 Conversation Timeline Semantic Presentation is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1125-phase-825-conversation-timeline-semantic-presentation-plan.md`

It must retain exact canonical `data-role` and status evidence while presenting
user and assistant rows with human labels and distinct, non-nested reading
hierarchy. Do not invent Agent identity/model attribution, hide Tool or Resource
evidence, add a message component package, or change lower contracts.

Phase 825 is complete. Its final browser, packaged-product, repository, and
architecture evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1126-phase-825-conversation-timeline-semantic-presentation-completion.md`

Phase 826 Composer Command Hierarchy is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1128-phase-826-composer-command-hierarchy-plan.md`

It must make message composition the primary dock task while keeping model and
optional workflows available in one support toolbar. Do not change keyboard,
attachment, workflow, operation, endpoint, or lower contracts; do not add UI
state, a renderer dependency, or a component package.

Phase 826 is complete. Its final product, repository, and architecture evidence
is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1129-phase-826-composer-command-hierarchy-completion.md`

Phase 827 Product Web Render Ownership Split is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1131-phase-827-product-web-render-ownership-split-plan.md`

It must replace the monolithic HTML renderer with bounded package-internal
Session, Conversation, workflow, and shared endpoint modules while retaining
one public composition entry and exact behavior. Do not add a package, export
subpath, framework, dependency, compatibility alias, or second renderer owner.

Phase 827 is complete. Its final product, repository, and architecture evidence
is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1132-phase-827-product-web-render-ownership-split-completion.md`

Phase 828 Product Web Stylesheet Ownership Split is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1134-phase-828-product-web-stylesheet-ownership-split-plan.md`

It must split the monolithic stylesheet into bounded package-internal Shell,
Workspace, Conversation, feedback, and responsive owners while retaining one
public stylesheet asset and exact cascade behavior. Do not add a package,
export subpath, dependency, framework, compatibility path, second stylesheet
request, or duplicate rule owner.

Phase 828 is complete. Its final product, repository, and architecture evidence
is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1135-phase-828-product-web-stylesheet-ownership-split-completion.md`

Phase 829 Product Desktop Direct Development Start is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1137-phase-829-product-desktop-direct-development-start-plan.md`

It must provide one normal persistent Desktop start command over the existing
System Service, keychain artifact, Electron main, and Product Local lifecycle.
Do not enter proof/demo/fake-Provider behavior, add a package/dependency, alter
the Product contracts, or introduce a second lifecycle/restart owner.

Phase 829 is complete. Its direct-start, packaged-product, repository, and
architecture evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1138-phase-829-product-desktop-direct-development-start-completion.md`

Phase 830 First-Run Provider-To-Chat Product Integration is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1140-phase-830-first-run-provider-to-chat-product-integration-plan.md`

It must use one fresh unconfigured Product Local/Web instance to traverse the
existing authenticated Provider setup and first real protocol conversation.
Do not add a second setup API, renderer credential ownership, fake Runtime
shortcut, production proof flag, package, dependency, schema, or lifecycle.

Phase 830 is complete. Its integrated first-run, privacy, Product, Desktop, and
repository evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1141-phase-830-first-run-provider-to-chat-product-integration-completion.md`

Phase 831 Catalog-Guided Provider Model Selection is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1143-phase-831-catalog-guided-provider-model-selection-plan.md`

It must project bounded validated Product Local model IDs as advisory Host
suggestions while retaining manual exact input and custom-provider behavior.
Do not expose raw catalogs to Product Web/Renderer, accept arbitrary catalog
URLs, add a transport/package/dependency/schema, or reject catalog-absent IDs.

Phase 831 is complete. Its catalog, browser, packaged-product, repository, and
architecture evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1144-phase-831-catalog-guided-provider-model-selection-completion.md`

Phase 832 Provider Setup Atomic Commit And Recovery is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1146-phase-832-provider-setup-atomic-commit-recovery-plan.md`

It must make connected endpoint configuration one System Service transaction
and use a durable, secret-free Product Local intent to reconcile the external
Secret Store. Do not persist raw secrets, expose secret refs, let Product Local
write App endpoint config directly, imply cross-store ACID, or add a package,
transport, schema version, compatibility path, or second transaction owner.

Phase 832's immutable-binding credential-retirement correction is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1147-phase-832-immutable-binding-credential-retirement-correction.md`

Retired credentials must remain available while any non-settled durable Turn
or media-generation binding references them. Committed live refs move to a
bounded Product Local retirement backlog; they must not block later Provider
saves or be deleted merely because endpoint configuration changed.

Phase 832 is complete. Its atomic config, App endpoint-set, Secret Store
recovery, frozen-binding liveness, product proof, SDK, and repository evidence
is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1148-phase-832-provider-setup-atomic-commit-recovery-completion.md`

Phase 833 Configured Provider Lifecycle Management is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1150-phase-833-configured-provider-lifecycle-management-plan.md`

It must replace connected-endpoint upsert semantics with exact atomic
replacement/removal, clean invalid active/route references, and deliver actual
redacted Product Local/Web inspect-edit-remove flows. Do not retain a deprecated
alias, expose secret refs, revoke credentials from frozen executions, add a
Provider registry/package, or let Product Local write App endpoint config.

Phase 833 is complete. Its exact App graph replacement/removal, Product Local
credential lifecycle, authenticated Product Web management, packaged Desktop,
SDK, repository, and architecture evidence is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1151-phase-833-configured-provider-lifecycle-management-completion.md`

The post-Phase-833 installed-product review is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1152-post-phase-833-configured-provider-lifecycle-review.md`

Phase 834 Installed Provider Lifecycle Journey is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1153-phase-834-installed-provider-lifecycle-journey-plan.md`

It must prove Provider configure/edit/remove and immediate conversation use in
the existing packaged Electron product through the authenticated Local Host.
The fixture stays proof-only; do not add Renderer secret authority, direct
SQLite access, IPC mutation authority, a Gateway/restart manager, a package,
dependency, schema change, compatibility alias, or second lifecycle owner.

Phase 834 is complete. Its controlled Provider fixture, authenticated
configure/edit/remove DOM journey, edited-model and deterministic-fallback
conversations, no-restart evidence, secret cleanup, packaged Electron proof,
SDK consumers, and complete repository verification are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1154-phase-834-installed-provider-lifecycle-journey-completion.md`

The post-Phase-834 continuity review is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1155-post-phase-834-installed-provider-continuity-review.md`

Phase 835 Installed Provider Relaunch Continuity is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1156-phase-835-installed-provider-relaunch-continuity-plan.md`

It must prove one configured Provider survives a complete packaged Desktop
shutdown and same-profile reopen without passing the raw credential to the
second process, then prove trusted cleanup and a truthfully unconfigured final
reopen. Do not add a restart abstraction, Gateway, package, schema change,
Renderer keychain access, compatibility path, or second lifecycle owner.

Phase 835 is complete. Its same-profile four-process relaunch proof restored
Provider configuration through the real packaged keychain binding without
passing a credential to the reopen process, completed an authorized chat,
performed trusted cleanup, and proved a final blocked unconfigured reopen. The
implementation and full verification evidence are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1157-phase-835-installed-provider-relaunch-continuity-completion.md`

The post-Phase-835 conversation continuity review is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1158-post-phase-835-installed-conversation-continuity-review.md`

Phase 836 Installed Conversation Continuity is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1159-phase-836-installed-conversation-continuity-plan.md`

It must prove a conversation created before shutdown reappears from the
canonical Chat/session read model after same-profile reopen and accepts a
follow-up in the original Session. Do not add a transcript copy, Renderer
storage access, new IPC route, restart manager, package, schema change,
compatibility path, or second storage writer.

Phase 836 is complete. Its packaged configure process settled the initial
Chat, a separate credential-free process reopened the same canonical Session
and transcript and settled a follow-up under the original Session ID, and the
trusted cleanup/final blocked reopen remained intact. The implementation and
full repository verification evidence are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1160-phase-836-installed-conversation-continuity-completion.md`

The post-Phase-836 multimodal review is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1161-post-phase-836-installed-multimodal-review.md`

Phase 837 Installed Multimodal Attachment Journey is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1162-phase-837-installed-multimodal-attachment-journey-plan.md`

It must drive one real PNG through the packaged Product's file input,
authenticated trusted upload, preview/remove/re-add, resource-bearing
conversation, Provider projection, and canonical timeline. Capability must
come from a canonical model descriptor, never a model-name heuristic. Do not
add Renderer base64 persistence, direct filesystem paths, a duplicate Resource
owner, media Provider abstraction, package/schema change, compatibility path,
Gateway, or restart manager.

Phase 837 is complete. The trusted custom-Provider setup now supplies explicit
image-input capability to the canonical `ModelDescriptor`; standard presets
remain catalog-owned and custom endpoints remain text-only by default. The
packaged five-process same-profile proof rejects a PDF before Provider
dispatch while preserving the draft, uploads/previews/removes/re-adds a real
PNG, submits one Resource-bearing conversation, and renders its canonical
Resource and image preview. Only configuration receives the raw credential,
the controlled fixture retains no request body/base64/bytes, cleanup is exact,
and all 13 requests are authorized. The proof driver was split into one
package-private multimodal module, restoring the structure audit to 19
pre-existing warnings. Its implementation, packaging evidence, architecture
review, and complete verification record are in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1163-phase-837-installed-multimodal-attachment-journey-completion.md`

The post-Phase-837 installed generation review is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1164-post-phase-837-installed-generation-review.md`

Phase 838 Installed Single-Composer Image Generation is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1165-phase-838-installed-single-composer-image-generation-plan.md`

It must extend the same-profile packaged proof with one credential-free
process that submits an ordinary generation request, lets the conversation
model select the existing `image_generate` Tool, executes exactly one
controlled Images request through the durable media route, resumes the same
logical Turn, and renders correlated Tool success, one canonical generated
image, its trusted Blob preview, and the final response. Do not add Product
intent inference, media mode, a duplicate Tool/worker/Resource path, Renderer
bytes, retained fixture bodies/base64, package/schema/public API,
compatibility path, Gateway, or restart manager.

Phase 838 is complete. The implementation has reached its installed acceptance boundary. The
custom Provider setup now declares `tool_calling` explicitly for custom models
while standard presets remain catalog-owned. Resource IDs identify immutable
semantic snapshots rather than content bytes alone, so an uploaded image and
an equal-byte generated output have distinct IDs while sharing the same
SHA-256. The packaged six-process same-profile proof preserves the earlier
attachment, submits an ordinary composer request, executes exactly one
authorized Images call through `image_generate`, resumes the same Turn, and
renders the succeeded Tool, one newly correlated generated Resource, its
trusted Blob preview, and the final response. Only configuration receives the
credential; cleanup, final blocked reopen, immutable package resources, and
owned-process cleanup pass. Product Desktop has 23 tests passing, the full
repository Verify gate passes, and the implementation, correction, and
post-phase records are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1166-phase-838-custom-provider-tool-capability-correction.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1167-phase-838-resource-snapshot-identity-correction.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1168-phase-838-installed-generated-resource-correlation-correction.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1169-phase-838-installed-single-composer-image-generation-completion.md`

The post-Phase-838 installed composer review is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1170-post-phase-838-installed-composer-review.md`

Phase 839 Composer Paste/Drop Attachment Journey is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1171-phase-839-composer-paste-drop-attachment-journey-plan.md`

Phase 839 is complete. File input, screenshot paste, and file drag/drop now
share one trusted attachment upload function. Plain text paste and unrelated
page drops are not intercepted; failed uploads preserve the draft and revoke
temporary object URLs. The packaged multimodal process proves PDF rejection,
paste, removal, drop, same-Session submission, canonical Resource preview, no
EPERM rename, and no owned process residue. Product Local has 160 passing
tests, Product Desktop has 23, the structure audit remains at 19 warnings,
and the complete Verify gate passes. The completion record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1172-phase-839-composer-paste-drop-attachment-journey-completion.md`

The post-Phase-839 installed composer review is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1173-post-phase-839-installed-composer-review.md`

Phase 840 Installed Plan Review And Execution Journey is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1174-phase-840-installed-plan-review-execution-journey-plan.md`

Phase 840 is complete. The packaged seven-process same-profile journey now
drives strict read-only Plan generation, observes the open proposal before
execution, explicitly approves revision 1 into revision 2, and executes through
the canonical same-Session Turn. All 18 Provider requests are authorized, no
Plan execution occurs before approval, immutable resources remain unchanged,
and the complete Verify gate passes. The completion and post-phase review are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1176-phase-840-installed-plan-review-execution-journey-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1177-post-phase-840-installed-workflow-review.md`

Phase 841 Installed Goal Autonomous Completion Journey is complete. Its plan,
corrections, completion, and post-phase review are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1178-phase-841-installed-goal-autonomous-completion-journey-plan.md`

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1179-phase-841-goal-event-reconciliation-correction.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1180-phase-841-loopback-host-bounded-shutdown-correction.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1181-phase-841-installed-goal-autonomous-completion-journey-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1182-post-phase-841-installed-conversation-control-review.md`

Phase 842 Installed Cancel And Regenerate Journey is complete. The Product
proves cancellation after transient output, no partial assistant commit, and
fresh same-Session regeneration through nine packaged same-profile processes
and 24 authorized Provider requests. Runtime honors exact durable cancellation
or interruption after partial output without automatic replay, while unconfirmed
partial failure remains recovery-required. Two independent packaged proofs and
the complete Verify gate pass. Records:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1183-phase-842-installed-cancel-regenerate-journey-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1184-phase-842-desktop-proof-script-owner-correction.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1185-phase-842-confirmed-cancel-after-partial-output-correction.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1186-phase-842-installed-proof-row-identity-correction.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1187-phase-842-installed-cancel-regenerate-journey-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1188-post-phase-842-installed-conversation-guidance-review.md`

Phase 843 Installed Guided Follow-Up Journey is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1189-phase-843-installed-guided-follow-up-journey-plan.md`

It must prove one visible queue-after-current instruction preserves the active
parent, waits for parent settlement, promotes one fresh child operation, and
completes in the same Session. Desktop must not become a queue, steering,
operation, or execution authority.

Phase 843 is complete. The packaged Product proves one visible
queue-after-current follow-up after a transient parent delta, canonical pending
state, unchanged active parent identity, normal parent completion, exact child
promotion, and fresh same-Session child completion. Two independent complete
proofs each passed ten same-profile packaged processes and 26 authorized
Provider requests; only configuration received the raw credential. The phase
added no production concept, package, schema, endpoint, timer, polling route,
Gateway, browser queue, or compatibility path. Records:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1190-phase-843-installed-guided-follow-up-journey-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1191-post-phase-843-installed-ephemeral-workflow-review.md`

Phase 844 Installed Ephemeral Side Query Journey is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1192-phase-844-installed-ephemeral-side-query-journey-plan.md`

It must prove one visible, tool-free, read-only side question while a parent
Turn remains active, keep its answer out of canonical history, dismiss the
ephemeral result, and then complete the unchanged parent in the same Session.

Phase 844 is complete. The packaged Product proves one visible Side Query runs
tool-free against frozen selected context while a parent Turn remains active,
renders and dismisses its process-local answer without changing canonical
history, and then completes the unchanged parent normally in the same Session.
Two independent complete proofs each passed eleven same-profile packaged
processes and 28 authorized Provider requests; only configuration received the
raw credential. The phase added no package, schema, endpoint, timer, polling
route, Gateway, durable query state, browser execution authority, or
compatibility path. Records:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1193-phase-844-installed-ephemeral-side-query-journey-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1194-post-phase-844-installed-product-review.md`

Phase 845 Product Same-Turn Steering Journey is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1195-phase-845-product-same-turn-steering-journey-plan.md`

Phase 845 is complete. It projects the existing durable exact-attempt
same-Turn steering contract through Product, Web, Local, and TUI. Product now
requires a trusted surface `requestId`, rejects renderer-supplied lower
identities, derives deterministic idempotency from the surface request and
trusted operation identity, preserves drafts until durable acceptance, and
projects pending guidance without exposing attempts, controls, jobs, or
leases. Runtime remains the safe-checkpoint promotion authority. The final
`WANEX_TEST_CONCURRENCY=2 pnpm verify` gate passed, including 66 Eval
scenarios. Completion evidence is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1196-phase-845-product-same-turn-steering-journey-completion.md`

The post-phase review is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1197-post-phase-845-renderer-architecture-review.md`

The next route is Product Renderer Reset: a real React Web vertical slice, a
Pi TUI renderer proof against the same Product Surface, and an evidence-based
decision on external Pi rendering versus a Wanex-owned MIT fork. Do not split
more packages or add renderer-specific Product features before that review.

The route and Phase 846 executable plan are frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1198-product-renderer-reset-roadmap-and-phase-846-plan.md`

Phase 846 keeps React inside the existing Product Web package. Phase 847 must
make it the only Web/Electron renderer and delete the old HTML assembler,
imperative browser script, and temporary dual route. Phase 848 then proves Pi
TUI against the same Surface and selects one production TUI strategy. A
Wanex-owned fork is allowed only when control, lifecycle, licensing, or
platform evidence justifies its roughly twelve-thousand-line engine surface.

Phase 846 is complete. It delivered the React vertical slice, deterministic
local browser asset, typed HTTP/SSE renderer client, interaction tests, and
real desktop/mobile browser proof without changing Product, Runtime, Storage,
schema, or package ownership. Browser QA found and corrected invalidation
request amplification: canonical refresh is single-flight with one trailing
coalesced read, same-stream cursors never regress, covered events are ignored,
and no polling fallback exists. The full Verify gate passed all 66 Eval
scenarios. Completion evidence and the frozen next plan are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1199-phase-846-react-renderer-vertical-slice-completion.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1200-post-phase-846-react-cutover-review-and-phase-847-plan.md`

Phase 847's renderer and trusted-host cutover is complete. The
sole React renderer now sends typed `ProductAppWebAction` values through one
authenticated `dispatchAction` operation; Product Surface remains the complete
payload validation and execution authority. The retired form fields, generated
field codec, parser wrapper, `submitActionInput`, and `submitResult` vocabulary
are deleted with no alias or dual decoder. The installed Desktop proof passes
Plan approval/execution, Goal continuation, Provider cleanup, and unconfigured
relaunch. Provider-blocked composition intentionally remains draft-editable
while canonical Product readiness disables Send and prevents request dispatch.
Focused Web, Local, Desktop, Eval, and installed-product gates pass. The final
repository gate passed all 66 Eval scenarios after correcting one Eval-only
reader of the deleted `document.snapshot` wrapper. Completion evidence is in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1202-phase-847-react-cutover-and-legacy-renderer-deletion-completion.md`

Phase 848 Pi TUI Renderer Proof And Ownership Decision is complete. Its frozen
plan and completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1203-phase-848-pi-tui-renderer-proof-and-ownership-decision-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1204-phase-848-pi-tui-renderer-proof-and-ownership-decision-completion.md`

The existing private `@wanex/tui` package now contains a real
full-screen Product renderer over the published official
`@earendil-works/pi-tui@0.83.0` engine. Multiline/CJK input, paste, resize,
stream reconciliation, Tool approval focus, Stop, Queue, Guide, lifecycle
cleanup, package closure, startup/update measurements, a real macOS PTY, all 55
TUI tests, and the complete repository Verify gate pass. No Pi source, package,
Kernel concept, schema, polling path, or lower execution identity was added.

The production ownership decision is the external Pi dependency. A Wanex-owned
MIT fork is permitted only after a required executable acceptance failure that
cannot be solved through a narrow adapter or upstream change, and such a fork
must replace rather than coexist with the external engine path.

Phase 849 Full-Screen TUI Session And Model Navigation is complete. Its plan,
in-phase structure correction, and completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1205-phase-849-full-screen-tui-session-and-model-navigation-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1206-phase-849-navigation-controller-boundary-correction.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1207-phase-849-full-screen-tui-session-and-model-navigation-completion.md`

The full-screen TUI now opens or starts conversations with `Ctrl+O`, chooses a
configured redacted model with `F2`, preserves drafts and canonical Product
selection across acceptance/rejection, and keeps Tool approval above
navigation. The stage corrected its first 627-line controller shape by moving
navigation ownership into one internal module; the structure baseline returned
to 17 warnings. Product TUI passed all 57 tests and the complete Verify gate
passed all 66 Eval scenarios.

Phase 850 Product TUI Command Authority Consolidation is complete. Its frozen
plan and completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1208-phase-850-product-tui-command-authority-consolidation-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1209-phase-850-product-tui-command-authority-consolidation-completion.md`

The old `./shell`, `./shell-core`, and `./contributions` exports, generic shell
and resolver implementations, static Product TUI command table, static
`palette` CLI/line command, dedicated tests, and Eval-only controller scenario
were deleted without aliases. `ProductAppTuiSurface` now owns only a canonical
Product snapshot and borrowed Surface client. Product's dynamic command catalog
is the sole generic command authority. Complete Verify passed all 65 Eval
scenarios; Product TUI passed 42 tests. The repository remains at 19 packages
and 17 structure warnings, while source structure fell to 994 files and
128,577 lines and the TUI packlist fell to 41 files.

Phase 851 Full-Screen Dynamic Product Command Palette is frozen as the next
implementation segment:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1210-phase-851-full-screen-dynamic-product-command-palette-plan.md`

It must consume Product's current dynamic catalog, preview, and execution APIs
directly through the Product Surface client and use only Pi public selection,
input, focus, and overlay APIs. It must not restore any deleted shell,
contribution resolver, static command table, compatibility path, or second
command authority.

Phase 851 is complete. Its final implementation and verification record is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1211-phase-851-full-screen-dynamic-product-command-palette-completion.md`

The full-screen Product TUI now reads Product's dynamic command catalog with
`Ctrl+P`, collects schema-backed input through Pi public components, requires a
runnable Product preview plus explicit confirmation, executes only through the
Product Surface client, and refreshes canonical state. Plugin commands remain
visible without Plugin Runtime in the TUI closure. Complete Verify passed all
65 Eval scenarios and Product TUI passed 47 tests; package count and structure
warnings remain 19 and 17.

Phase 852 Full-Screen TUI Attachment Composer is complete. Its plan, in-phase
security and distribution corrections, and completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1212-phase-852-full-screen-tui-attachment-composer-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1213-phase-852-terminal-attachment-metadata-safety-correction.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1214-phase-852-desktop-distribution-budget-blocker-correction.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1215-phase-852-full-screen-tui-attachment-composer-completion.md`

The real full-screen TUI now adds, lists, submits, and removes Product's
canonical attachment drafts through the existing borrowed trusted host and
Product Surface. Attachment-only submission, rejection preservation, Session
scoping, Tool approval priority, path/hash privacy, terminal cleanup, and
hostile attachment-label encoding are executable. Product TUI passed 53 tests
and complete Verify passed all 65 Eval scenarios. The discovered Desktop ASAR
budget blocker was corrected at the leaf build without raising budgets; the
real packaged proof and host distribution audit pass with a 1,927,066-byte
two-entry ASAR.

Phase 853 Full-Screen TUI Terminal Trust Boundary is complete. Its plan and
completion record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1216-phase-853-full-screen-tui-terminal-trust-boundary-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1217-phase-853-full-screen-tui-terminal-trust-boundary-completion.md`

Every externally sourced full-screen value now crosses centralized single-line
or multiline terminal encoding. Selectors render safe copies but dispatch the
original opaque item, bracketed paste cannot inject C1 or bidi controls, and
Pi-owned cursor/control sequences remain untouched. Product TUI passed 58
tests, all 65 Eval scenarios and complete Verify passed, and package count and
structure warnings remain 19 and 17.

Phase 854 Full-Screen TUI Contextual Plan Review is frozen next:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1218-phase-854-full-screen-tui-contextual-plan-review-plan.md`

It must consume Product's existing event-driven generation, revision-fenced
proposal decision, and execution contracts through a contextual Pi overlay. It
must preserve the main composer, keep Tool approval highest priority, re-enter
the existing conversation operation on execution, and add no polling, package,
schema, lower identity disclosure, or parallel Plan authority.

Phase 854 is complete. Its implementation, in-phase controller structure
correction, and final verification record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1219-phase-854-full-screen-tui-contextual-plan-review-completion.md`

The real full-screen TUI now uses `F4` for event-driven Plan generation,
terminal-safe canonical review, exact revision-fenced decisions, and execution
through the existing conversation operation. Tool approval owns a separate
internal lifecycle manager and preempts Plan. Product TUI passed 61 tests,
complete Verify passed all 65 Eval scenarios, package count remains 19, and
structure warnings remain at 17.

Phase 855 Full-Screen TUI Contextual Goal Control is complete. Its frozen plan
and final implementation/verification record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1220-phase-855-full-screen-tui-contextual-goal-control-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1221-phase-855-full-screen-tui-contextual-goal-control-completion.md`

The real full-screen Product TUI now uses `F5` for a structured multiline Goal
request, explicit admission confirmation, event-driven canonical Goal
reconciliation, and exact revision-fenced pause/resume/cancel controls. The
form preserves the main composer draft and terminal state, keeps Tool approval
and Session changes authoritative, and does not expose lower execution
identities. Product remains the only Goal validation and execution authority;
the TUI adds no scheduler, verifier, polling loop, package, dependency,
schema, compatibility path, or generic form API.

Product TUI passed 65 tests, focused full-screen xterm passed 28 tests, all 65
Eval scenarios passed, Runtime/App/Product/Web/Desktop and Rust checks passed,
and the final `WANEX_TEST_CONCURRENCY=2 pnpm verify` passed. The repository
remains at 19 packages and 17 structure warnings; the in-phase state extraction
returned the full-screen controller to 566 lines.

Phase 856 Full-Screen TUI Contextual Plan Revision is complete. Its frozen plan
and final implementation/verification record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1222-phase-856-full-screen-tui-contextual-plan-revision-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1223-phase-856-full-screen-tui-contextual-plan-revision-completion.md`

The real full-screen Product TUI now completes the `F4` Plan journey from
generation through user revision and approval. The user can edit the title,
summary, and existing step title/detail fields while opaque step IDs,
metadata, and canonical references remain preserved by Product's revision
fence. A stale edit remains available after conflict instead of being silently
rebased or discarded. Product TUI passed 67 tests, focused full-screen xterm
passed 30 tests, all 65 Eval scenarios passed, and the final
`WANEX_TEST_CONCURRENCY=2 pnpm verify` passed. The repository remains at 19
packages and 17 structure warnings; `full-screen/plan.ts` is 596 lines.

Phase 857 Full-Screen TUI Ephemeral Side Query is complete. Its frozen plan
and final implementation/verification record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1224-phase-857-full-screen-tui-ephemeral-side-query-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1225-phase-857-full-screen-tui-ephemeral-side-query-completion.md`

The real full-screen TUI now provides an event-driven `F6` temporary Side
Query overlay with exact start/read/cancel/dismiss control, close/reopen
retention, Tool approval preemption, Session-binding honesty, terminal-safe
CJK/emoji projection, and no durable history or polling. Product TUI passed 71
tests, focused full-screen xterm passed 34 tests, all 65 Eval scenarios passed,
and final `WANEX_TEST_CONCURRENCY=2 pnpm verify` passed after the in-phase
failure-safety review. The repository remains at 19 packages and 17 structure
warnings; `full-screen/controller.ts` remains 596 lines.

Phase 858 Full-Screen TUI Conversation Recovery And Regeneration is complete.
Its frozen plan and final implementation/verification record are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1226-phase-858-full-screen-tui-conversation-recovery-regeneration-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1227-phase-858-full-screen-tui-conversation-recovery-regeneration-completion.md`

The real full-screen TUI now uses one dynamic `F7 recovery/regenerate` action
over Product's existing exact recovery and fresh-regeneration commands.
Ambiguous Tool work remains human-reviewed and revision-fenced, structured
success/failure evidence is locally parsed and bounded, stale decisions fail
closed, Tool approval preempts recovery, and terminal regeneration remains
explicit while using the current Product model selection. Product TUI passed
77 tests, focused full-screen xterm passed 40 tests, all 65 Eval scenarios and
final `WANEX_TEST_CONCURRENCY=2 pnpm verify` passed. The repository remains at
19 packages and 17 structure warnings; no automatic replay, lower-layer
concept, dependency, schema, polling loop, compatibility path, or second
execution authority was added.

Phase 859 Installed Full-Screen TUI Trusted Composition And Real-Provider
Acceptance is complete. It extracts the
single native local credential adapter for Product Local/Desktop and Product
TUI, deletes the old Product Local implementation without compatibility
exports, and proves one installed full-screen real-Provider conversation with
bounded cleanup and credential privacy. TUI rendering remains dependent only
on a borrowed Product Surface client and must not gain Product Local, Web,
React, Plugin, Connector, Team, Electron, Gateway, Runtime, Storage, keychain,
or Provider implementation access. The frozen plan is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1228-phase-859-installed-full-screen-tui-trusted-composition-real-provider-plan.md`

The source-level real-Provider proof was corrected into generated installed
acceptance. The eight-file compiled artifact installs outside the workspace,
uses the generated native System Service package, and passes line plus macOS
PTY real-Provider lifecycle, credential privacy, terminal restoration, and
owned-process cleanup proofs without source, `tsx`, workspace links, or copied
`node_modules`. The acceptance correction and completion are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1229-phase-859-installed-artifact-acceptance-correction.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1230-phase-859-installed-full-screen-tui-trusted-composition-real-provider-completion.md`

Product TUI passed 84 tests, all 65 Eval scenarios passed, Rust formatting,
tests and Clippy passed, and final `WANEX_TEST_CONCURRENCY=2 pnpm verify`
passed. The repository has 20 packages and 17 non-failing structure warnings.

Phase 860 Trusted Terminal Provider Onboarding is complete. Provider mutation
is owned by App, exported only through
the explicit lazy `@wanex/app/provider-mutation` trusted-host subpath, and used
by Product Local plus one-shot TUI onboarding. The installed 10-file TUI
artifact starts from an empty store, configures the native keychain, chats with
a real Provider fixture, relaunches without setup, restores the terminal,
cleans the isolated credential, and leaks no secret/path/process evidence.
Product TUI passed 87 tests, all 65 Eval scenarios and final
`WANEX_TEST_CONCURRENCY=2 pnpm verify` passed. Completion is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1231-post-phase-859-product-gap-review-and-phase-860-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1233-phase-860-trusted-terminal-provider-onboarding-completion.md`

Phase 861 Trusted Terminal Provider Lifecycle Management is complete. `F8`
returns an opaque host intent only after terminal restoration; the trusted CLI
host then lists/adds/rotates/edits/removes Providers through the one App
coordinator and recreates only the renderer over the same App/System Service.
The installed proof covers two Providers, switching, credential rotation,
model edit, deterministic active fallback, configured relaunch, final
unconfigured readiness, zero remaining keychain entries, and credential/path
privacy. No package, schema, Gateway, polling loop, compatibility alias, or
second mutation authority was added. Completion and the fresh gap review are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1234-post-phase-860-product-gap-review-and-phase-861-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1236-phase-861-trusted-terminal-provider-lifecycle-management-completion.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1237-post-phase-861-product-and-release-gap-review.md`

No automatic Phase 862 is frozen. Continue only after selecting one real
outcome: owner-gated public RC decisions, a packaged desktop UX vertical slice,
or a native mobile architecture proof. Do not continue accumulating TUI modes
or speculative packages.

License selection and `@wanex` npm scope ownership are explicit owner
prerequisites. Do not silently choose a license or publish the current
`0.0.0`/`UNLICENSED` artifacts.

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
- Phase completion must immediately trigger the next planning cycle in the same
  working turn:
  - review the current installed-product or shortest real-consumer journey from
    the evidence produced by the completed phase;
  - compare concrete candidate improvements and reject work without nearer
    user, runtime, SDK, provider, tool, or distribution value;
  - document and freeze the next phase with executable acceptance before making
    its code changes;
  - continue into that phase autonomously unless an owner/value decision or an
    external blocker makes correct progress impossible.
- Do not end a phase with an unspecified later review, wait for a routine
  `continue` instruction, or infer the next phase from an old backlog. The
  completion record and next-phase review/plan are one continuous workflow.
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

## Current Team Conversation Product Route

TEAM-8 Local Host execution composition and TEAM-9A conversation-selection
contract correction are complete. The records and frozen TEAM-9 route are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1325-phase-team-8-local-host-execution-composition-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1326-post-team-8-replan-and-phase-team-9-product-group-conversation-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1327-phase-team-9a-conversation-selection-contract-completion.md`

Product persisted/UI state now uses exactly one optional discriminated
`selection`: session or Team conversation. Do not restore
`selectedSessionId`, add a parallel Team id, or add compatibility parsing.
Presentation-local session ids in Web/TUI/CLI are permitted only when derived
from a session selection and must never become mutation or persistence
authority.

TEAM-9B is next: define the Product-owned optional Team port and bounded,
renderer-safe Team read models. Product must not depend on `@wanex/team` or
expose Store, transport, binding, job, lease, worker, raw event, or execution
evidence. No new package, SQLite schema, renderer polling loop, fake policy
mode, or Team UI belongs in TEAM-9B.

TEAM-9B is complete. Its plan and completion record are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1328-phase-team-9b-product-team-port-and-read-model-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1329-phase-team-9b-product-team-port-and-read-model-completion.md`

The Product Team boundary lives under `apps/product/src/team` and the explicit
`@wanex/product/team` subpath. Keep Product free of `@wanex/team`; only a
trusted composition adapter may use the Team runtime and Product projection
helpers. Product Team content is exactly public text/resource, current Product
policy is exactly finite peer rounds, and delivery presentation is exactly
waiting/responding/replied/passed/failed/cancelled. Do not expose raw routing,
job, child turn, lease, binding, idempotency, principal, metadata, or provider
fields.

TEAM-9C is complete. Its completion evidence and the frozen TEAM-9D plan are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1331-phase-team-9c-local-host-adapter-and-invalidation-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1332-post-team-9c-review-and-phase-team-9d-surface-web-contract-plan.md`

Local Host now exposes only Product Team commands; raw Team Runtime remains in
trusted composition. Product peer submit uses deterministic local-user
authority, exact persisted participant targets for replay, owner-scoped reads,
one open round, and commit-after-notify advisory events. Do not restore raw
`LocalWebApp` Team mutation methods, foreign-principal reads, arbitrary active
user authors, or delivery-order reconstruction of persisted message targets.

TEAM-9D is next. Before adding Surface/Web commands, replace the unpublished
Team page oldest-first `after*` contract with latest-window stable `before*`
pagination. Then add typed Product Surface Team commands/events and Web
application read/action/reconciliation models. Do not add final React UI, a
package, schema tables/version, Gateway, timer polling, raw Team types, or
compatibility cursor aliases in TEAM-9D.

TEAM-9D is complete. Its completion evidence and the frozen TEAM-9E plan are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1333-phase-team-9d-surface-web-contract-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1334-post-team-9d-review-and-phase-team-9e-real-web-desktop-group-ux-plan.md`

Team pages now use latest-window stable `before*` pagination. Product Surface
owns eight typed Team commands and one invalidation event; Web owns bounded
Team application state and event reconciliation. Renderer participant models
must not expose agent-session routing bindings. A projected child reply is a
durable `visible` Team message, never a terminal delivery paired with a
`queued` Product reply.

TEAM-9E is complete. Its completion evidence and the frozen TEAM-9F plan are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1335-phase-team-9e-real-web-desktop-group-ux-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1336-post-team-9e-review-and-phase-team-9f-installed-desktop-team-acceptance-plan.md`

The real Web/Desktop renderer now owns a group library, participant management,
public Team timeline, finite delivery presentation, text composer and stable
earlier-history UX. Browser SSE must treat `product.surface.team.invalidated`
as canonical snapshot invalidation; do not replace that event path with Team
polling. Renderer Team models must remain free of agent-session bindings and
raw execution evidence.

TEAM-9F is next. Extend the existing packaged Desktop proof with one dedicated
`relaunch-team` DOM journey using an existing agent session and configured
Provider. Do not add production APIs, packages, dependencies, schema, IPC
mutation authority, polling, Gateway, raw Team fields, speculative Team
features, or compatibility aliases.

TEAM-9F is complete. Its installed evidence and the frozen TEAM-10A plan are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1337-phase-team-9f-installed-desktop-team-acceptance-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1338-post-team-9-review-and-phase-team-10a-durable-lead-authority-plan.md`

The packaged darwin-arm64 Product now proves the real DOM journey from an
existing agent session through group creation, participant admission, finite
round execution, SSE terminal refresh, public reply, and session restore. The
current Team input remains text-only while the agent session's historical
multimodal context remains intact. Do not replace this with polling, raw
renderer authority, context stripping, presentation-text selectors, sleeps,
or restart-based recovery.

TEAM-10A is next. Add one explicit nullable conversation-scoped lead authority
with atomic expected-current compare-and-set semantics. Never infer lead from
participant role, display name, ordering, metadata, or renderer selection.
Peer conversations cannot have a lead; an assigned lead must be an active
agent in the same conversation; the current lead cannot be muted or removed
until reassigned or cleared. TEAM-10A does not include orchestrated routing,
delegation, hybrid policy, mentions, Product UI, compatibility fields, or a
second lead truth source.

TEAM-10A is complete. Its completion evidence and the corrected TEAM-10B plan
are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1339-phase-team-10a-durable-lead-authority-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1340-post-team-10a-review-and-phase-team-10b-orchestrated-direct-routing-plan.md`

TEAM-10B is next. Orchestrated routes must be fenced by the expected current
lead and validated in the canonical System Service transaction. No target or a
typed lead target creates exactly one lead delivery; one typed participant
target creates exactly one direct delivery. Do not create an implicit lead
observer delivery: every delivery is a real Provider turn, not a passive
subscription. TEAM-10B does not include Product UI, mentions, `all`, hybrid,
delegation, collection, summary, shared transcript injection, or compatibility
fields.

TEAM-10B is complete. Its completion evidence and the replanned TEAM-10C route
are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1341-phase-team-10b-orchestrated-direct-routing-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1342-post-team-10b-review-and-phase-team-10c-durable-lead-delegation-plan.md`

TEAM-10C1 is complete. Its completion evidence and the frozen TEAM-10C2 plan
are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1343-phase-team-10c1-domain-neutral-deferred-tool-handoff-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1344-post-team-10c1-review-and-phase-team-10c2-atomic-lead-delegation-admission-plan.md`

TEAM-10C2 and TEAM-10C3 are complete. Their completion evidence and the frozen
TEAM-10C3 plan are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1345-phase-team-10c2-atomic-lead-delegation-admission-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1346-post-team-10c2-review-and-phase-team-10c3-event-driven-bounded-collection-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1347-phase-team-10c3-event-driven-bounded-collection-completion.md`

TEAM-10C3 established canonical child-terminal DAG progression, bounded public
dependency projection, all-settled `team.delegation_result` collection,
same-logical-Turn wake, and domain-neutral `cascadeJobIds` cancellation. Do not
restore media-specific cancellation fields, collector workers, graph polling,
Runtime callback authority, duplicated child output, dynamic public speakers,
or compatibility aliases.

TEAM-10C4 Lead Summary And Legacy Cleanup and the complete TEAM-10C route are
finished. Their frozen plan, completion evidence, and next-route review are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1348-post-team-10c3-review-and-phase-team-10c4-lead-summary-and-legacy-cleanup-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1349-phase-team-10c4-lead-summary-and-legacy-cleanup-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1350-post-team-10c-review-and-phase-team-11a-product-coordinated-team-contract-plan.md`

TEAM-10C now has one canonical path: resumed lead Session replay consumes the
settled delegation Tool result, final Session settlement feeds the existing
Team outcome job, and exactly one public lead outcome closes the round. The
process-local `DelegationRuntime`, direct `@wanex/team/delegation` entry, old
Eval scenario, types, implementation, and tests are deleted. Preserve only the
separate durable `@wanex/team/delegation/graph` primitive. Do not restore a
summary table, collector worker, callback authority, polling, or compatibility
path.

TEAM-11A is next. Replace Product's peer-only vocabulary with explicit user
modes `discussion | coordinated`, a renderer-safe coordinator identity,
mode-neutral `submitRound`, and exact expected-current coordinator CAS. Local
Host must map these to canonical peer/orchestrated Team authority and derive
submission routing from the stored conversation, never a Renderer claim. Do
not expose hybrid, child jobs/DAG/Tool evidence, add final mode/coordinator UI,
recursive delegation, a package/schema, polling, or legacy Product aliases in
TEAM-11A.

TEAM-11A is complete. Its implementation evidence and the frozen TEAM-11B plan
are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1351-phase-team-11a-product-coordinated-team-contract-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1352-post-team-11a-review-and-phase-team-11b-real-coordinated-team-ux-plan.md`

Product now exposes only `discussion | coordinated`, renderer-safe coordinator
identity, exact nullable coordinator CAS, and mode-neutral round submission.
Local Host derives routing from the canonical stored conversation and maps
coordinator updates to the existing lead fence. Old peer-only Product symbols
are deleted without aliases. TEAM-11B must make these existing contracts
reachable in the real Web/Desktop group flow through a compact creation mode
choice and on-demand coordinator controls. Keep child jobs, DAGs, reasoning,
Tool evidence, hybrid policy, recursive delegation, polling, and Runtime terms
out of the UI.

TEAM-11B is complete. Its implementation evidence and the frozen TEAM-11C plan
are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1353-phase-team-11b-real-coordinated-team-ux-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1354-post-team-11b-review-and-phase-team-11c-installed-coordinated-team-acceptance-plan.md`

The real Web/Desktop renderer now creates `coordinated` groups by default,
offers one explicit `discussion` choice, manages the coordinator through exact
snapshot CAS, blocks submission until canonical authority exists, and presents
only one public coordinator delivery/reply. Keep raw lead, route, child job,
Tool, DAG, reasoning, polling, and compatibility vocabulary out of Product UI.

TEAM-11C is next. Upgrade the one existing packaged `relaunch-team` proof in
place to drive the coordinated journey through visible DOM controls: create,
add an existing agent, assign coordinator, prove coordinator member guards,
submit, observe SSE terminal settlement, and restore the original session. Do
not add a parallel proof step, direct Product/Team mutation, production flag,
timer polling, package, schema, dependency, or compatibility path.

TEAM-11C and the complete TEAM-11 route are finished. Their installed evidence
and the frozen TEAM-12 route are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1355-phase-team-11c-installed-coordinated-team-acceptance-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1356-post-team-11-review-and-phase-team-12-tui-team-parity-route-plan.md`

The single packaged `relaunch-team` proof now follows only the current
coordinated product journey through visible Create, Add, coordinator, and Send
controls. It proves context auto-open, coordinator guards, exactly one public
delivery/reply, SSE settlement, normal and 760px layouts, privacy, Session
restore, and owned-process cleanup. Do not restore synthetic form submission,
an implicit discussion default, a parallel installed Team proof, direct
authority, polling, or descriptor compatibility.

TEAM-12A is next. Replace the TUI full-screen state's optional `sessionId`
truth with one optional discriminated Product selection, add bounded Product
Team application state and event-driven canonical rereads, and keep all
Session-only reads derived from session selection. Do not add final Team UI in
TEAM-12A, preserve a parallel session id, import `@wanex/team` into the
renderer, add a package/schema/poller, or introduce compatibility state.

TEAM-12A is complete. Its frozen implementation contract and completion
evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1357-phase-team-12a-tui-discriminated-selection-and-team-state-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1358-phase-team-12a-tui-discriminated-selection-and-team-state-completion.md`

The TUI full-screen state now exposes exactly one optional Product
`ConversationSelection` (`session | team`) derived from canonical Home state,
without a second mutable selection copy, and bounded Product Team page state.
Session transcript, attachment and operation reads are selected only from a
Session selection; Team invalidation is reconciled through the existing
Surface event subscription and canonical reread tail. Do not add Team UI yet,
duplicate selection state, polling, raw Team/Runtime imports, packages,
schema changes, or compatibility aliases.

TEAM-12B is complete. Its implementation evidence and the frozen TEAM-12C
installed acceptance plan are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1360-phase-team-12b-real-full-screen-team-ux-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1359-post-team-12a-review-and-phase-team-12b-real-full-screen-team-ux-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1361-post-team-12b-review-and-phase-team-12c-installed-tui-distribution-acceptance-plan.md`

The TUI now provides unified Session/Group navigation, coordinated-by-default
group creation, bounded public Team timeline, text-only Team composer, and
contextual group details under `full-screen/team/`. It preserves exact
coordinator CAS, Product-only renderer contracts, event-driven canonical
rereads, Session behavior, and explicit confirmation for irreversible agent
removal. Do not add more Team features before installed acceptance.

TEAM-12C is next. Extend the existing installed TUI distribution proof in place
to drive the real full-screen journey: existing agent Session -> New group ->
add agent -> coordinator -> submit -> public reply -> original Session. Use
only visible keyboard interaction through the installed bundle and the current
controlled Provider. Do not add a parallel proof, direct Product/Team mutation,
package, dependency, schema, production flag, polling, Gateway, WebSocket, or
compatibility path. Unix-like hosts use the existing Expect PTY capability;
Windows keeps the current line-mode contract and must not be reported as a
full-screen PTY pass without a real platform capability.

TEAM-12C's first installed run triggered its composition replan: the TUI
renderer reached New group, but its trusted CLI host had constructed Product
without a Team port. The evidence and frozen correction are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1362-phase-team-12c-in-phase-local-product-host-composition-correction.md`

Extract the existing presentation-neutral storage/Product/Team/Surface
lifecycle inside `@wanex/local-host/application`, migrate Local Web and TUI to
that single owner, and then resume the same installed PTY proof. Do not copy the
Local Team adapter into TUI, start an unused Web host for terminal use, create a
universal composition package, keep the old TUI `appOptions` path, or bypass
the visible TUI with direct Product/Team mutations.

TEAM-12C and the complete TEAM-12 route are finished. Completion evidence is:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1363-phase-team-12c-installed-tui-distribution-acceptance-completion.md`

The installed TUI now proves the real coordinated journey from an external npm
install through visible terminal controls, Provider execution, public Team
reply, original Session restore, relaunch, terminal restoration, process
cleanup, and credential cleanup. Local Web and TUI share exactly one
presentation-neutral Product/Team lifecycle under
`@wanex/local-host/application`; the TUI renderer remains Product-Surface-only.
Do not restore TUI-local Shell composition, start Web/HTTP for terminal use,
copy the Local Team adapter, create a universal composition package, or weaken
the exact leaf-recipe dependency audit.

Before starting another implementation route, perform a Post-TEAM-12 global
product and architecture gap review. Do not assume hybrid, mentions, recursive
delegation, child inspection, or more Team UI is next merely because the Team
route is complete.

The Post-TEAM-12 gap review is complete and freezes the Plugin Productization
route:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1364-post-team-12-global-gap-review-and-plugin-productization-route-plan.md`

PLUGIN-1 is complete. Completion evidence is:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1365-phase-plugin-1-plugin-command-host-ownership-and-composition-reset-completion.md`

The sole optional command host is now `@wanex/plugin-command-host`. It returns a
composable Product creation binding and owns only Plugin worker lifecycle; an
upper composition owns the one Product Shell, Surface, SurfaceClient, and
Storage lifecycle. Do not restore the deleted generic identity, forwarding
package, alias, deprecated API, second Product Shell, or parallel composition.

PLUGIN-2 is complete. Its frozen plan and completion evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1366-phase-plugin-2-immutable-local-package-inspection-and-trust-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1367-phase-plugin-2-immutable-local-package-inspection-and-trust-completion.md`

Local Plugin discovery is now bounded and data-only. Materialization reinspects
source and same-volume staging, promotes one content-addressed immutable root,
records explicit unsigned approval without inventing signature verification,
and activates manifest/install in one SQLite transaction. Trusted subprocesses
use the exact durable install root as cwd. Do not restore the deleted generic
installer adapter, npm/lifecycle execution, discovery-time import, mutable
active directories, split manifest/install activation, compatibility aliases,
or Product-owned filesystem truth.

The Post-PLUGIN-2 review and corrected PLUGIN-3 route are frozen in:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1368-post-plugin-2-review-and-phase-plugin-3-hot-plugin-composition-route-plan.md`

PLUGIN-3A is complete. Completion evidence is:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1369-phase-plugin-3a-durable-active-version-and-exact-execution-admission-completion.md`

Plugin execution identity is now exact `pluginId@version/actionId/capability`.
SQLite immediate transactions enforce at most one active install version per
Plugin, stale idempotent activation replay cannot reactivate a superseded
version, and submission plus worker execution both require atomic matching
manifest/install/trust admission. Package actions do not carry a second version
field; the package/manifest version is authoritative. Do not restore optional
execution versions, versionless handler refs, multiple active installs, split
worker reads, package action version fallbacks, compatibility aliases, or a
second active-selection truth.

PLUGIN-3B is complete. Completion evidence is:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1370-phase-plugin-3b-declarative-product-command-manifest-completion.md`

Plugin package `contributes.commands` is bounded, strict and data-only. Commands
reference same-layout actions; the Plugin Command Host derives exact-version
handler refs, privileged Plugin/user provenance and `user_enabled` trust, and
validates input schemas before returning an all-or-nothing generation. Weak
kind-only package/install-plan type guards were removed. Do not restore package
handler refs, package-controlled provenance/trust, dangling actions, ambiguous
names/aliases, partial schema publication, weak parser bypasses, or deprecated
aliases.

PLUGIN-3C is complete. Completion evidence is:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1371-phase-plugin-3c-versioned-extension-catalog-source-completion.md`

Extension now owns one presentation-neutral catalog source with immutable
`{ revision, snapshot }` generations and separated reader/publisher authority.
Same-revision publication is a no-op, listener failures are isolated, resolver
maps are not exposed as mutable Maps, App context admission captures one
generation, and every Product command operation captures one generation and
caches by revision. The fixed snapshot option was deleted across pre-release
consumers. Do not restore `extensions.snapshot`, `extensionSnapshot`, mutable
generation Maps, partial publication, polling, Storage reads in Extension, or
Product-owned Plugin state.

PLUGIN-3D is complete. Its frozen plan and completion evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1372-phase-plugin-3d-long-lived-plugin-host-and-local-composition-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1373-phase-plugin-3d-long-lived-plugin-host-and-local-composition-completion.md`

The optional Plugin Command Host now reconstructs immutable active generations
from durable installs, owns one `plugin.action` claim worker and an append-only
exact-version execution registry, serializes/coalesces refreshes, and retains
the prior catalog on malformed refresh. Local Host exposes only one named
Plugin composition port and preserves one Storage handle and one Product Shell
with explicit prepare/start/stop/dispose ordering. Plugin Host exports a
structurally compatible composition result without depending on the upper
Local Host package; the trusted product leaf connects them and default Local
Host remains Plugin-free. Do not restore caller-provided Plugin catalogs/targets,
app-to-app dependencies, polling, multiple claim owners, generic composition
hooks, compatibility aliases, or Product-owned installation truth.

PLUGIN-3E is next. Prove event-driven Product/Surface invalidation and canonical
reread across zero-Plugin startup, enable, disable, exact-version replacement,
failed refresh retention, and default Plugin-free Web/TUI closures. Do not add
Plugin management UI before PLUGIN-4 or packaged distribution claims before
PLUGIN-5.

PLUGIN-3E implementation is frozen in:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1374-phase-plugin-3e-event-driven-product-proof-plan.md`

Use one revision-only Product command-catalog invalidation event, project it
through the existing bounded Surface event log, and make consumers reread the
canonical command catalog. Do not send command deltas, Plugin identity, paths,
trust JSON, jobs, workers, or payloads through the event.

PLUGIN-3E is complete. Its implementation evidence is:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1375-phase-plugin-3e-event-driven-product-proof-completion.md`

Product now owns one revision-only command-catalog event hub whose baseline is
the source's current generation. Surface projects changed revisions through its
existing bounded replay log; Web and TUI invalidate stale palette state and
reread canonical `readProductCommands()`. Zero-Plugin startup, replaying source
startup, enable, exact-version replacement, disable, identical refresh, failed
refresh retention, privacy, and two real worker executions are covered. Do not
restore command deltas, Plugin identity in events, polling, renderer Plugin
imports, a second event bus, or Product restart as refresh behavior.

Before implementing PLUGIN-4, freeze a post-PLUGIN-3 management UX plan. It
must preserve trusted-host ownership of discovery/install/state mutation,
Product/Surface-only renderer contracts, progressive disclosure, the existing
dynamic command palette and the default Plugin-free closure. Do not infer that
Web, Desktop, and TUI need identical management forms.

The Post-PLUGIN-3 review and PLUGIN-4 route are frozen in:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1376-post-plugin-3-review-and-phase-plugin-4-product-management-route-plan.md`

PLUGIN-4A is next. Replace the pre-release Plugin install-state mutation with
required exact expected-state CAS, then build one bounded trusted management
core inside Plugin Command Host: native source selection, one-shot local review,
safe list projection, install/enable/disable/remove/retry, and serialized
refresh. Do not add UI in 4A, let a renderer submit paths, preserve the old
non-CAS request, create a permission truth beside approved trust/admission, or
move coordination outside the one Plugin Host.

PLUGIN-4A is complete. Its implementation evidence is:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1378-phase-plugin-4a-exact-state-and-trusted-management-core-completion.md`

Storage now requires exact expected-state CAS through Protocol, generated RPC,
TypeScript, and Rust immediate transactions. The optional Plugin Command Host
management core owns native selection, bounded one-shot review, immutable local
materialization, install/state mutation, refresh, safe projection, and
revision-only invalidation. Public values are deeply frozen and contain no
paths or raw trust/layout authority. Ordinary mutation cannot restore removed
installs; a fresh review of the same immutable artifact can. Do not export a
second management factory, let renderers submit paths, restore positional state
APIs, add polling, or describe unsigned approval as signature verification.

PLUGIN-4B is complete. Its frozen plan and implementation evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1379-phase-plugin-4b-product-surface-management-contract-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1380-phase-plugin-4b-product-surface-management-contract-completion.md`

Product now owns the one presentation-neutral `@wanex/product/plugin-management`
contract. Plugin Command Host implements it directly and supplies the same
optional management handle through Local composition to the one Product Shell.
The existing Surface exposes six strict management commands and revision-only
invalidation through its existing bounded event log. Product stores no Plugin
management copy; path/actor/raw trust or layout input is rejected, and strict
transport validation rejects path-bearing forged responses. Default Product,
Web, TUI, and Local Host closures remain Plugin-free. Do not restore Host-local
duplicate models, renderer paths, Plugin imports in renderer packages, polling,
a second event bus/cache, compatibility aliases, or a second Shell.

PLUGIN-4C is complete. Its frozen plan and completion evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1381-phase-plugin-4c-real-web-desktop-settings-ux-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1382-phase-plugin-4c-real-web-desktop-settings-ux-completion.md`

Web now owns one canonical management projection and keeps local reviews only
in the typed one-shot ActionResult/component state. Desktop is the sole trusted
product leaf connecting the existing Local Host Plugin composition port to
`@wanex/plugin-command-host`; Local Host and Web remain independent of the
Plugin implementation. Native selection stays inside Electron main and passes
the path directly to the trusted Host callback. The packaged product still has
no application `node_modules`, preload, renderer path input, Plugin HTTP
endpoint, second install cache, management polling, or TUI management form.

PLUGIN-4D integrated Product acceptance is next and frozen in:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1383-post-plugin-4c-review-and-phase-plugin-4d-integrated-product-acceptance-plan.md`

Use a minimal real local Plugin fixture through visible Web controls, the real
Product Surface, Plugin Command Host, immutable install base, dynamic command
catalog, execution activity, exact state transitions, retry, and relaunch. A
proof-only trusted selection queue may replace the native picker only inside
the proof owner; it must never reach renderer contracts. Do not use mock-only
UI tests to claim integrated acceptance, add a production bypass action, create
a package or test app, or start marketplace/download/update/signature work.

PLUGIN-4D and the complete local Plugin Productization route are finished. The
completion evidence and post-route global review are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1384-phase-plugin-4d-integrated-product-acceptance-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1385-post-plugin-4d-global-review-and-schedule-productization-route-plan.md`

Async Product commands now distinguish synchronous `completed`, durable
`submitted`, and `rejected`. Plugin worker settlement publishes only a job
reference invalidation through Product and the existing bounded Surface log;
Web rereads canonical execution state for the matching job. Local durable
submission wakes the existing worker loop immediately, while the durable scan
remains cross-process recovery truth. Do not restore eager completion,
status-bearing event deltas, polling, a second event bus, or blind resubmission.
Extension executors must return an explicit `completed | submitted` envelope;
Product must never infer execution disposition from payload fields or the
presence of a historical job reference.

Packaged Desktop proves a workspace-external real Rust Plugin through visible
review/cancel/install/execute/disable/enable/exact replacement, real
attention/retry, relaunch, remove, privacy and process cleanup. This stronger
4D journey absorbs the previously proposed PLUGIN-5 external-artifact proof;
do not create a duplicate phase or test app. Marketplace, download,
auto-update, remote signatures and a TUI installation form remain
value-gated. Desktop identifier minification is required to keep the two-entry
ASAR below its existing budget; do not restore `keepNames`, which breaks the
serialized renderer proof boundary, or raise the distribution budget.

The next route is Schedule Productization. SCHEDULE-1 must first freeze a
Product-safe definition port and atomic durable occurrence claim with exact
revision CAS. Product owns safe schedule actions/read models; the trusted Host
owns recurrence parsing, timezone/DST, misfire, one earliest-deadline timer and
hot recomputation; App continues to own one-shot `submitScheduledTick`;
Runtime does not learn Cron. Before adding schema or a package, audit whether
an existing generic exact-CAS persistence contract can implement the adapter.
Do not add a Kernel cron parser, renderer timer, per-schedule interval,
definition polling, time wheel without scale evidence, catch-up storm,
Gateway, second Store/Shell/Surface/event bus, or SQLite/vendor identity to the
Product contract.

The SCHEDULE-1 frozen plan and completed evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1386-phase-schedule-1-contract-and-durable-occurrence-claim-plan.md`

Storage provides one generic bounded versioned-config CAS operation with
expected-missing support, exact revision conflict evidence, prefix pagination,
and value-free events. Product provides one optional renderer-safe Schedule
port with bounded definitions, explicit unavailable/conflict results,
prompt-free list summaries, exact revision actions, and revision-only
invalidation. Local Host maps that port to the existing Storage handle through
strict namespaced records and claims each occurrence by atomically checking the
exact definition revision plus an expected-missing occurrence key. Neither
Storage, Runtime nor Product knows Cron evaluation, timezone/DST, timer,
occurrence execution, or scheduler worker identity. SCHEDULE-1A/1B/1C and the
complete SCHEDULE-1 foundation are finished.

SCHEDULE-2 Trusted Local Host Scheduler is complete. Its frozen plan,
implementation evidence, and final best-practice review are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1387-phase-schedule-2-trusted-local-host-scheduler-plan.md`

Local Host now owns strict recurrence validation, one earliest-deadline timer,
value-free invalidation hot recomputation, durable pending recovery, bounded
misfire, retry, deterministic App admission, exact occurrence settlement, and
host lifecycle ordering. A per-schedule durable pending index prevents backlog
growth and makes startup recovery proportional to unfinished work. Definition,
occurrence, and composition responsibilities are separate files in the same
Schedule owner; no package, Store, Gateway, daemon, polling loop, per-schedule
timer, time wheel, compatibility path, or Runtime Cron semantics were added.

SCHEDULE-3A Product-Safe Schedule Status Contract is complete. Its plan and
completion evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1388-phase-schedule-3-product-safe-status-contract-plan.md`

Product now receives only `disabled`, `scheduled`, `running`, `retrying`, or
`completed`, with bounded next/retry timestamps and the latest submitted/skipped
outcome. Local Host derives this from the existing definition, pending index,
and retained occurrence history. Product fences schedule id and definition
revision and rejects malformed status. Prompt, execution identity, attempt,
raw error, Storage key, controller state, and trusted Host methods remain out of
the Product contract.

SCHEDULE-3B Product Surface Contract is complete. Its plan and completion
evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1389-phase-schedule-3b-product-surface-contract-plan.md`

The existing Product Surface now exposes exactly six Schedule commands:
`listSchedules`, `readSchedule`, `createSchedule`, `replaceSchedule`,
`setScheduleEnabled`, and `removeSchedule`. They use strict nested input
parsers, typed client methods, message transport, Product read/mutation result
validation, exact revision actions, and the existing event log. Schedule
invalidation is value-free (`sequence`, `at`, `revision` only); renderers must
canonical-reread list/detail and must not use the event as a second state
source. Product Surface never exposes the Local Host adapter, occurrence
records, pending index, timers, trusted execution methods, prompt in list
summaries, job/attempt/runtime identities, or raw retry errors.

SCHEDULE-3C Web/Desktop Product UX is complete. Its frozen plan,
implementation evidence, verification, real local Host browser acceptance, and
best-practice review are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1390-phase-schedule-3c-web-desktop-product-ux-plan.md`

Web now reconciles one canonical Schedule list, dispatches the six existing
Product Surface commands, and owns only transient form/dialog state. Settings
provides create/edit/enable/disable/remove without exposing scheduler internals.
The Web HTTP action registry is exhaustive over `Action["type"]`, so a future
transport omission fails TypeScript checking. Do not restore the former
non-exhaustive string Set, browser-native Schedule confirmation, raw session ID
display, `fire_once` as the safe create default, polling, renderer timers,
Store/Local Host access, compatibility aliases, or a second Schedule command
set.

The post-SCHEDULE-3C review selected SCHEDULE-4 Packaged Acceptance. Its frozen
plan is:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1391-post-schedule-3c-review-and-phase-schedule-4-packaged-acceptance-plan.md`

SCHEDULE-4 must reuse the existing packaged Desktop, controlled Provider,
same-profile relaunch orchestration, receipt, and distribution audit. It proves
visible five-second Schedule creation, real fire, a held first execution across
multiple deadlines without another Provider request, disable, durable relaunch,
re-enable/fire, quiet disabled interval, remove, privacy, and shutdown cleanup.
Deterministic misfire, DST, clock rollback, retry, and duplicate-claim evidence
remains in Local Host fake-clock tests; do not add a fake clock or scheduler
control to production renderer contracts. Add no package, test app, Gateway,
polling, renderer timer, second event bus, compatibility path, or footprint
budget increase. TUI Schedule parity remains value-gated.

SCHEDULE-4 and the complete local Schedule Productization route are finished.
The implementation, packaged evidence, regression corrections, distribution
measurements, and final best-practice review are recorded in:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1392-phase-schedule-4-packaged-acceptance-completion.md`

Product now projects trusted background conversation work only after durable
active-attempt validation; it does not require the turn to have been registered
by the current UI. Web retains at most eight non-selected conversation streams
of 65,536 characters each, keyed by Product operation identity, and clears them
on matching invalidation. SSE-triggered snapshot rereads are advisory and must
not supersede an in-flight foreground action response. Team participant forms
submit the named select value directly instead of duplicating it in component
state. Do not restore UI-tracking event admission, unbounded cross-session text,
advisory refresh generations, or duplicated controlled form truth.

Packaged Desktop proves a visible five-second Schedule, one held Provider
request across two further deadlines, disable/quiet, same-profile restore,
re-enable with one request, remove, privacy, footprint, and process cleanup.
Schedule Productization is closed. The next route requires a fresh global
Product gap review; TUI Schedule parity remains value-gated.

The post-SCHEDULE-4 global Product review selected a separate Coding Workspace
Product route. Its frozen architecture review and staged route are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1393-post-schedule-4-global-product-gap-review-and-coding-workspace-route-plan.md`

CODING-1 Foundation Integrity Reset is next. Do not add Coding UI or an app
package before it is complete. The current Workspace directory lock can reclaim
a live owner after a fixed stale interval, Proposal apply has no atomic claim,
and multi-file apply is not crash recoverable. CODING-1 must replace those
semantics directly with live-handle cross-process mutation ownership, exact
durable apply claim/fenced settlement, crash-recoverable atomic file
transactions, and writable-agent worktree isolation. Remove replaced pre-release
contracts rather than adding compatibility states or aliases.

Agent execution concurrency and shared-checkout integration are separate:
writable agents run in independent worktrees and produce immutable proposals;
only the explicit integration owner mutates the shared checkout after review.
Do not serialize all agents behind a workspace lock, let agents queue direct
writes to one checkout, expose lock/lease/path identities to Product, add a
Gateway or persistent lock daemon, create a universal composition package, or
make Workspace part of the default Runtime/App/Product closure. Connector,
remote/mobile Host, and TUI Schedule parity remain value-gated.

CODING-1A Native Mutation Ownership is complete. Its frozen ownership contract
and completion evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1394-phase-coding-1a-1b-ownership-contract-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1395-phase-coding-1a-native-mutation-ownership-completion.md`

The shared-checkout ownership primitive lives inside the existing System
Service transaction helper: it opens a stable lock file, owns an OS advisory
lock by live handle, and releases ownership when its control pipe closes. The
public callback/Noop `NativeWorkspaceMutationGate` abstraction was removed in
CODING-1C; do not restore it or let callers substitute a second mutation path.
`WorkspaceRuntime` receives explicit trusted `rootDir + serviceBin` Host
configuration, and its one transaction engine invokes the helper directly.
Do not restore directory creation as ownership, stale timestamps, owner
metadata deletion, a second native artifact, or a persistent lock process.

CODING-1B Exact Apply Claim And Fenced Settlement is complete. Its completion
evidence and the next frozen transaction plan are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1396-phase-coding-1b-exact-apply-claim-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1397-phase-coding-1c-crash-recoverable-change-transaction-plan.md`

Proposal apply now claims one durable `applying` attempt before filesystem
mutation, stores only a token hash, renews and settles with exact-token fencing,
and requires same-changeset Workspace operation evidence for success. SQLite
claim contention uses a short process-local admission gate plus bounded
cross-instance `BEGIN IMMEDIATE` retry; this serializes only the Store writer
critical section, not Agent or worktree execution. Explicit conflict becomes
`apply_failed`; exceptions or partial/ambiguous writes become
`recovery_required` and are never blindly replayed. Do not restore generic
`mark_applied` / `mark_apply_failed`, expose token/lease/attempt state to
Product, or classify an exception as a proven filesystem failure.

CODING-1C Crash-Recoverable Change Transaction is complete. Its frozen plan and
completion evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1397-phase-coding-1c-crash-recoverable-change-transaction-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1398-phase-coding-1c-crash-recoverable-change-transaction-completion.md`

Apply, undo, Proposal apply, and Workspace Tool mutation now share one durable
transaction engine. SQLite owns immutable plans, exact execution/recovery
claims, per-file evidence, deterministic reconciliation, Workspace operation
creation, changeset state, and optional Proposal settlement. The existing
System Service artifact is the only native executor; it owns the live OS lock,
same-directory prepare/fsync, atomic replacement/delete, progress, inspect, and
exact cleanup. Recovery skips a healthy live owner, claims expired work, then
finishes forward, proves rollback no-op, finalizes all-after files, or stops for
attention without overwriting external edits. Terminal business settlement and
artifact cleanup are separate: cleanup retries never roll back an applied
operation, and idempotent replay retries exact cleanup before returning the
existing operation.

Do not restore direct Node writes, callback/Noop mutation gates, duplicate
Proposal lease configuration, blind replay, non-atomic copy fallback, or a
second package/binary/daemon/Gateway. The threat model remains a trusted local
workspace with cooperative writers; path validation rejects symlink/reparse
ancestors but is not advertised as an adversarial openat-style filesystem
sandbox. Windows behavior is enforced by the existing `windows-2025` full
verify matrix, not claimed from local macOS testing. CODING-1D worktree
isolation is next and must reuse this shared-checkout transaction boundary
rather than create another mutation engine.

CODING-1D Writable Worktree Policy And Concurrency Acceptance is in progress.
Its frozen plan and CODING-1D.1 completion evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1399-phase-coding-1d-writable-worktree-policy-and-concurrency-acceptance-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1400-phase-coding-1d-1-contract-reset-completion.md`

The repository already has a worktree adapter, Git diff projection, and
durable `workspace.task` job. CODING-1D must productionize those primitives,
not add another adapter: Product expresses only `read_only | writable`; the
trusted Host resolves opaque repository identity and derives disposable
worktrees; a temporary-index synthetic commit captures dirty checkout content
without changing HEAD/index/stash; durable exact-fenced lifecycle owns
snapshot/worktree/branch/process recovery; writable output is projected
automatically to ChangeSet/Proposal; reviewed integration still uses CODING-1C.
Delete caller-selected root/branch/keep/isolation metadata, handler-supplied
ChangeSet, persisted absolute lease paths, and the hand-written line-number
`mergeText` heuristic rather than preserving compatibility. Worktree isolation
is a cooperative conflict/review boundary, not a hostile-code sandbox.

CODING-1D.1 has completed the pre-release contract reset. `workspace.task` now
requires explicit `read_only | writable` access and JSON input; callers cannot
select root, branch, release policy, keep behavior, isolation metadata, or a
handwritten ChangeSet. Writable handlers receive only task identity, input,
access, and the isolated root; Git diff is projected automatically to one
deterministic ChangeSet/Proposal. Receipts and durable job results expose only
opaque resource/ChangeSet/Proposal ids and never persist lease/root details.
Runtime-owned worktrees always clean their branch, and the prototype adapter
releases only same-instance leases it actually created.

CODING-1D.2 Durable Workspace Task Lifecycle is complete. Its frozen plan and
completion evidence are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1401-phase-coding-1d-2-durable-workspace-task-lifecycle-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1402-phase-coding-1d-2-durable-workspace-task-lifecycle-completion.md`

SQLite now owns the exact-fenced `preparing -> active -> collecting -> proposed
-> releasing -> released` lifecycle plus non-terminal `attention`. Durable task
runs, execution/recovery attempts, scheduler jobs, and Proposals remain distinct
facts. ChangeSet, Proposal, and run linkage settle atomically; cleanup failure
cannot erase a durable Proposal, and stale attempts cannot transition or release
new ownership. Store records and task events contain opaque identities rather
than repository/worktree paths or raw claim tokens. Do not restore generic state
mutation, persist paths, merge run and attempt, retry the handler after Proposal,
or add a second native service.

CODING-1D.3 Snapshot And Locator is complete. Its implementation, real Git
acceptance, Rust CLI evidence, privacy review, and best-practice review are
recorded in:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1403-phase-coding-1d-3-snapshot-and-locator-plan.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1404-phase-coding-1d-3-snapshot-and-locator-completion.md`

The trusted Host now maps an opaque repository identity to a canonical
repository through `LocalRepositoryLocator`. `GitWorktreeIsolationAdapter` and
`WorkspaceGitRuntime` no longer accept caller-selected `repoDir`, worktree
parent, base ref, branch prefix, or process-local ownership maps. The existing
System Service semantic `--workspace-snapshot` helper holds the native shared
mutation handle only while it creates a temporary-index synthetic base and
deterministic runtime ref/worktree. It captures dirty checkout state without
changing user HEAD, branch, index, stash, working tree, or Git config. Release
and a new Host instance re-prove deterministic runtime identity before cleanup.

Temporary index, canonical paths, worktree roots, raw Git diagnostics, and native
helper details remain Host-internal; they must not enter Store, events, receipts,
job results, Product payloads, or ordinary errors. The helper is a concrete
semantic protocol, never a generic shell executor. Special Git objects fail
closed. Do not restore direct `repoDir` task configuration, persisted paths,
owner JSON/mtime heuristics, random recovery roots, or a second native service.

The next route is CODING-1D.4 Child Supervisor And Recovery. It must add process
ownership and explicit recovery policy on top of the now-stable snapshot/resource
identity. It must not reopen locator design, add a Gateway/daemon, or move child
supervision into Storage/Product. Windows Job Object and reparse-point behavior
must be verified by the existing Windows matrix rather than claimed from local
macOS/Linux tests.

The post-CODING-1D.3 review and the frozen CODING-1D.4 route are recorded in:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1405-post-coding-1d-3-review-and-phase-coding-1d-4-child-supervisor-plan.md`

Do not start 1D.4 by adding a PID column, process-name scanning, a Node ownership
Map, or a new daemon. First audit the existing `ExecutionHost` process-group
implementation and make the native child-control protocol and recovery evidence
boundary explicit.

CODING-1D.4 Child Supervisor And Recovery is implementation-complete. Its
completion evidence and the next frozen route are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1406-phase-coding-1d-4-child-supervisor-and-recovery-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1407-post-coding-1d-4-review-and-phase-coding-1d-5-projection-recovery-plan.md`

The existing `wanex-system-service` artifact now owns the concrete semantic
`--workspace-child` helper. The trusted Host starts one helper per execution,
binds it to `runId + attemptId + childId + claimTokenSha256`, and receives exact
ready/output/terminal evidence. POSIX uses a process group; Windows uses a Job
Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; control-pipe EOF cleans the
owned tree. Output is bounded and split into fixed-size protocol frames. Do not
replace this with PID scanning, command-line matching, a process Map, a generic
shell RPC, or another daemon/binary.

`NodeExecutionHost` keeps direct execution only for explicitly trusted short-lived
Host paths. Workspace task execution receives a claim-bound supervisor Host when
configured. A started child whose cleanup or terminal evidence is ambiguous is a
hard recovery boundary: the handler cannot catch the exception and continue to
collect or release writable state. Such a task enters `attention`, produces no
ChangeSet/Proposal, and retains its writable worktree. Expired `preparing`,
`active`, and `collecting` tasks are not automatically rerun. `proposed` and
`releasing` recovery only retries deterministic durable release; it never reruns
the handler. Exact per-run recovery uses `runtime.recoverTask({ runId })`;
bounded Host admission uses the 1D.5 API below.

CODING-1D.5 Workspace Projection And Recovery Admission is locally complete.
Its completion evidence and the post-CODING-1D route are:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1408-phase-coding-1d-5-projection-recovery-admission-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1409-post-coding-1d-global-review-and-coding-2-trusted-host-plan.md`

The hand-written line-number `mergeText` heuristic is deleted. Apply is
conservative: exact current-target is already applied, exact current-base may
apply, and every other external edit is a structured conflict. Git projection
accepts only bounded valid UTF-8 text create/update/delete. Binary or invalid
UTF-8, symlink/reparse, gitlink, mode-only, rename/copy, invalid path,
deterministic identity drift, file limit, and read failure produce atomic
structured attention. Writable projection attention creates no partial
ChangeSet/Proposal and retains the worktree.

`WorkspaceTaskRuntime.recoverExpiredTasks` is the one-shot bounded recovery
admission API for a trusted Host. It filters expired runs by opaque workspace
and repository identity, never replays an unproven handler, releases only
durably proposed work, skips healthy owners, and returns only opaque outcomes
and fixed diagnostics. It does not create a timer, polling loop, Gateway, or
daemon. CODING-2 must call it at trusted Host startup/repository-open admission;
do not hide repeated scans in every task hot path.

Local evidence now passes Rust formatting, 9 library + 5 binary tests, 119
System Service tests, 17 CLI integration tests, Runtime 285 tests, Storage 80
tests, Workspace 100 tests, Eval Harness 17 tests, storage RPC generation and
schema policy, structure/public/facade audits, SDK API reports, and the real
multi-agent worktree conflict scenario. One platform-conditioned Runtime test
is skipped on macOS. This local run still does not claim Windows Job Object,
reparse point, worktree release, or media suspension acceptance.

The first consolidated submission `1a5430f` ran as GitHub Actions
`32339366184` and exposed three verification defects: a 30-second cold Windows
native fixture budget, a fixed-delay darwin-x64 cancellation race, and stale
tracked SDK API reports hidden by an existing local `target/`. The complete
batched correction and local evidence are recorded in:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1410-coding-1d-cross-platform-ci-correction-batch.md`

The corrected native fixture keeps its real compiler/executable assertions
with a test-specific bound; cancellation now waits for explicit child-start
evidence; SDK API evidence is regenerated only after a fresh staging build.
The public `api:sdk` and `api:sdk:update` commands enforce that build-before-
report order. Do not invoke the low-level report generator as standalone
release evidence, treat an existing `target/` as proof, increase the global
test timeout, or push one CI diagnosis at a time.

The follow-up run `32344967671` stopped on every target at one common false
positive in the workspace hygiene audit: the policy treated every
`process.argv[1]` access as manual ESM main detection. The policy now uses the
TypeScript AST and rejects only equality comparisons whose expression contains
both `import.meta.url` and the argv entry path. Legitimate CLI/child argument
access remains allowed and has an explicit regression test. Do not restore a
token-only ban or rewrite valid callers merely to evade an audit pattern.

Run `32345578013` passed the corrected hygiene policy on all four targets and
passed the clean SDK/API proof on Linux. Its remaining failures are one batched
cross-platform verification correction, documented in `1410`: Rust 1.96 Clippy
cleanup on both macOS targets; Windows Runtime tests changed from fixed delays,
shared Store state, and background eventually polling to exact PID/settlement
evidence; and Linux installed TUI proof now runs inside a CI-only session D-Bus
with the real GNOME Secret Service backend, following `@napi-rs/keyring` upstream
CI. The TUI double-failure diagnostic now exposes both redacted proof and cleanup
messages. Do not replace the real credential backend with an in-memory test
store, restore fixed sleeps, raise global timeouts, or push partial diagnoses.
The consolidated correction now passes all 20 TypeScript project checks, the
complete low-concurrency package test suite, System Service 9 + 5 + 119 + 17
tests and all-target Clippy, the real installed darwin-arm64 TUI proof, and all
relevant structure/distribution/facade/storage audits locally. Linux Secret
Service and Windows process behavior remain evidence owned by the next single
matrix run, not by macOS inference.

Run `32349107416` for commit `7f8cbd7` made darwin-arm64 and darwin-x64 fully
green. Linux completed full verify, clean SDK/API, external consumer, and real
Secret Service cleanup before its installed TUI proof exited because the proof
used BSD/macOS `/usr/bin/script` argument syntax on util-linux. Windows reached
one remaining Runtime failure: the control-pipe EOF test duplicated descendant
startup evidence and timed out waiting for its PID fixture. The final local
batch removes that coupling: EOF now proves only exact ready -> pipe close ->
`pipe_eof + cleanup completed`, while adjacent timeout/cancellation tests retain
real descendant cleanup coverage. Installed POSIX TUI proof now uses Expect's
own PTY and `log_user 0` plus `log_file -a`, so a complete audit transcript is
written without exposing terminal output to CI stdout. Runtime 285 + 1 skip,
System Service 9 + 5 + 119 + 17, all-target Clippy, TUI script tests, real
installed darwin-arm64 proof, workspace hygiene, and structure audit all pass
locally. Do not restore PID startup coupling in the EOF test, wait for a
nonexistent empty output frame, branch on `script` dialects, or enable terminal
logging in CI.

Run `32351855394` for commit `31e0f05` confirmed the EOF, Clippy, Linux Secret
Service, and Expect-native PTY corrections: darwin-arm64 was green, Linux
completed functional verify and installed TUI proof, and Windows Runtime
completed 285 tests plus one platform skip. Its remaining failures were
diagnosed together and corrected locally: direct cancellation now uses the
product-level 250ms grace instead of a 20ms race budget; the Windows Local Host
demo test models Node's forced SIGTERM exit separately from the POSIX graceful
handler; and MCP SDK 1.30 plus seven patched dependency overrides remove all
production and complete JavaScript audit findings. Local Runtime 285, Local
Host 158, MCP checks/tests, 20-run cancellation stress, security audits,
structure, public contracts, and hygiene all pass. Do not turn the Windows
signal result into a fake POSIX success, lower audit severity, or add an audit
ignore. CODING-2 remains blocked until the next single four-platform matrix is
green.

Run `32354481122` for commit `a3381b9` failed all four verify jobs. macOS ARM64,
macOS x64, and Linux stopped at the same exact facade baseline drift after the
security dependency update (`runtime 507416`, `app 1420560`); the tracked
baseline was regenerated to those measurements without increasing a tolerance
or changing the forbidden closure. Windows reached the Workspace package, but
all Git snapshot cases collapsed to `WorkspaceSnapshotHelperError:
workspace snapshot helper failed` because the TypeScript snapshot client dropped
native stderr. The client now retains a bounded 8 KiB diagnostic and includes
the exit status, with a regression test. The next matrix must expose the actual
Windows Git error; do not treat the diagnostic change as a Windows fix, do not
skip Workspace tests, and do not push a platform-specific correction. CODING-2
remains blocked until one consolidated matrix passes all four targets.

The next route is CODING-2 Trusted Coding Host Composition, beginning with an
entry and static-closure audit. Do not start CODING-2 implementation or Coding
UI until the corrected CODING-1D submission passes linux-x64, darwin-arm64,
darwin-x64, and win32-x64. To conserve private GitHub Actions minutes, finish
and verify a complete local batch before each push; never use one commit per CI
diagnosis.
