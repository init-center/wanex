# Route 13E: Distribution Preflight and Cross-Platform Shutdown

## Problem

The cross-platform release gate exposed two issues that were both detectable
before a new commit was pushed, but were not covered by one focused local
command:

- the Server distribution proof used `child.kill("SIGTERM")`, which does not
  provide a portable graceful-shutdown contract on Windows;
- the desktop ASAR budget remained at the pre-MCP baseline after the bundled
  desktop runtime gained a measured increase from `3,100,000` to `3,225,188`
  bytes.

## Decisions

The packaged Server now accepts the internal Node child-process message
`{ "kind": "wanex.server.shutdown" }` when it is launched with an IPC
channel. It uses the same bounded `server.close()` path as `SIGINT` and
`SIGTERM`, and disconnects the IPC channel after close. Normal standalone
processes still use OS signals; the IPC path is for a parent process that owns
the child lifecycle and is platform-independent.

The desktop ASAR ceiling is `3,400,000` bytes for the current desktop targets.
This is a reviewed budget update, not a disabled assertion: the observed
artifact is `3,225,188` bytes, leaving a bounded amount of room for the
currently shipped runtime while continuing to fail on unbounded growth. A
future dependency or feature that exceeds this ceiling requires a new size
review or bundle reduction.

## Preflight

Before pushing a code change that affects runtime, distribution, or desktop
behavior, run:

```bash
pnpm preflight:distribution
```

The command is intentionally narrower than `pnpm verify`. It checks the Git
diff, Server/TUI/Desktop type contracts, the real Server process lifecycle and
packaged proof, TUI distribution contracts, and the desktop packaging/receipt
and budget contracts. It runs serially to avoid turning a local validation into
an unnecessary CPU and thermal spike.

This command cannot replace hosted platform validation: a macOS or Linux host
cannot prove Windows process, native binding, or Electron packaging behavior.
The release workflow remains responsible for the final matrix, while this
preflight removes avoidable contract and lifecycle failures before submission.

## Verification

- Server package type check passed.
- Server distribution proof passed with `shutdownExitCode: 0`.
- Server process lifecycle test passed through the IPC shutdown path.
- The full focused distribution preflight passed locally.
