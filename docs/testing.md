# Testing Ownership

Use the lowest layer that can exercise a failure faithfully. Package tests
cover contracts and real component integration; installed acceptance covers
delivery and cross-process boundaries. Historical `proof:*` names describe
different kinds of checks, not stronger guarantees by themselves.

| Check | Purpose | Default entry |
| --- | --- | --- |
| Protocol/provider parsing | Capabilities, schemas, wire response errors | Package tests |
| Runtime/Store/App integration | Recovery, cancellation, leases, idempotency, resources | Package and Rust tests |
| UI components | Interaction state and failures | assistant-ui tests |
| Cross-module scenarios | Public composition and business invariants | Eval |
| Packaged Server workspace | Disconnected execution, reconnect, two roots, approvals, local isolation | Desktop test:installed |
| SDK consumption | Package files, exports and external dependency closure | release:sdk + proof:sdk-consumers |
| Installed TUI | Terminal interaction and installed runtime | proof:tui |
| Installed Desktop/native/Server | Target-platform packaging and OS integration | Distribution workflow/preflight |
| Static audits | Dependency, RPC, API and footprint contracts | verify source suite |

## Commands And Scope

- `pnpm --filter <package> check` / `test`: focused development checks.
- `pnpm verify --suite source`: all existing source checks, package integration,
  Rust and Eval. Some policy tests compile JS bundles.
- `pnpm verify --suite artifacts`: the five installed/distribution stages above
  selected by the verify runner. It is self-contained for build prerequisites.
- `pnpm verify`: both suites, once each, fail-fast. This is the complete local gate.
- `pnpm --filter @wanex/desktop test:installed`: current release Server preparation
  and the independent packaged workspace scenario.

The default local gate does not replace target-platform acceptance or security
audits. A local Provider fixture proves Wanex integration, not live cloud availability.

## Coverage-Preserving Moves

The packaged Server scenario moved from
`apps/desktop/test/packaged-server-workspace.test.mjs` to
`apps/desktop/acceptance/packaged-server-workspace.test.mjs`.
The default Desktop config includes only `test`; the installed config includes
only the installed scenario in `acceptance`. The previous 152 package tests
remain, with focused regression tests added; installed acceptance contains the
same remaining scenario. Its business
assertions and deadline are unchanged. The full verify and both Desktop platform
workflows explicitly run it.

Release preparation lives in `apps/desktop/scripts/test-installed.mjs` and uses
the existing distribution builder and process runner. It builds current sources,
audits checksums, and passes an owned artifact directory to Vitest. Failure
preserves that directory; it never silently uses a previous artifact.

## Rules For Further Consolidation

- Map each old assertion to its replacement and demonstrate the same failure detection.
- Keep restart sequences stateful only when persistence itself is under test.
- Use deterministic Provider fixtures for routine verification; live checks are explicit.
- Prefer existing test tooling and ordinary test files over new runners or registries.
- Keep UI drivers outside product code as they are migrated; preserve native acceptance.
- Do not loosen budgets, add retries, or treat partial suite results as full acceptance.
- Do not run SDK build/proof workflows concurrently against shared `target/sdk`.

The bounded external Desktop pilot covers only `relaunch-chat`, with an assertion
map and real installed-artifact evidence. Its corresponding product-side driver
has been removed. Other UI proofs remain required until their replacements pass;
this execution-layer change does not remove them.

## Background And Native Validation

The default `pnpm verify` (both suites) does not launch Desktop GUI windows.
Package/component tests, real services, packed Server acceptance and SDK checks
run in the background; installed TUI uses its owned PTY, not the user's terminal.
No additional "quiet" runner or weaker verification profile is needed.

`pnpm proof:desktop` is explicit native acceptance and can display windows.
Window focus, native credentials, IPC, packaged resources and OS shutdown remain
real platform checks. A hidden window or headless browser is not a substitute
for these checks. Linux virtual displays also cannot certify macOS/Windows builds.

The `relaunch-chat` step now runs in an external Playwright test process, using
the installed executable and the profile created by the preceding configure step.
Its spec lives in `apps/desktop/acceptance/desktop`; Vitest does not discover it.
The normal proof orchestrator owns the same 60-second process deadline, Provider
request assertions, resource hashes and process cleanup audit. No retries.
The test reads actual UI state and submits through Locator actions; it does not
use an injected product-side business test function.

Electron 43.7.8 with Playwright 1.64.0 reproduces an early attachment failure for
already-created targets awaiting their first navigation. A small external helper
observes `did-finish-load`, then connects the UI through public `connectOverCDP`.
The Electron handle owns process lifecycle; the CDP handle owns UI interaction.
No private loader import, application startup patch, security change or fallback
to a browser-rendered copy is used. This does not validate early-window automation;
the unchanged native startup proof retains that coverage.
