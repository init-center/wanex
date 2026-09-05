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

## Authoritative Current Route (2026-09-05)

Route 8A Desktop Connection And First-Run Functional Completion is complete
at the source and Remote Host contract boundary. Its evidence is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1536-route-8a-desktop-connection-and-first-run-completion.md`

Route 8B Packaged Remote Desktop Acceptance is complete. The real installed
Electron package now proves visible Remote Profile creation, OS credential
storage, localhost TLS Remote Coding, opaque server-owned project selection,
the shared Coding workbench, Profile and connection retirement, immutable
package resources, and deterministic process cleanup. Its plan and completion
evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1537-route-8b-packaged-remote-desktop-acceptance-plan.md`


`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1538-route-8b-packaged-remote-desktop-acceptance-completion.md`

Route 9A: Desktop Product Experience is complete on macOS arm64. Its
implementation and packaged proof evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1541-route-9a-desktop-experience-completion.md`

The route plan and audit remain recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1539-post-route-8b-review-and-route-9a-desktop-product-experience-plan.md`

Route 9A froze lower layers and improved the real Desktop information
architecture, visual hierarchy, contextual workflows, accessibility, and
normal/narrow behavior. It added no package, schema, Gateway, generic facade,
compatibility selector, second renderer, or framework-derived product identity.
Resource/Media expansion, mobile Device Capability Host, account sync, and
broader upper applications remain separate product decisions.

Route 9B: Desktop Distribution Readiness is complete. Its frozen plan is
recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1542-post-route-9a-architecture-review-and-route-9b-distribution-readiness-plan.md`

Route 9B owned reproducible platform packaging and CI-hosted installed proofs.
The broad `pnpm verify` source gate ran once on Linux; target jobs ran focused
native/TUI/Desktop proofs. The Desktop target receipt was
`target/distribution/desktop/desktop-distribution-receipt.json`. The route did
not add a Gateway, second Renderer, Store, transport, protocol command, schema
version, compatibility path, or examples to the production dependency
closure.

Route 9B is complete in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1557-route-9b-cross-platform-distribution-completion.md`

Route 10: Provider Product Readiness is complete. Its implementation and
verification evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1560-route-10-provider-product-readiness-completion.md`

The route proved the existing OpenAI-compatible and Anthropic Messages
adapters through the real Assistant Host/Web product path using deterministic
local HTTP fixtures. It covered trusted secret resolution, Anthropic system
context projection, successful streaming, durable operation settlement,
secret isolation, and output-after-disconnect recovery. It added no Provider
package, Gateway, schema version, compatibility alias, paid/live CI call, or
mechanical package split.

Route 11: Media Product Readiness is complete. Its frozen plan and completion
evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1561-post-route-10-architecture-review-and-route-11-media-product-readiness-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1562-route-11-media-product-readiness-completion.md`

The route proves the existing image-generation adapter, durable Resource
identity, bounded Host HTTP delivery, capability admission, and Provider
rejection through one deterministic Assistant Host/Product journey. It also
corrects `assistantText` to contain assistant text parts rather than flattened
Tool/resource transcript markers. It added no Gateway, second resource model,
schema version, compatibility alias, live Provider call, or package split.

The next route is **Route 12: MCP Tool Product Readiness**, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1563-post-route-11-architecture-review-and-route-12-mcp-product-readiness-plan.md`

Route 12 must connect the existing official MCP SDK adapter to the real
Assistant Host/Product path while keeping MCP optional and Host-owned. Runtime
and App continue to see only ordinary Tool registries and binding evidence.
Configuration must be revisioned, credentials must stay outside SQLite,
reloads must preserve an admitted Turn's Tool generation, and Host shutdown
must leave no client, listener, or child process. Do not add a Gateway, MCP
Session concept, package, schema version, compatibility alias, generic
composition facade, default Runtime/App dependency, or unbounded reconnect
loop.

Route 12A MCP Contract And Lifecycle is complete. Its audit and completion
evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1564-route-12a-mcp-contract-and-lifecycle-audit.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1565-route-12a-mcp-contract-and-lifecycle-completion.md`

The next stage is **Route 12B: Trusted Assistant Host Composition**, refined
and frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1566-post-route-12a-review-and-route-12b-trusted-host-composition-plan.md`

Route 12B must add the existing optional `@wanex/mcp` dependency only to the
concrete Assistant Host, load strict revisioned definitions, isolate server
failure, namespace Tools, and preserve exact admitted-Turn generations. Audit
the admission resolver lifecycle before implementing retirement. Do not use a
timing grace period, permanent append-only clients, a generic composition
framework, Renderer polling, or an MCP concept in Runtime/App persistence.

Route 12B.1 Strict Host Startup Composition is complete. Its implementation,
verification, and architecture review are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1567-route-12b-1-strict-host-startup-composition-completion.md`

The next stage is **Route 12B.2: Exact Turn Generation Lifecycle**, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1568-route-12b-2-exact-turn-generation-lifecycle-plan.md`

Route 12C MCP Product Management is complete. Its completion evidence is
recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1571-route-12c-mcp-management-completion.md`

The Host now owns revisioned MCP configuration mutations, safe status
projection, explicit reload, and generation-aware lifecycle while Runtime and
App remain MCP-neutral. Invalid stored definitions retain a safe revision for
repair/removal. The raw trusted management port is not a Renderer protocol.

Route 12D: MCP Settings And Product Acceptance is complete. Its frozen plan
and completion evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1572-post-route-12c-architecture-review-and-route-12d-mcp-settings-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1573-route-12d-mcp-settings-and-product-acceptance-completion.md`

The constrained product settings path now owns write-only credential setup,
exact-CAS management, authenticated strict Web transport, compact Settings UI,
and deterministic stdio/Streamable HTTP product acceptance. Raw MCP
definitions and management remain Host-internal; Runtime, App, Protocol,
Storage, and the generic Shell remain MCP-neutral. Do not add a generic JSON
editor, literal credential values, polling/reconnect loops, compatibility
paths, or mechanically expand into MCP prompts/resources/elicitation.

The post-Route-12D architecture and product-gap review is complete. It selected
**Route 13: Deployable Agent Host Server**, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1574-post-route-12d-architecture-review-and-route-13-deployable-agent-host-server-plan.md`

Route 13A: Server Boundary And Shared Ownership Foundation is complete. Its
implementation, distribution-audit correction, verification, and architecture
review are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1576-route-13a-server-shared-ownership-foundation-completion.md`

Route 13B: Authenticated Assistant Endpoint And Operations is complete. Its
implementation, real HTTPS listener acceptance, replay/idempotency correction,
subject isolation, and cleanup evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1578-route-13b-authenticated-assistant-server-completion.md`

Route 13C.1: Trusted Catalog And Borrowed Coding Composition is complete. Its
frozen plan and completion evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1579-post-route-13b-architecture-review-and-route-13c-server-coding-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1580-route-13c-1-trusted-catalog-and-coding-composition-completion.md`

The Server now owns a strict trusted repository catalog and one Coding Host
borrowing the Server-owned Store and credential resolver. It opens every
configured repository before readiness, exposes only canonical opaque project
identity, and closes Coding before Assistant and the Store. Route 13C.1 adds no
Coding network endpoint.

Route 13C.2: Single-Listener Multi-Domain Admission is complete. Its frozen
plan and completion evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1581-route-13c-2-single-listener-domain-admission-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1582-route-13c-2-single-listener-domain-admission-completion.md`

Route 13C.3: Remote Coding Execution Acceptance is complete. Its frozen plan
and completion evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1583-route-13c-3-remote-coding-execution-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1584-route-13c-3-remote-coding-execution-completion.md`

It proves the complete typed remote Coding journey against the real Server,
Store, System Service, Git repository, and deterministic Provider, including
durable review/apply/undo and restart recovery.

Route 13D.1: Headless Server Process Entry and Route 13D.2: Headless Server
Distribution Artifact are complete. Their completion evidence is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1586-route-13d-1-headless-server-process-completion.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1588-route-13d-2-headless-server-distribution-artifact-completion.md`

The Server now has one strict `wanex-server` executable entrypoint with
external JSON configuration, TLS files, process-only bearer authentication,
environment-backed secret resolution, real native-service startup, and signal
driven graceful close. A clean assembled artifact now bundles internal
runtime code, declares only the necessary dynamic third-party runtime files,
resolves the adjacent native manifest, and passes a real clean-directory
startup/close proof. The next stage is **Route 13D.3: Packaged Desktop Server
Composition**, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1589-route-13d-3-packaged-desktop-server-composition-plan.md`

Route 13D.3 must prove that installed Electron Desktop starts and controls the
real Server artifact through the existing typed Assistant/Coding Host clients,
with one lifecycle owner, deterministic cleanup, restart recovery, and no
duplicate runtime/native payload. Do not add a Gateway, a second listener,
client-selected paths, or a compatibility layer.

The completed Route 10 plan remains recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1558-post-route-9b-architecture-review-and-route-10-provider-product-readiness-plan.md`

Route 10 moved the project from packaging evidence to a provider-backed
product vertical slice. Its frozen scope and acceptance criteria are in the
plan above; Route 10 is complete and Route 11 is now authoritative.

Route 9B.1 Platform Receipt And Focused Gate is complete for its implementation
slice. Its evidence is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1544-route-9b-1-platform-receipt-and-focused-gate-completion.md`

The first Route 9B.2 correction batch is complete locally and recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1546-route-9b-2-cross-platform-corrections.md`

It fixed the Desktop `window-all-closed` shutdown race that could suppress a
Windows proof receipt, and added the reviewed `/usr/local` Homebrew execution
roots needed by Intel macOS Seatbelt Git. At that point the local
Desktop/Runtime tests, installed proof, and macOS arm64 distribution audit
passed. The then-required hosted receipts are now complete in 1557. The
historical next-slice plan was:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1545-route-9b-2-windows-hosted-installed-proof-plan.md`

The next Windows run reached the installed local Coding journey but timed out
before Provider dispatch. Its local observability correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1547-route-9b-2-windows-coding-failure-observability.md`

Hosted run `33530671319` then reached Provider dispatch and approval but failed
before Tool-result continuation. The bounded Tool/Provider/Task/Job/Turn
failure evidence and local verification are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1548-route-9b-2-windows-post-approval-failure-diagnostics.md`

The Coding Host exposed this only to its trusted owner, and failed packaged
Coding proofs retained only a bounded, path-free projection. This paragraph
records the pre-1557 diagnostic policy: no guessed functional fix, proof
timeout increase, retry, Renderer/protocol diagnostic, or Windows-only
behavior was added. The hosted matrix subsequently identified and closed the
queue-ownership boundary described below.

The follow-up Coding integration boundary correction and the verification-order
review are complete locally in:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1550-route-9b-2-coding-integration-test-boundary-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1551-route-9b-2-verification-order-and-growth-gate-review.md`

The first records the explicit 30-second Coding integration-test budget and the
reviewed Runtime execution-stage diagnostic facade growth. The second moves
cheap contract and facade gates ahead of expensive integration proofs and
records why the exact facade ratchet remains fail-closed.

The Runtime queue-routing correction is complete locally and its Windows hosted
installed proof is complete. The implementation is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1555-route-9b-2-runtime-queue-routing-completion.md`

The Windows hosted evidence is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1556-route-9b-2-windows-hosted-installed-proof-completion.md`

It fixes the shared-Store ownership race in which an Assistant Host could
claim a Coding `session.turn` before the Coding Host invoked its Provider. The
Scheduler now persists a validated queue, Workers claim only their configured
queue, Assistant uses `default`, and Coding uses the stable `coding` route.
The channel repository reuses the canonical Scheduler Job projection, and the
strict schema/API/fixture updates are complete. `pnpm verify`, all Rust tests,
clippy, local package proofs, and the hosted Windows `win32-x64` installed
distribution proof pass. The exact facade baseline update is reviewed and
records only the required Runtime queue-routing growth; dependency closures and
input counts are unchanged.

The first hosted attempt was globally marked failed only because the unrelated
Intel macOS job could not download the Electron artifact from `github.com:443`
within 10 seconds. A targeted rerun of that failed job on the same commit
passed every Intel macOS step, including Electron preparation, installed
Desktop proof, distribution audit, native release, and SDK consumers. The
second attempt made the complete Route 9B workflow green. This was an
infrastructure availability event, not a product defect; no timeout, retry,
diagnostic, compatibility, or platform-specific workaround was added.

Route 5E local Host consumers, durable Coding admission/observation, and
cross-platform local transport are complete. The evidence is recorded in:

- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1498-route-5e-4-cross-platform-local-host-transport-completion.md`
- `/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1495-route-5e-3d-coding-start-host-exposure-completion.md`

Route 5F Remote Host security, request/response transport, authenticated SSE,
TLS/domain conformance, and operational lifecycle are complete. Remote Host
remains a connection boundary, not a Gateway, account service, store selector,
or resource server. Its final evidence is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1510-route-5f-5-remote-host-operations-completion.md`

The next route is **Route 5G: Remote Assistant Product Journey**, frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1511-post-route-5f-5-architecture-review-and-route-5g-remote-product-journey-plan.md`

Route 5G-1 Remote Assistant Consumer Contract is complete in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1512-route-5g-1-remote-assistant-consumer-contract-completion.md`

Route 5G-2 Remote Assistant Journey And Recovery is complete in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1513-route-5g-2-remote-assistant-journey-and-recovery-completion.md`

Route 5G-3 Remote Coding Product Journey is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1514-post-route-5g-2-architecture-review-and-route-5g-3-remote-coding-plan.md`

It must prove server-owned project/filesystem authority, typed remote Coding
operations, duplicate Turn admission, cancellation/approval/recovery,
HTTP/SSE reconnect and canonical reads, multi-session concurrency, and drain.
Use existing application/host boundaries first. Do not implement remote
Resource/Media in parallel or add a Gateway, new transport, generic
composition package, client-selected paths/environments, compatibility
aliases, or force trusted Desktop/TUI consumers through Remote Host without a
concrete consumer and deployment threat model.

Route 5G-3A Remote Coding Consumer Contract is complete in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1515-route-5g-3a-remote-coding-consumer-contract-completion.md`

Route 5G-3B Remote Coding TLS Journey is complete in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1517-route-5g-3b-remote-coding-tls-journey-completion.md`

The next step is Route 5G-3C: Remote Coding concurrency and shutdown review.
It must prove multi-client/multi-session behavior, the single-active-Turn
invariant per Session, and Workspace ownership during drain/interruption. Do
not mark the full Remote Coding route complete after 5G-3B; the concurrency
and shutdown proof is still pending.

The route records below are historical evidence and do not override the
authoritative current route above.

## Historical Route Records

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
`AssistantWebApp` Team mutation methods, foreign-principal reads, arbitrary active
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

The next route is CODING-2 Trusted Coding Composition, beginning with an
entry and static-closure audit. Do not start CODING-2 implementation or Coding
UI until the corrected CODING-1D submission passes linux-x64, darwin-arm64,
darwin-x64, and win32-x64. To conserve private GitHub Actions minutes, finish
and verify a complete local batch before each push; never use one commit per CI
diagnosis.

Run `32399476820` for commit `61a1585` passed linux-x64, darwin-arm64, and
darwin-x64, but Windows failed with the now-visible native Git diagnostic:
`fatal: could not create leading directories of '//?/C:/.../.git': Invalid
argument`. The root cause is the Windows extended path prefix emitted by Rust
`fs::canonicalize` being passed directly to `git worktree add` and `remove`.
The correction keeps canonical extended paths for internal identity and long
path handling, but strips the prefix only at the Git argument and helper-frame
boundary, normalizes Git worktree-list comparisons, and uses the same boundary
format for `GIT_INDEX_FILE`. Rust path-format tests and the Workspace package
tests pass locally. Do not treat this local macOS result as Windows proof; the
next single matrix must validate the correction on win32-x64 before CODING-2.

Run `32402030353` validated the Windows path-boundary correction: the Windows
extended-prefix tests, 119 system-service tests, and 16 CLI tests reached the
snapshot integration successfully. The remaining Windows failure was the
snapshot worktree being checked out with CRLF under the runner's Git
`core.autocrlf=true`, while the committed snapshot bytes were LF. This is a
production correctness issue, not a platform-specific test expectation; the
native Git command boundary now sets `core.autocrlf=false` for snapshot
operations so a worktree preserves the exact committed bytes. Do not change the
test to accept platform-dependent line endings, do not mask the setting through
CI configuration, and do not start CODING-2 until the next matrix is green.

Run `32404401225` passed Linux and darwin-arm64, but exposed two independent
test/recovery defects: darwin-x64's expired-run admission test guessed
`1100ms` instead of waiting for the persisted lease expiry, and Windows reached
the durable-release recovery path but returned a failed receipt without showing
the underlying error. The tests now wait from the stored `leaseExpiresAt` with a
small explicit boundary and include the complete failed recovery receipt in the
test error. This is diagnostic and determinism work, not a relaxed assertion;
the next matrix must identify and resolve the Windows release error before
CODING-2.

Run `32418243274` passed Linux, darwin-arm64, and darwin-x64. Windows Workspace
tests passed, including the recovery cases, but Windows Clippy failed on an
unnecessary `return` in `crates/system-service/src/workspace_child.rs:667`.
The local fix makes the Windows branch use its final `Ok(...)` expression and
does not change Job Object ownership or child cleanup. This is a platform lint
correction, not a production behavior change. The next single four-platform
matrix is still required; do not start CODING-2 before all four targets pass.

Run `32435419578` passed Linux, darwin-arm64, and darwin-x64. Windows passed the
Clippy correction and reached the Workspace recovery suite, where the durable
release case exposed a real lease lifecycle race: `WorkspaceTaskLeaseRenewal`
could reschedule after `stop()` if a renewal RPC was already in flight. The
renewal now records its in-flight Promise, blocks scheduling after stop, and
drains before Runtime/recovery returns. The focused regression passed, the full
Workspace package passed 14 files / 102 tests, and the durable-release case
passed 10 serial repetitions locally. This is a shared lifecycle correction,
not a Windows-only test relaxation. A new four-platform matrix is still
required; do not start CODING-2 before all four targets pass.

The twelfth TUI Distribution artifact-input correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1417-coding-1d-twelfth-tui-artifact-input-correction.md`

Run `32437363951` passed all four Verify jobs and Packed Core Node 24, but every
Distribution job failed because `proof:tui` implicitly required a Debug native
binary that only existed in the separate Verify checkout. Distribution now
passes `--native-artifact-dir target/distribution/native`, so the installed TUI
proof consumes the Release artifact created by that same job. The local
darwin-arm64 artifact proof passed after rebuilding the artifact from current
sources. Never fix this class of issue by adding a duplicate Debug build,
accepting stale `target/` state, or pushing one platform at a time; complete a
full local batch and trigger one consolidated matrix. CODING-2 remains blocked
until all four Distribution targets are green.

The thirteenth recovery-backlog fixture correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1418-coding-1d-thirteenth-recovery-backlog-expiry-fixture-correction.md`

Run `32445328333` passed Linux and both macOS Verify jobs, but Windows exposed
that the bounded-backlog fixture waited only for the first of two sequentially
created leases. The second Storage RPC can complete materially later on
Windows, so the second lease was still healthy and production correctly
reported no remaining expired run. The fixture now reads both durable
`leaseExpiresAt` values and waits until the later one has passed. Do not change
recovery admission, add a fixed delay, or weaken the backlog assertion for this
failure. The targeted case passed 10 serial repetitions and the full Workspace
package passed 14 files / 102 tests locally. Distribution and Packed Core were
skipped by the failed Verify gate; CODING-2 remains blocked until one
consolidated matrix is fully green.

The fourteenth native-cancellation readiness correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1419-coding-1d-fourteenth-native-cancellation-readiness-fixture-correction.md`

Run `32446772959` passed Windows, Linux, and darwin-arm64 Verify. Windows passed
the complete Workspace package, confirming the thirteenth correction. The only
failure was darwin-x64 native process-tree cancellation: a fixed 300ms timer
could abort before the fixture published PID output, even though cancellation
and cleanup completed. The fixture now atomically publishes root/grandchild PID
readiness, and the test aborts only after reading that evidence. Do not add a
longer sleep, parse output that may not have been emitted before cancellation,
or weaken descendant cleanup assertions. The targeted test passed 20 serial
repetitions, the full Runtime package passed 285 tests plus one platform skip,
and native workspace-child tests and all-targets Clippy passed locally.
Distribution and Packed Core were skipped by the Verify gate; CODING-2 remains
blocked until the next single consolidated matrix is fully green.

The fifteenth Distribution correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1420-coding-1d-fifteenth-distribution-tool-artifact-and-footprint-correction.md`

The native Release profile uses fat LTO and one codegen unit. Product Desktop
must prepare Electron explicitly with `pnpm --filter @wanex/desktop
prepare:electron` before `proof:desktop`; the preparation reads the installed
Electron checksum table, uses bounded official artifact download, verifies
SHA-256, atomically materializes the target ZIP under
`target/tool-cache/electron`, and writes a receipt under
`target/distribution/product-desktop`. Desktop packaging must consume only
that verified canonical path and must not recursively search user caches or
let `@electron/packager` download implicitly. The local darwin-arm64
preparation/reuse path, Desktop typecheck, and 45 Desktop tests pass. CODING-2
remains blocked until the next single four-platform matrix is fully green.

The first local packaged Desktop run after the fifteenth correction passed the
Electron artifact boundary and exposed one proof-only readiness race. Product
enters Settings focus on `requestAnimationFrame`; Desktop proof now waits for
the existing dialog-focus condition before sampling it, matching the Web
interaction contract. Do not replace this with a fixed delay or weaken the
focus assertion.

Run `32454998498` for commit `e0022ed` passed all four Verify jobs, Packed Core
Node 24, every native staging/runtime proof, every installed TUI proof, and
explicit Electron preparation on all three Desktop targets. Linux completed
Distribution. darwin-x64 then sampled the normal Composer before post-resize
layout settlement; darwin-arm64 and Windows timed out because narrow drawer
reopening compared Chromium's exact serialized transform matrix. Desktop proof
now waits for the exact normal/narrow viewport, requires the Composer and drawer
to fit the viewport, and checks drawer state, visibility, and interactivity
instead of transform serialization. Every wait has a diagnostic stage name.
Do not restore an exact CSS matrix assertion, add a fixed sleep, increase the
five-second condition budget, retry a failed proof, or weaken visibility.

Desktop typecheck, 45 tests, two consecutive complete packaged proofs, and all
four relevant structure/distribution audits pass locally on darwin-arm64. Both
proofs retained five lifecycle samples, complete relaunch/product coverage,
nonblank normal/narrow screenshots, no `EPERM` rename, and no process residue.
This is local evidence only. Submit the correction once and let one complete
matrix own darwin-x64 and win32-x64 acceptance; CODING-2 remains blocked until
that matrix is fully green.

Run `32462288436` for commit `5eabac2` passed every Verify job, Packed Core Node
24, Linux Distribution, all native/TUI proofs, Desktop checks/tests, and
Electron preparation. The three Desktop proofs still failed at one normal and
two narrow visual phases. Their runtime receipts proved that Renderer wait
exceptions crossed `executeJavaScript()` before becoming the typed visual
error, so the named stage was lost; the temporary receipt was then deleted
before artifact upload. The sixteenth correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1421-coding-1d-sixteenth-desktop-visual-failure-evidence-correction.md`

Visual proof execution now returns a discriminated result inside the Renderer.
Main accepts only allowlisted stages and reconstructed finite geometry/state
evidence. The outer proof writes a bounded, secret-free failure report to the
existing `product-desktop-report.json` path before deleting its proof root.
The workflow uploads the exact normal and narrow screenshot filenames; do not
restore the nonexistent singular `product-desktop-proof.png` path.
Do not restore raw Renderer messages, persist the proof root, accept arbitrary
stages, add retries/fixed delays, increase the condition timeout, or alter CSS
without evidence. Visual contracts have a dedicated source owner; do not move
them back into the general proof contract or add compatibility re-exports.

Desktop typecheck, 48 tests, three complete packaged proofs during the
correction, workspace hygiene, structure, distribution, distribution graph,
and distribution footprint pass locally. The final structure proof retained
five normal/narrow lifecycle samples, all 16 relaunch journeys, nonblank
screenshots, no `EPERM` rename, and no process residue. This remains local
darwin-arm64 evidence. Make one consolidated submission only; CODING-2 stays
blocked until linux-x64, darwin-arm64, darwin-x64, and win32-x64 all pass.

Run `32648400290` passed every non-Desktop gate. Its darwin-arm64 exact-height
and darwin-x64 drawer-focus failures were temporary UI proof requirements, not
distribution defects; the Product UI will be reconstructed. Windows stopped
during Provider fallback and therefore required functional evidence. The
seventeenth correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1422-coding-1d-seventeenth-desktop-core-proof-boundary-correction.md`

The release-blocking Desktop proof now owns packaging, startup, Provider and
conversation behavior, Product workflows, privacy, performance, shutdown, and
process cleanup. It still captures normal/narrow nonblank screenshots, but it
does not gate on exact requested dimensions, temporary layout, drawer state,
focus, or styling. The old visual-accessibility proof contracts were deleted;
do not restore them or add compatibility aliases. The rebuilt UI must freeze a
new accessibility/visual contract from its own design.

Failed Desktop reports retain only allowlisted Renderer stages/counts/booleans
and at most 64 Provider request kind/authorization summaries. Never retain raw
request bodies, model names, IDs, paths, HTML, messages, credentials, or error
text. Provider fallback has a presentation-independent real Local Host
regression: active removal must immediately allow the same Session to complete
through the deterministic survivor. It passed six focused runs, the complete
159-test Local Host suite, and the complete darwin-arm64 packaged proof. No
Runtime change was justified. Submit one consolidated matrix; do not speculate
from a platform timeout or push one diagnostic commit at a time. CODING-2 stays
blocked until all four Verify/Distribution targets and Packed Core are green.

Run `32653223820` for commit `3042c10` passed Verify on darwin-arm64,
linux-x64, and win32-x64. The sole failure was darwin-x64 direct
`NodeExecutionHost`: timeout termination was correct, but cleanup was reported
failed while the native supervisor process-tree cases passed. The eighteenth
correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1423-coding-1d-eighteenth-posix-direct-execution-cleanup-proof-correction.md`

POSIX direct cleanup now owns one absolute deadline and proves final process-group
membership disappearance with `kill(-pgid, 0)` across TERM and forced KILL. A
Node root `close` notification is used for bounded output settlement but cannot
override authoritative group-absence evidence. Intermediate signal errors are
diagnostic unless the group still exists at the deadline. Windows direct
`taskkill` remains bounded and still requires root close; durable Workspace
execution continues to use the native Job Object/process-group supervisor.

Do not restore the second `NodeExecutionHost` cleanup timer, equate stream-close
latency with a live process tree, add a timeout/retry, or move durable Workspace
execution back to the direct Host. Local ARM64 focused stress and Rosetta
darwin-x64 Node 26.7.0 process-tree stress each passed 20 runs; Runtime 288,
Plugin 64, Workspace 102, and Eval Harness 17 tests pass. CODING-2 remains
blocked until the next single consolidated matrix is fully green.

Run `32711691741` for commit `6571f7b` passed all four Verify jobs, Packed Core,
Linux Distribution, and the real darwin-x64 POSIX cleanup regression. The three
remaining Distribution failures were Product-proof readiness defects: TUI sent
F3 while Team canonical refresh was still busy, darwin-x64 clicked a disabled
Provider remove control, and Windows coupled canonical Schedule disable state to
transient feedback text. The nineteenth correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1424-coding-1d-nineteenth-cross-platform-product-readiness-proof-correction.md`

Installed TUI proof must wait for the ready footer before F3, select agents by
stable Session identity, and use explicit CSI-u Escape plus draft echo to prove
composer ownership. Do not restore width-dependent description matching, raw
ESC plus a fixed sleep, or content-only readiness. Desktop Provider proof must
require enabled form/edit/remove controls. Schedule proof must use canonical row
state, inverse toggle command, and released pending controls; transient status
text is not mutation settlement authority.

Desktop 48, Web 132, TUI 106, and TUI script 10 tests pass. The external
installed TUI proof and complete packaged Desktop proof pass locally; the latter
retains five lifecycle samples, complete Provider fallback, five-second Schedule
create/relaunch/disable/remove behavior, no `EPERM` rename, and no process
residue. Structure, public-contract, workspace-hygiene, distribution,
distribution-graph, distribution-footprint, and host-distribution audits pass.
Submit this as one matrix; CODING-2 remains blocked until all four Verify and
Distribution targets plus Packed Core are green.

Run `32717823880` passed all four Verify jobs, Packed Core, Linux Distribution,
and darwin-x64 Distribution. The remaining ARM TUI failure was one monolithic
PTY process exhausting its absolute deadline after Provider lifecycle and
before Team completion. The Windows Desktop failure was a Schedule request
crossing the response-settlement-to-disable window before process shutdown.
The twentieth correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1425-coding-1d-twentieth-product-proof-workflow-isolation-correction.md`

Installed TUI proof now runs Provider lifecycle, coordinated Team, and final
Provider removal as three independently bounded processes over one installed
package and one store. Require process absence and terminal restoration after
each journey, and keep separate transcripts. Do not recombine these workflows,
increase their 90-second budgets, add retries or fixed sleeps, or replace the
shared store with independent fixtures.

Packaged Desktop Schedule proof disables the canonical Schedule while its first
held execution is still active, requires one scheduled user message after two
crossed deadlines, and only then releases the Provider response. Relaunch owns
the second execution after explicit re-enable. Do not allow two creation-step
requests, depend on process shutdown winning the recurrence race, or restore the
obsolete `disabledBeforeShutdown` receipt field. Local Desktop 48 tests, TUI
script 11 tests, external installed TUI proof, and complete packaged Desktop
proof pass. CODING-2 remains blocked until the next single consolidated matrix
passes every target.

Run `32749696752` passed Verify on Linux and both macOS targets. Windows alone
failed `runtime-host.remote-multi-owner` after all eight Providers had entered,
exposing a load-amplification path consistent with the failure: every active
Turn independently polled two durable control tables every 250ms through one
serial remote System Service transport. The twenty-first correction is
recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1426-coding-1d-twenty-first-shared-turn-control-observation-correction.md`

One Runtime owner now shares one event-cursor control observer across all active
Session Turns. Durable cancel/interrupt events are exact local wake hints only;
Runner safe-point reads, leases, and System Service settlement remain
authoritative. Cursor revisions fence overlapping old/new active windows.
Do not restore per-Turn state-table polling, increase remote timeouts, add
retries/fixed sleeps, reduce concurrency, accept fewer workers, or introduce a
second event authority. Focused observer/Host tests pass 31 cases, complete
Runtime passes 292 with one platform skip, Eval Harness passes 17, all 64 Eval
scenarios pass, and four remote multi-owner scenarios pass concurrently. The
reviewed Runtime/App facade ceilings are 511,656/1,424,800 bytes with unchanged
input and workspace-package closures; SDK, packed-consumer, installed TUI,
Rust, structure, public-contract, Storage/RPC, and distribution audits pass.
This local evidence proves and removes the duplicated load but does not claim
the sole Windows failure cause until the next matrix confirms it. CODING-2
remains blocked until that single consolidated matrix is fully green.

Run `32756717815` for commit `92a2061` passed complete Verify on Linux,
darwin-arm64, and darwin-x64. Windows passed all three direct shared-observer
tests but stopped in the new eight-worker Host regression after its decisive
gate had already proved eight active Providers shared one blocked query. The
test incorrectly required the total query count to remain one after releasing
the query and Providers; Windows settlement exceeded one 250ms interval, so
the one shared observer correctly continued sequential observation and reached
10 queries. The twenty-second correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1427-coding-1d-twenty-second-shared-observer-test-lifecycle-correction.md`

Remove only that invalid post-settlement total-count assertion. Retain the
deterministic in-flight sharing assertion and all eight completed-worker
results. Do not increase the interval, add a delay, assert an arbitrary total
query ceiling, or add a Windows branch. The failed Runtime package prevented
the Windows remote multi-owner Eval from running, and the gate skipped Packed
Core and Distribution, so CODING-2 remains blocked until the next single
consolidated matrix passes every target.

Run `32758605271` for commit `4da85fc` passed all four Verify jobs, Packed Core
Node 24, Linux Distribution, and both macOS Distribution targets. Windows
Distribution completed every native, TUI, Desktop, performance, lifecycle,
privacy, and cleanup proof, then failed only the existing physical-size budget:
the current Release native executable was 13,227,008 bytes against the stale
9,600,000-byte ceiling, the packaged native total was 13,227,486 bytes, and
the pinned `@napi-rs/keyring-win32-x64-msvc@1.3.0` binding made the credential
artifact 1,865,549 bytes against the stale 600,000-byte ceiling. This phase
changed only TypeScript Runtime observation code and a test; native and
credential sources were unchanged. The twenty-third correction is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1428-coding-1d-twenty-third-windows-distribution-footprint-reconciliation.md`

The Windows physical budget is reconciled to the measured current release
baseline with the existing approximately 10% headroom policy: 14,600,000
native bytes and 2,100,000 credential bytes. Do not hide the audit, remove
credential verification, package extra files, or change the native build solely
to satisfy an obsolete threshold. The next single consolidated matrix must
confirm the budget and keep CODING-2 blocked until every target is green.

Run `32762783292` for commit `cbbd1d0` passed all four Verify jobs, Packed Core,
Linux/Windows/darwin-x64 Distribution, and every darwin-arm64 functional proof.
darwin-arm64 attempt 1 failed only a non-repeating cold interactive sample at
`3178.1ms` against `3000ms`; attempt 2 passed that metric at `2560.66ms` but
exposed the stale `60ms` warm artifact-verification maximum with a `98.65ms`
sample. Phase PLUGIN-4D had already recorded `75.29ms`, and the current cold
sample reached `100.53ms`. The twenty-fourth reconciliation is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1429-coding-1d-twenty-fourth-darwin-arm64-artifact-verification-budget-reconciliation.md`

The darwin-arm64 artifact-verification maximum is now `120ms`, derived from the
largest reviewed sample plus bounded headroom. Artifact hashing remains
mandatory on every process launch. Do not change the cold interactive budget,
cache or skip verification, add retries, rerun a failed proof to manufacture a
pass, or push this budget/documentation-only correction by itself. CODING-2A
may proceed locally; the next substantive consolidated submission must confirm
the corrected physical budget in the full matrix.

CODING-2A Entry And Closure Audit is complete. Its measured closure evidence,
owner decision, static guard, and CODING-2B frozen scope are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1430-phase-coding-2a-entry-and-closure-audit-completion.md`

Trusted Coding composition will live in one thin private application leaf,
`@wanex/coding`, because repository path trust, optional Workspace/native
closure, and repository/task/process lifecycle are distinct from Runtime/App,
Product/Renderer, CLI interaction, and the existing broad Local Host. Do not
put Workspace into generic Runtime/App/CLI/Product closures, make Local Host a
universal composition package, or move Host path/data ownership into
`@wanex/workspace`. Distribution graph and footprint audits now reject
Workspace in generic cold/slim entries. CODING-2B must implement only trusted
repository open/recovery/close composition; task/Turn/tool binding remains
CODING-2C.

CODING-2B Trusted Repository Lifecycle is complete locally. Its implementation,
ownership, recovery, package-governance, and exact-closure evidence are recorded
in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1431-phase-coding-2b-trusted-repository-lifecycle-completion.md`

The private `@wanex/coding` now canonicalizes trusted absolute Git paths,
derives stable opaque repository/Workspace identities, requires Host data and
the repository to be disjoint in both directions, composes existing Workspace
owners, performs one bounded open-time recovery admission, and closes owned
resources idempotently while preserving injected Storage ownership. Its exact
workspace closure is Coding, Protocol, Runtime, Storage, and Workspace.
Do not expose repository/data/System Service paths, add Product or renderer
state, register tools globally, add a second agent loop, timer, polling path,
Gateway, compatibility alias, or schema in this Host. CODING-2C must begin with
an explicit Tool/Turn binding audit and reuse Runtime session/turn/attempt and
Workspace task/ChangeSet authorities rather than introducing parallel state.

CODING-2C Tool And Turn Binding is complete locally. Its implementation,
cross-owner recovery semantics, privacy proof, admission correction, and
focused verification are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1433-phase-coding-2c-tool-and-turn-binding-completion.md`

Coding now runs each writable Runtime Turn inside one durable Workspace
task and isolated Git worktree. Runtime remains the sole Session/Turn/provider/
Tool authority; Workspace remains the sole task/worktree/ChangeSet/Proposal
authority. Persisted bindings contain only opaque scope/environment identity.
Approval suspension retains the exact worktree, terminal settlement collects
net Git changes, and failed/cancelled changed work becomes an incomplete
Proposal. Open-time task recovery uses durable `jobId` to cancel the exact
orphan Turn. A shared-checkout transaction in `attention` rejects writable
admission with `repository_not_ready`.

Do not restore absolute roots in Tool bindings, accept model-supplied
ChangeSet ids, run a generic competing Runtime worker over the Coding Store,
resume an abandoned worktree by guess, expose shared checkout to Coding Tools,
or add Product/UI state to Coding. The next route is CODING-2D Headless
Vertical Acceptance. It must reuse Workspace Proposal review/apply/undo and
prove a complete open -> Turn -> Proposal -> explicit apply -> explicit undo ->
relaunch journey before any Coding UI begins.

CODING-2D Headless Vertical Acceptance is complete locally. Its trusted review
facade, bounded projections, native Git lock correction, relaunch evidence,
test structure, and verification are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1435-phase-coding-2d-headless-vertical-acceptance-completion.md`

`CodingRepository` now exposes bounded Proposal read/decision/apply/undo
operations while Workspace remains the sole Proposal state machine and
transaction authority. Review and mutation receipts contain portable relative
paths, hashes, bounded previews/items, and omission counts; they never expose
trusted roots or authority objects. Cross-repository access fails closed.

Git workspace snapshot and transaction helpers now share one System Service
OS lock in the Git common directory, including linked worktrees. Non-Git roots
retain the root-local `.wanex` lock. Do not add a process-local checkout mutex,
restore Git-root internal lock files, filter an entire `.wanex` tree from user
changes, or create a second apply/undo path in Coding.

CODING-2 is complete as a headless composition milestone. The next route is
CODING-3 Product Integration planning. It must define one Product/App-facing
repository, Turn progress, approval, Proposal review, apply/undo, cancellation,
and recovery contract before Desktop/TUI UI work. Do not expose Coding,
Storage, Workspace Runtime, absolute paths, claim tokens, or native process
details directly to a renderer, and do not resume package splitting without a
measured owner boundary.

CODING-3A Application Contract Foundation is complete locally. Its package
correction, capability boundary, bounded projections, event semantics,
acceptance evidence, and CODING-3B gate are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1437-phase-coding-3a-application-contract-foundation-completion.md`

`@wanex/coding` is the sole unpublished package identity. Its root exports
only safe Application types/errors; trusted construction is available only
through `@wanex/coding/host`, whose sole startup path is
`startCodingApplication`. Do not restore `@wanex/coding-host`, export the
raw Host constructor, accept renderer-selected paths below the trusted Host,
put Workspace into `@wanex/product`, add a contract-only package without an
independent owner, or turn advisory events into canonical state.

The Coding Application now supports safe project reads, active Turn
start/read/cancel/approval, bounded Proposal review/apply/undo, and bounded
ordered invalidation replay. It does not yet provide durable history after
process replacement. CODING-3B must derive bounded project-scoped Session/Turn
and Proposal recovery projection from canonical Runtime/Workspace persistence.
Use opaque keyset cursors and canonical re-reads; do not add a renderer cache,
offset pagination, polling loop, Gateway, raw diagnostics, or trusted
task/worktree/claim authority to the Application contract.

CODING-3B Durable Projection And Relaunch is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1438-phase-coding-3b-durable-projection-and-relaunch-plan.md`

The pre-implementation audit found that per-input `SessionInputOrigin` cannot
serve as a bounded Session ownership/query partition. Add one neutral immutable
`SessionScope` to Session create/record/list semantics, indexed by exact kind/id.
Coding uses `coding.repository` as data; Protocol/Storage must not interpret
that application value. Keep per-input origin as provenance. Do not implement
project history by globally scanning Sessions, filtering input rows, grouping
Scheduler payloads, or adding a Coding-private index/state table.

Session and Turn history must use compound tie-safe keyset windows. Add exact
bounded Workspace task-id lookup so one Turn page does not issue one Storage
RPC per Turn. Application cursors are versioned, checksummed, and bound to
project/session scope but are never authority. The live operation map remains
only for cancellation/approval; canonical reads must survive Host replacement.

CODING-3B Durable Projection And Relaunch is complete locally. Its canonical
scope/query design, relaunch acceptance, verification evidence, and
best-practice review are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1439-phase-coding-3b-durable-projection-and-relaunch-completion.md`

Sessions now carry an optional immutable generic `SessionScope`; Coding uses
the opaque `coding.repository` kind without teaching Protocol, Storage, or
Runtime what a repository is. Keep `SessionInputOrigin` as per-input
provenance. Do not restore the removed Session-input ownership scan, add a
Coding-private index/table, or use Scheduler payloads as Session ownership.

Project Session and Turn history is bounded and tie-safe. Exact durable Turn
read uses the generic `get-session-turn` Storage command, and Turn pages batch
exact Workspace task ids. Application cursors are versioned, checksummed, and
project/Session-bound but never authority; canonical scope and task evidence
must always be revalidated. Do not replace exact reads with global scans,
offset pagination, one-RPC-per-Turn lookup, or a renderer cache.

The next route is CODING-3C Product Adapter Acceptance, but implementation must
not begin until a separate plan freezes the minimum transcript, transport, and
Desktop/TUI acceptance contract. UI visual polish remains deferred. CODING-3C
must consume the safe `CodingApplication` root, never `@wanex/coding/host`, and
must not add a Gateway, polling loop, presentation database, duplicate state
machine, or package abstraction without two concrete consumers and a measured
owner boundary.

CODING-3C Product Adapter Acceptance is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1440-phase-coding-3c-product-adapter-acceptance-plan.md`

Implement one count- and byte-bounded Coding transcript, one strict correlated
command/event transport, one browser-safe typed client, and message/in-process
acceptance inside the existing `@wanex/coding` owner. Event streams must expose
an instance identity so reconnect can distinguish retained replay from Host
replacement; gaps always settle through canonical rereads. Do not add a
package, Gateway, polling fallback, renderer state store, generic Product edge,
visual UI, compatibility alias, or direct presentation import of
`@wanex/coding/host`.

CODING-3C Product Adapter Acceptance is complete locally. Its transcript,
transport, event-recovery, Desktop/TUI-style acceptance, distribution, and
verification evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1441-phase-coding-3c-product-adapter-acceptance-completion.md`

The safe `@wanex/coding` root now exposes one strict `wanex.coding/1` typed
client over message or in-process transports. Only `@wanex/coding/host` creates
the endpoint holding Application authority. Transcript pages are project- and
Session-scoped, keyset-paged, count/part/UTF-8 bounded, and omit raw Provider,
Tool, execution, path, claim, and native authority. Client response validation
is exact for nested models, finite enums, portable paths, and Resource hashes.

Events remain advisory and are ordered by `(streamId, sequence)`; stream
replacement, retention loss, and cursor-ahead states require canonical rereads.
Do not add polling fallback, a renderer database, durable presentation events,
a Gateway, generic Product dependency, transport compatibility protocol, or a
new package for adapters.

CODING-3 is complete as a product-integration-contract milestone. Stop before
visual Coding UI implementation. The next action is a separate post-CODING-3
architecture and product-entry review; freeze its route before changing code.
Do not assume the existing generic chat Desktop/TUI owners should absorb Coding
or Workspace dependencies without a measured composition and distribution
boundary.

The post-CODING-3 entry audit and CODING-4 route are frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1442-post-coding-3-review-and-coding-4-route-plan.md`

The existing Product/Web/Local Host/Desktop/TUI packages are concrete owners of
the current general chat product, not neutral shells. CODING-4 continues under
the existing `@wanex/coding` product owner unless an independently measured
executable, trust, platform-dependency, or distribution boundary justifies a
new identity. Do not create a generic Desktop shell, Web shell, design-system
package, TUI bridge, or broad multi-product closure speculatively.

CODING-4A Repository Context Admission is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1443-phase-coding-4a-repository-context-admission-plan.md`

Each writable Coding Turn must prepare immutable project instructions and lazy
Skills from its exact isolated Workspace task root before Runtime admission.
Project context is trusted only after trusted project open, refreshes for the
next Turn without a watcher/restart, and never enters the durable Coding
environment or Application read model as paths/bodies. Reuse Runtime context
owners and compose scoped Workspace Tools under the Coding Tool policy. Add no
package, schema, RPC, polling loop, compatibility option, or UI in CODING-4A.

CODING-4A Repository Context Admission is complete locally. Its implementation,
durable privacy correction, test evidence, and best-practice review are
recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1444-phase-coding-4a-repository-context-admission-completion.md`

Each writable Turn now prepares trusted hierarchical `AGENTS.md` and lazy
Skills from its exact isolated Workspace task root. Context changes apply to a
later Turn without Host restart; an admitted Turn keeps its immutable context.
The durable binding field is `contextEvidence`, containing only bounded state,
source counts, and full SHA-256 digests. Do not restore `contextSnapshot`,
persist instruction/Skill paths or bodies, expose source paths in catalog
replay metadata, add a watcher, or create a second context implementation.

The next route is CODING-4B Live Turn Projection. It must first freeze a
bounded transient projection contract for visible assistant text and safe
structured activity. Provider chunks are not durable state. Hidden reasoning,
raw Tool arguments/results, partial Tool JSON, trusted paths, and native
authority remain excluded from the Application/transport surface. Loss or
replacement settles through canonical rereads; no polling fallback, event
database, or compatibility protocol is allowed.

CODING-4B Live Turn Projection is complete locally. Its implementation and
verification evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1446-phase-coding-4b-transient-live-turn-projection-completion.md`

The Coding Application now exposes only a bounded, memory-only live Turn
projection and invalidation event. It reuses the existing Provider observer;
it must not grow a second Provider loop, live database, polling fallback,
Gateway, renderer, or compatibility alias.

The post-CODING-4B review and CODING-4C route are frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1447-post-coding-4b-review-and-coding-4c-plan.md`

CODING-4C Trusted Local Product Composition is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1448-phase-coding-4c-trusted-local-product-composition-plan.md`

Coding now has one trusted `resolveModelEndpointId` composition port. When
provided, it is called once per new Turn with opaque Turn identity and an
optional requested endpoint. The returned endpoint ID is resolved from
canonical Storage by Runtime and frozen into that Turn's execution binding;
the next Turn can therefore observe configuration changes without restarting
the Host, while an admitted Turn remains immutable. Do not combine this port
with the static `modelEndpointId`, pass endpoint objects or credentials
through it, expose it to a renderer, or add a duplicate Provider settings
owner. Direct Provider injection remains an explicit trusted test/fallback
mode. No watcher, polling loop, Gateway, package, schema, or compatibility
alias is justified by this phase.

CODING-4C Trusted Local Product Composition is complete locally. Its
implementation, dynamic-selection tests, and best-practice review are
recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1449-phase-coding-4c-trusted-local-product-composition-completion.md`

The review after CODING-4C initially proposed an independent CODING-4D
workbench. That proposal is retained below as historical evidence and is
superseded before implementation. Its safety requirements still apply: any
Coding workbench consumes only the safe `@wanex/coding` Application/client
surface and never gives a renderer Host, Storage, Runtime, Provider,
credentials, repository paths, or native authority.

The post-CODING-4C product-entry review and CODING-4D route are frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1450-post-coding-4c-product-entry-review-and-coding-4d-route-plan.md`

The previously frozen CODING-4D standalone Desktop plan is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1451-phase-coding-4d-desktop-workbench-foundation-plan.md`

That plan was superseded before implementation by the 2026-08-27 unified
product, Host, execution, Sandbox, remote, and Mobile review. Do not create
`@wanex/coding-desktop`. The governing target architecture and route are:

`/Users/asuna/workspace/my/wanex/docs/architecture/product-host-execution-strategy.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1452-unified-product-host-execution-and-mobile-route.md`

Wanex ships one user-visible Product per platform while keeping Assistant and
Coding as separate application domains. The current ambiguous
`@wanex/product` package must be directly renamed to `@wanex/assistant` during
the first route, with no alias or forwarding package. The existing
`@wanex/desktop` becomes the unified Electron shell; it composes Assistant and
Coding through their safe application clients and keeps trusted Host authority
in Electron main.

The next implementation route is Route 1 Product Ownership And Naming Reset.
Before editing package identities, audit Product/Web/Local Host/Plugin Command
Host/TUI ownership and freeze the exact atomic rename. After that, Route 2
establishes one capability-based Execution Environment boundary under the
existing Runtime execution owner. Route 3 integrates the first real Coding
workbench into the existing Desktop. Local OS Sandbox and container providers
follow only after the environment contract is proven.

Do not add a Chat/Work/Coding Kernel enum, mandatory Gateway, standalone Coding
Desktop, speculative shell/bridge/design-system package, remote Store as an
execution protocol, transparent database/workspace synchronization, or silent
Sandbox-to-Native fallback. One Session has one authoritative Agent Host and
Store. Client placement, Host placement, Store authority, execution placement,
and Sandbox policy remain orthogonal.

Mobile Device Capability is explicitly maturity-gated. The first Mobile route
owns cloud conversations and remote Host control. A later Device Capability
Bridge is a leased Tool Provider and does not own Session/Runtime/Store state.
This-app and OS-mediated structured actions may become production capabilities;
cross-application platform actions remain experimental, and general screen
automation has no release commitment. Do not call the Bridge an Agent Host,
depend on Android AppFunctions for the first Mobile release, use Accessibility
as the default Tool contract, or silently replace a missing structured action
with simulated input.

Route 1 Product Ownership And Atomic Assistant Rename is frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1453-route-1-product-ownership-and-atomic-assistant-rename-plan.md`

The current Product/Web/Local Host/Plugin Command Host graph is entirely the
Assistant application domain. Rename it atomically to `@wanex/assistant`,
`@wanex/assistant-ui`, `@wanex/assistant-host`, and
`@wanex/assistant-plugin-host`, including directories, live APIs, wire kinds,
scripts, fixtures, and current governance. Keep `@wanex/desktop`, `@wanex/tui`,
`@wanex/cli`, and `@wanex/coding` unchanged. Old package identities may remain
only as governance tombstones or historical evidence; do not add package,
export, protocol, route, bin, environment-variable, or script aliases. Route 1
changes no Kernel semantics and must not begin Execution Environment or Coding
UI work.

Route 1 Product Ownership And Atomic Assistant Rename is complete locally. Its
atomic package/API/route/distribution rename, neutral Desktop correction,
governance evidence, SDK report update, canonical Coding cursor correction,
verification evidence, and best-practice review are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1454-route-1-product-ownership-and-atomic-assistant-rename-completion.md`

The only active Assistant identities are `@wanex/assistant`,
`@wanex/assistant-ui`, `@wanex/assistant-host`, and
`@wanex/assistant-plugin-host`. Do not restore the old Product/Web/Local Host/
Plugin Command Host packages, imports, wire kinds, routes, bins, environment
variables, scripts, or compatibility aliases. `@wanex/desktop` and
`@wanex/tui` remain neutral unified platform owners; do not rename their proof
contracts into the Assistant domain.

The final bounded `WANEX_TEST_CONCURRENCY=2 pnpm verify` passed all package
checks/tests, 64 Eval scenarios, installed TUI proof, compiled SDK and external
consumer proof, Rust formatting/tests/Clippy, and every enforced architecture
audit. Route 1 is closed. Do not begin Route 2 until a fresh Execution
Environment audit and frozen plan prove how every process, filesystem, Git,
PTY/LSP, network, secret, resource, and artifact path is mediated without a
silent Native fallback or a second authority.

The Route 2 Execution Environment audit and implementation plan are frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1455-route-2-execution-environment-foundation-plan.md`

Route 2 uses the existing `@wanex/runtime/execution` owner and adds no package.
Directly replace `ExecutionHost`, `NodeExecutionHost`, and the misnamed
`environmentSnapshot`; do not retain aliases, deprecated fields, dual writes,
or compatibility decoders. Durable Turn evidence is split into typed neutral
`executionEnvironment` evidence and a typed opaque `applicationScope` envelope.
The same exact environment binding is persisted on the Workspace task and
revalidated before recovery performs I/O.

No production Workspace, Git, Plugin, or Coding path may construct a Native
executor when injection is missing. A missing or unsupported environment fails
at admission. The Native provider must use an explicit direct or supervised
strategy, Coding requires supervised cleanup, and child launch variables come
from a reviewed allowlist rather than broad `process.env` inheritance. Native
reports no OS isolation, library-only filesystem guarding, unrestricted
network, unsupported PTY, explicit-only Secret projection, and bounded artifact
export. Never present it as sandboxed.

Process and filesystem placement are one environment decision. Workspace keeps
Git/worktree/snapshot/transaction semantics; Coding keeps LSP semantics over a
managed process; Runtime Resources keeps artifact persistence; Provider HTTP,
Storage transport, Host listeners, binary bootstrap, and credential-store
startup remain explicit control-plane I/O. Project instructions and Skills,
Workspace Tools, Git projection, native helpers, transaction recovery, Plugin
subprocesses, and environment-local artifact export must use the admitted
environment.

Implement Route 2 only in the frozen 2A through 2D order. Each subphase ends
with focused checks and a best-practice/package review. Do not begin Desktop
Coding UI, remote Host protocol, OS sandbox, container, PTY product, or LSP
product in this route. Accumulate the complete local route, run one bounded
`WANEX_TEST_CONCURRENCY=2 pnpm verify`, and make one deliberate consolidated
submission to conserve GitHub Actions minutes.

Route 2A Contract Reset And Native Provider is complete locally. Its contract,
consumer migration, in-phase corrections, verification evidence, and Route 2B
boundary are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1459-route-2a-execution-environment-foundation-completion.md`

The only current execution contracts are `ExecutionEnvironment`, borrowed
`ExecutionScope`, `ExecutionProcess`, `ManagedExecutionProcess`, and
`ExecutionFileSystem`. The only current concrete provider is the explicit
`NativeExecutionEnvironment`; it requires a direct or supervised strategy and
truthfully reports no OS isolation, library-guarded filesystem access,
unrestricted network, no PTY, no Secret projection, and no artifact exporter.
Do not restore `ExecutionHost`, `NodeExecutionHost`, optional Native fallback
construction, broad child `process.env` inheritance, Plugin execution-host
naming, compatibility aliases, or dual execution paths.

The detailed Route 2B boundary is recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1460-route-2b-workspace-mediation-plan.md`

Route 2B Workspace Mediation is complete locally. Its implementation,
in-phase corrections, full verification evidence, and best-practice review are
recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1461-route-2b-workspace-mediation-completion.md`

Production Workspace now imports no `node:fs`, `node:fs/promises`, or
`node:child_process`. Repository control and exact task authority are separate
borrowed Scopes from one selected `ExecutionEnvironment`; task handling,
Workspace Tools, and writable Git collection use only the exact task Scope.
Snapshot and transaction helpers run through injected process capability, and
the old Native snapshot/transaction source identities have no compatibility
files. Do not collapse repository and task Scopes, restore direct Native
helpers, close task authority before Git collection, or use raw configured
paths where a canonical `LocatedRepository` identity exists.

Route 2C Durable Binding And Coding Composition is complete locally. Its
detailed frozen plan and completion evidence are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1462-route-2c-durable-binding-and-coding-composition-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1463-route-2c-durable-binding-and-coding-composition-completion.md`

Route 2C directly replaces `environmentSnapshot` with typed neutral
`executionEnvironment` evidence and a strict opaque `applicationScope`
envelope, persists the exact environment binding on Workspace tasks, and
validates it before recovery performs physical I/O. Do not add an alias,
compatibility decoder, dual write, absolute durable path, Secret value,
process handle, or claim token.

Route 2D Plugin, Artifact, Conformance, And Audit Closure is complete locally.
Its frozen contract and completion evidence are:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1464-route-2d-plugin-artifact-conformance-and-audit-plan.md`

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1465-route-2d-plugin-artifact-conformance-and-audit-completion.md`

Plugin permission terminology has directly replaced the misleading sandbox
contract. Plugin compiles one action-specific policy, each subprocess owns one
bounded Scope lifecycle, Native rejects constraints it cannot enforce, and
ambient credentials are not inherited. Resource-owned artifact export accepts
only a least-authority filesystem view, provider conformance includes denied
zero-I/O behavior, and the AST execution-boundary audit is enforced by
`pnpm verify`.

The final `WANEX_TEST_CONCURRENCY=2 pnpm verify` passed all package tests, 64
Eval scenarios, 158 Rust tests, SDK and installed TUI proofs, and every
architecture gate. Route 2 is complete.

Route 3 Unified Desktop Coding Workbench is audited and frozen in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1466-route-3-unified-desktop-coding-workbench-plan.md`

Implement it only in Route 3A trusted composition/strict bridge, Route 3B
event-driven workbench, and Route 3C packaged vertical acceptance order. Extend
the existing `@wanex/desktop`; do not create `coding-desktop`, `coding-web`, a
generic shell/design-system package, a Gateway, a renderer database, polling,
or a Kernel Chat/Work/Coding mode. Assistant and Coding remain separate domain
owners. Absolute project paths, Host/Storage/Runtime/Workspace authority,
credentials, and Electron primitives remain in trusted main/Host composition.
The renderer receives only the existing safe application clients and bounded
read models. Native project selection is semantic IPC with no renderer path
input. Do not begin remote Host, OS sandbox/container, PTY/LSP, TUI Coding, or
Mobile work during Route 3.

Route 3A Trusted Desktop Composition And Strict Bridge is complete locally.
Its implementation and verification evidence are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1467-route-3a-trusted-desktop-composition-and-strict-bridge-completion.md`

The active Desktop composition starts Coding lazily after trusted native
project selection, shares the local profile/Storage and credential authority
with Assistant, and exposes only semantic IPC through a sandboxed preload.
Coding requests, command responses, project selections, and event envelopes
are validated at the production process boundary using the public
`@wanex/coding` transport validators. Real Coding Host composition and shared
profile lifecycle tests pass. Do not add another IPC parser, renderer path
input, Host/Storage/Runtime authority to the Renderer, standalone Coding
package, Gateway, polling loop, or compatibility alias.

Route 3A's consolidated local release gate passed exactly once with
`WANEX_TEST_CONCURRENCY=1 pnpm verify`: all TypeScript package tests and
architecture audits passed, all 64 Eval scenarios passed, the installed TUI
proof passed, 158 Rust tests plus formatting and Clippy passed, and the
compiled SDK/external consumer proofs passed. Keep this low-concurrency gate
for expensive consolidated verification; do not repeatedly launch it for
focused edits or use CI as a debugger.

The next active route is Route 3B Event-Driven Coding Workbench. It is the
first actual Coding product surface in the unified Desktop. Before editing,
re-audit ownership between the current Assistant Web renderer, Desktop's
trusted bridge, and the Coding application. Then implement the workbench in
the existing unified Desktop renderer. It must consume only safe Coding
client/read models, use invalidation-driven canonical rereads, and keep
project paths, credentials, execution scopes, process handles, and internal
job/attempt/claim/lease identities out of ordinary UI. Do not create a
`coding-web` or `coding-desktop` package, add Coding routes to Assistant Host,
move Coding semantics into Assistant, add polling, or retain compatibility
aliases.
