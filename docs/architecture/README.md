# Architecture Notes

This directory contains implementation-local architecture notes for Wanex.

## Current Roadmap Override

Route 4C completed trusted local Provider selection and Coding composition. The
2026-08-27 product and deployment review then
rejected the unimplemented standalone `@wanex/coding-desktop` route. Wanex will
ship one user-visible product per platform while preserving separate Assistant
and Coding application domains internally.

The current target architecture and phased route are frozen in
[Product, Host, And Execution Strategy](product-host-execution-strategy.md).
It also freezes Agent Host authority, Execution Environment and Sandbox
boundaries, remote control, cloud history, and native Mobile roles.

Route 4D PTY / Interactive Process Foundation is complete on Unix and macOS
Seatbelt. Its plan is recorded in
`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1481-post-route-4c-execution-boundary-review-and-route-4d-pty-plan.md`,
and its implementation evidence is recorded in
`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1482-route-4d-pty-interactive-process-completion.md`.

The post-Route 4D review has frozen Route 5 Agent Host Protocol And
Connections. Its implementation plan is recorded in
`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1483-post-route-4d-architecture-review-and-route-5-agent-host-plan.md`.

Route 5A, 5B, and Unix 5C are complete. Their evidence is recorded in
`1484-route-5a-agent-host-protocol-completion.md`,
`1485-route-5b-in-process-agent-host-port-completion.md`, and
`1486-route-5c-unix-agent-host-local-ipc-completion.md`.

Documents in this directory describe currently implemented contracts unless
they explicitly say `target architecture`. Target names and routes do not make
an unimplemented package or capability available. Incorrect pre-release
boundaries are replaced directly during their implementation phase; no
compatibility packages or aliases are added.

The earlier Runtime/App and SDK course correction remains historical design
evidence in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/architecture-course-correction.md`

## Current Documents

- [Public Contracts](public-contracts.md): package tiers, app-facing entry
  points, runtime state rules, and dependency direction.
- [Package Structure Rules](package-structure.md): package boundary, entrypoint,
  and large-file audit rules.
- [Package Governance](package-governance.md): package disposition, tombstones,
  real-consumer baselines, and Runtime/App static footprint gates.
- [App Integration Guide](app-integration-guide.md): recommended bootstrap,
  runtime recipes, validation, and anti-patterns for upper applications.
- [Extension Contributions](extension-contributions.md): contribution-first
  extension model for instructions, skills, commands, agents, providers,
  plugins, and future TUI surfaces.
- [Distribution And Packaging](distribution-packaging.md): runtime artifact
  packaging rules and cold product entry audit.
- [Release / CI Contract](release-ci-contract.md): required release gate and
  CI-ready verification command.
- [Runtime Composition](runtime-composition.md): app-owned runtime composition
  and connector lifecycle guidance.
- [Product, Host, And Execution Strategy](product-host-execution-strategy.md):
  unified product experience, Assistant/Coding ownership, Agent Host placement,
  Execution Environment and Sandbox, remote control, Mobile, and the current
  implementation route.
- [Storage Schema Policy](storage-schema.md): the single pre-release SQLite
  baseline, fail-closed marker, and doctor-reporting rules.

The source design package currently lives at:

`/Users/asuna/workspace/study/agent-runtime-kernel-design`
