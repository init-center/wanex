# Route 13E: Distribution Preflight and Cross-Platform Shutdown

Date: 2026-09-09
Status: local implementation and preflight complete; hosted matrix confirmation pending

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

The final complete local preflight passed with `failures: []`. Its current
receipts record:

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
run before the final single commit is ready.
