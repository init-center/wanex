# Route 13E: Distribution Preflight and Cross-Platform Shutdown

Date: 2026-09-09
Status: source correction complete and low-cost local verification green; the
current macOS 27 host blocks the packaged Electron proof; hosted matrix
confirmation pending

## Problem

The cross-platform release gate exposed two product/distribution issues and
two validation gaps:

- the Server distribution proof used `child.kill("SIGTERM")`, which does not
  provide a portable graceful-shutdown contract on Windows;
- the desktop ASAR budget remained at the pre-MCP baseline after the bundled
  desktop runtime gained a measured increase;
- `interactiveTotal` included the proof journey's Provider setup and model
  editing, so it did not mean first usable UI;
- local preflight did not build the current Desktop ASAR, run the real TUI
  distribution proof, prepare Electron explicitly, or ensure receipts were
  produced from the final native artifact.
- the installed TUI proof expected the same readiness footer to be rendered
  twice before opening Team details, making a valid state transition depend on
  an incidental duplicate render.

## Decisions

The packaged Server accepts the internal Node child-process message
`{ "kind": "wanex.server.shutdown" }` when launched with an IPC channel. It
uses the same bounded `server.close()` path as `SIGINT` and `SIGTERM`, and
disconnects the IPC channel after close. Normal standalone processes still use
OS signals; the IPC path is for a parent process that owns the child lifecycle
and is platform-independent.

The desktop ASAR ceiling is `3,400,000` bytes for the current desktop targets.
This is a reviewed budget, not a disabled assertion: the final preflight
observed `3,226,606` bytes, and the installed proof receipt observed
`3,226,587` bytes. A future dependency or feature that exceeds the ceiling
requires a new size review or bundle reduction.

Desktop startup now records two distinct facts:

- `rendererInteractive` is the interval from renderer load completion until
  the real onboarding form or configured composer is visible, usable, and has
  crossed two `requestAnimationFrame` boundaries;
- `journeyPreparation` is the proof-only Provider/model setup interval before
  the first submitted message.

The old field was renamed rather than retained as an alias. `interactiveTotal`
now ends at the actual renderer readiness boundary and remains a complete
process-to-ready metric. Full proof time and journey preparation remain
visible separately.

## Preflight Contract

Before pushing a change that affects runtime, distribution, or Desktop
behavior, run:

```bash
pnpm preflight:distribution
```

The command is intentionally narrower than `pnpm verify`, but is a complete
serial distribution gate. It performs cheap diff and contract checks first,
then type checks, current Desktop ASAR budgeting, package distribution
checks, Server lifecycle and assembled proof, and the real installed proofs.
On Desktop hosts the artifact order is:

```text
Electron preparation
-> installed Desktop proof
-> native Runtime proof
-> installed TUI proof
-> Desktop distribution receipt
-> host distribution audit
```

The Desktop proof may refresh the native artifact while packaging. Therefore
the native receipt is deliberately generated after that proof, and the TUI
proof consumes the same staged directory. The Server distribution proof builds
its own artifact in a temporary proof directory and never reads a possibly
stale `target/distribution/native` file from the workspace.

The installed TUI Team proof now waits for one complete semantic footer line
that proves the group is idle and cannot submit without an agent. It then
opens Group details. No timing delay or retry is part of the proof.

The gate remains serial to avoid turning local validation into an unnecessary
CPU and thermal spike. It cannot replace hosted platform validation: a macOS
or Linux host cannot prove Windows process, native binding, or Electron
behavior. The release workflow keeps the supported matrix and now follows the
same receipt ordering.

## Verification

Passed before the final local proof:

```text
7 focused test files passed, 68 tests passed
```

The TUI proof regression test also passed with 2 files and 10 tests, followed
by the real installed TUI proof with `ok: true`.

The first complete local preflight reached every proof but correctly rejected
one cold Desktop sample at `3217.75ms` against the `3000ms` ceiling. Its
`rendererLoad` was `2013.18ms`; this was not a journey-preparation inclusion
error. Two independent subsequent Desktop proofs produced:

- cold `interactiveTotal`: `1580.17ms`, then `2117.33ms`;
- warm `interactiveTotal` median: `1173.32ms`, then `1339.13ms`;
- warm shutdown maximum: `69.2ms` on the second run;
- native artifact SHA-256:
  `404eb7fe83a917acbacc7f70873ab4d1e5e5f636fd8ea84eba1adf66091c1105`;
- Desktop ASAR: `3,226,587` bytes in the installed proof receipt;
- unpacked Desktop package: `512,080,443` bytes;
- native resource: `8,897,024` bytes.

The complete local preflight before the cache-first UI correction passed with
`failures: []`. Its receipts recorded:

- cold `interactiveTotal`: `1957.92ms`;
- warm artifact verification maximum: `31.79ms`;
- warm host startup median: `90.27ms`;
- warm shutdown maximum: `31.31ms`;
- warm `interactiveTotal` median: `1239.41ms`;
- Desktop ASAR: `3,226,587` bytes in the proof receipt;
- unpacked Desktop package: `512,080,443` bytes.

The earlier cold outlier was retained as evidence and did not cause a budget
increase, retry policy, fixed sleep, skipped assertion, or timeout change.

## CI Synchronization Correction

The first hosted run for the implementation commit was `34309080317`. Its
Linux source gate failed only in the Desktop startup observer test
`observes loading completion instead of treating a form skeleton as ready`.
The test removed the loading marker and immediately advanced fake timers, but
had not yielded to the `MutationObserver` microtask that delivers that DOM
change. In the hosted happy-dom environment the observer therefore never
scheduled the readiness frames, and the test reached its normal 30-second
test timeout.

The correction adds one explicit `await Promise.resolve()` after removing the
loading marker. This models the real browser delivery boundary and lets the
test drive the already-scheduled animation frames. It does not increase the
timeout, add a sleep, retry the proof, skip the assertion, or alter product
readiness behavior.

After the correction, the Desktop package passed 19 test files and 129 tests,
and the exact source-gate command used by CI passed in full:

```bash
WANEX_TEST_CONCURRENCY=2 pnpm verify
```

That gate also passed all package tests, Rust tests and Clippy, SDK consumer
proofs, installed TUI proof, and all 64 Eval scenarios. The first hosted run
did not reach the target distribution jobs because the shared source gate
failed, so a fresh four-target hosted matrix is still required after the
single corrective commit.

## Dependency Audit Correction

The first corrective hosted run was `34311324792`. Its complete `verify`
step passed, but the following `security:js` step correctly found three
moderate Hono advisories in the MCP SDK dependency graph. The graph resolved
Hono `4.13.3`; the patched line is `>=4.13.5`, so the existing workspace
override was advanced to Hono `4.13.7`.

After that production audit was clean, the complete audit exposed two
additional development-tool advisories that the first run did not reach:
`js-yaml 4.3.1` required `4.3.2`, and Vitest `4.1.10` required `4.1.11`.
Those versions are now pinned through the existing workspace policy and lock
file. No audit ignore, severity reduction, or dependency removal was used.

The corrected local checks report no known vulnerabilities for both production
and complete JavaScript dependency audits. The full source gate was rerun with
the upgraded dependencies and passed, including all package tests, 64 Eval
scenarios, Rust tests/Clippy, SDK consumer proofs, and the installed TUI proof.
The next hosted run must therefore validate both the corrected test boundary
and the corrected dependency graph before Route 13E can be closed.

The post-upgrade local distribution preflight reached the real Desktop proof
and failed only at the strict host-performance audit: one warm artifact
verification sample was `171.89ms` against `120ms`. A standalone follow-up
produced warm samples up to `35.61ms`, but its cold `interactiveTotal` was
`3087.59ms` against `3000ms`. These non-repeating measurements occurred while
the development host was under unrelated process load, but they are retained
as failures rather than converted into a pass. No budget, retry policy, or
assertion was changed. The next hosted target matrix remains the authoritative
cross-platform performance check.

## Architecture Review

This correction remains aligned with the architecture:

- Desktop owns startup observation; it does not move product behavior into the
  preflight script;
- Server owns its own assembled artifact proof and process lifecycle;
- receipts are generated only after the artifact they describe has been
  produced and verified;
- no Gateway, second listener, new package, protocol, schema, compatibility
  alias, or Renderer diagnostic surface was added;
- the hosted matrix remains required because local evidence cannot prove
  Windows.

## Remaining Evidence

Route 13E is not globally complete until one intentionally batched hosted
matrix produces fresh receipts for `linux-x64`, `darwin-arm64`,
`darwin-x64`, and `win32-x64` on the current commit. The local macOS arm64
audit proves the corrected local slice only. Do not trigger another Action
run before the next corrective commit is ready.

## Cache-First Initial Snapshot Correction

The next hosted matrix was `34313924173`. Linux, darwin-x64, and win32-x64
completed their distribution jobs. darwin-arm64 reached the corrected startup
measurement but failed the unchanged cold `interactiveTotal` ceiling:

```text
processToAppReady       279.02ms
artifactVerification     84.71ms
hostStartup             169.00ms
rendererLoad           1301.88ms
rendererInteractive    1536.41ms
interactiveTotal       3371.02ms > 3000ms
```

The breakdown showed that the metric was now measuring its intended first
usable UI boundary. The remaining avoidable work was in the browser client:
the initial mount requested `refresh` even though the Host controller already
held the canonical snapshot used to serve the page. This correction adds the
optional `Client.readInitialSnapshot()` capability. The HTTP client maps it to
the existing typed `operation: "snapshot"` request, while the synchronization
hook uses it only for the first mount. Invalidations, event gaps, and retry
after a failed first read continue to use the full `readSnapshot()` refresh.
Clients without the optional capability use the existing refresh behavior.

An earlier experiment embedded the full snapshot as JSON in the HTML. It was
removed rather than obfuscated: internal runtime identities such as `jobId`,
`attemptId`, `workerId`, and `principalId` would have become available in the
DOM source even when not visually rendered. The final design avoids duplicate
surface work without exposing internal state or freezing a stale document
payload.

Focused UI and Host tests passed `108/108`; `pnpm check:desktop` and the full
`WANEX_TEST_CONCURRENCY=2 pnpm verify` gate also passed. A post-correction local
distribution preflight reached Electron but the current macOS `27.0`
(`26A5416b`) host emitted `sandbox_extension_issue_file_to_process ...
Operation not permitted` for the temporary installed app and timed out before
the application proof could start. This is recorded as host-environment
evidence, not as a product pass or a reason to disable the macOS sandbox,
increase the proof timeout, or relax the startup budget. The next hosted
matrix remains required.

## Updated Architecture Review

The cache-first change preserves the existing ownership boundaries:

- the Host owns the canonical snapshot and remains the only place that can
  serve it;
- the protocol's existing `snapshot` operation is reused, so no new schema,
  Gateway, listener, or persistence concept is introduced;
- the UI client owns transport-specific first-read optimization, while
  recovery continues to request a canonical refresh;
- runtime identities remain out of HTML and rendered UI;
- no timeout, retry, sleep, skipped assertion, compatibility alias, or budget
  relaxation was added.

Route 13E remains open until one intentionally batched hosted matrix produces
fresh receipts for all four targets on the commit containing this correction.

## CI Clock-Scheduler Test Correction

The first hosted source gate after the cache-first change was run as
`34321237394`. It failed before the distribution matrix started: the Desktop
suite had `127` passing tests and one 30-second timeout in
`apps/desktop/test/startup.test.ts`, specifically the loading-completion case.

The failure was a test scheduling defect, not a reason to change the product
timeout or the startup budget. The happy-dom environment captures its browser
`queueMicrotask`, `setImmediate`, and animation-frame scheduler when the
environment is initialized. The test then installed Vitest fake timers around
the production observer, which made MutationObserver delivery and the two
paint callbacks depend on two different clock implementations. That timing
could pass locally and stall on a hosted Linux runner.

The test now uses the real event loop for successful observer and paint
assertions. The five negative cases pass an explicit `50ms` proof timeout so
their bounded failure behavior remains fast and deterministic. Production
`waitForDesktopInteractive`, its 10-second application guard, and all startup
budgets are unchanged. The corrected test passed independently twenty times,
and the subsequent full `WANEX_TEST_CONCURRENCY=2 pnpm verify` passed all
package tests, Rust tests/Clippy, SDK and installed TUI proofs, and 64 Eval
scenarios. A fresh four-target hosted matrix is still required for Route 13E.

## Latest Hosted Evidence And Shutdown Correction

Hosted run `34323808315` passed the source gate, security checks, packed Core,
native proof, Server proof, TUI proof, and all Desktop functional journeys on
all four target jobs. Its only host-audit failures were:

- `win32-x64` warm shutdown maximum `93.31ms` against `50ms`; the other warm
  samples were below `40ms`;
- `darwin-arm64` cold `interactiveTotal` `3748.58ms` against `3000ms`.

The Windows sample exposed a real serial teardown cost. Desktop now starts the
independent Remote and Assistant closers concurrently with the ordered Coding
closer. The lifecycle helper uses `Promise.allSettled`, so all resources finish
before the first close error is reported and before the single-instance lock is
released. The implementation and tests are recorded in:

`/Users/asuna/workspace/study/agent-runtime-kernel-design/implementation/1599-route-13e-parallel-desktop-shutdown-completion.md`

The Apple Silicon cold-start failure remains a separate renderer-startup
investigation. A Settings-domain lazy-loading experiment was removed after its
actual React test path remained in Suspense fallback; no unverified async UI
boundary, budget increase, retry, sleep, or timeout change was kept. The next
startup work must first collect stage-level evidence for document load, initial
snapshot adoption, and React readiness, then optimize the actual critical path.
