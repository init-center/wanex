# Architecture Notes

This directory contains implementation-local architecture notes for Wanex.

## Current Roadmap Override

Phase 741 closed the current application feature route. The architecture audit
after that phase found that the durable kernel direction remains valid, but the
next work must converge public facades and complete the real provider/tool/SDK
path before adding more product features.

The frozen Phase 745-757 reconstruction route is:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/architecture-course-correction.md`

Documents in this directory continue to describe the currently implemented
contracts until each migration phase changes the code. They must not be read as
authorization to extend application or the current broad package surface.
Phase 744 established the Runtime/App public entries; Phase 745 now freezes
package disposition, real-consumer evidence, and physical facade ceilings.

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
- [Storage Schema Policy](storage-schema.md): the single pre-release SQLite
  baseline, fail-closed marker, and doctor-reporting rules.

The source design package currently lives at:

`/Users/asuna/workspace/study/agent-runtime-kernel-design`
