import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { ExecutionPolicySnapshot } from "@wanex/protocol"
import { MacosSeatbeltChildSupervisor } from "../src/execution/macos/supervisor.js"
import type {
  ChildManagedProcess,
  ChildProcessRun,
  ChildSupervisor,
  ChildSupervisorStartRequest
} from "../src/execution/supervisor-types.js"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true })
    })
  )
})

describe("macOS Seatbelt child supervision", () => {
  it("executes the canonical target of a PATH symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanex-seatbelt-program-"))
    roots.push(root)
    const pathDirectory = join(root, "path")
    const installationDirectory = join(root, "installation")
    await Promise.all([mkdir(pathDirectory), mkdir(installationDirectory)])
    const installedProgram = join(installationDirectory, "git-real")
    await writeFile(installedProgram, "#!/bin/sh\nexit 0\n", "utf8")
    await chmod(installedProgram, 0o755)
    await symlink(installedProgram, join(pathDirectory, "git"))
    const canonicalProgram = await realpath(installedProgram)

    let delegated: ChildSupervisorStartRequest | undefined
    const processRun = childProcessRun()
    const delegate: ChildSupervisor = {
      async start(request) {
        delegated = request
        return processRun
      },
      async startManaged() {
        return childManagedProcess(processRun)
      }
    }
    const supervisor = new MacosSeatbeltChildSupervisor({
      delegate,
      policy: readOnlyPolicy(),
      roots: [{ id: "workspace", path: root }]
    })

    await supervisor.start(startRequest(root, pathDirectory))

    expect(delegated?.program).toBe("/usr/bin/sandbox-exec")
    expect(delegated?.args).toContain(`-DEXECUTABLE=${canonicalProgram}`)
    expect(delegated?.args.slice(-2)).toEqual(["--", canonicalProgram])
  })
})

function startRequest(cwd: string, pathDirectory: string): ChildSupervisorStartRequest {
  return {
    claim: {
      runId: "run_seatbelt_program",
      attemptId: "attempt_seatbelt_program",
      claimToken: "a".repeat(64)
    },
    childId: "child_seatbelt_program",
    program: "git",
    args: [],
    cwd,
    environment: { PATH: pathDirectory },
    stdin: new Uint8Array(),
    inputMode: "closed",
    stdoutLimitBytes: 1_024,
    stderrLimitBytes: 1_024,
    terminationGraceMs: 100
  }
}

function readOnlyPolicy(): ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: [{ id: "workspace", effects: ["read"] }],
      maxReadBytes: 1_024,
      maxDirectoryEntries: 100
    },
    process: {
      oneShot: true,
      managed: true,
      cleanup: "durable_supervisor",
      environmentVariables: []
    },
    network: "denied",
    isolation: "os",
    pty: false
  }
}

function childProcessRun(): ChildProcessRun {
  return {
    async wait() {
      return {
        exitCode: 0,
        signal: null,
        termination: "exited",
        cleanup: "completed",
        stdout: {
          bytes: new Uint8Array(),
          text: "",
          observedBytes: 0,
          retainedBytes: 0,
          truncated: false
        },
        stderr: {
          bytes: new Uint8Array(),
          text: "",
          observedBytes: 0,
          retainedBytes: 0,
          truncated: false
        }
      }
    },
    async terminate() {}
  }
}

function childManagedProcess(run: ChildProcessRun): ChildManagedProcess {
  return {
    ...run,
    events: (async function* () {})(),
    async write() {},
    async closeInput() {}
  }
}
