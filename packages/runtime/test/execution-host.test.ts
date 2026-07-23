import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { NodeExecutionHost } from "../src/execution/index.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/runtime/execution", () => {
  it("executes argv without a shell and uses explicit stdin and environment", async () => {
    const cwd = await tempDir()
    const host = new NodeExecutionHost({
      baseEnvironment: { PATH: process.env.PATH },
      terminationGraceMs: 20,
      cleanupTimeoutMs: 500
    })
    const result = await host.execute({
      program: process.execPath,
      args: [
        "-e",
        "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>process.stdout.write(process.env.WANEX_MARK+':'+s))"
      ],
      cwd,
      environment: { WANEX_MARK: "explicit" },
      stdin: "payload"
    })

    expect(result).toMatchObject({
      exitCode: 0,
      termination: "exited",
      cleanup: "not_required"
    })
    expect(result.stdout).toMatchObject({
      text: "explicit:payload",
      truncated: false
    })
  })

  it("retains bounded head and tail output with truthful byte counts", async () => {
    const cwd = await tempDir()
    const host = new NodeExecutionHost()
    const result = await host.execute({
      program: process.execPath,
      args: [
        "-e",
        "process.stdout.write('A'.repeat(100));process.stdout.write('B'.repeat(100));process.stderr.write('E'.repeat(80))"
      ],
      cwd,
      output: { stdoutBytes: 64, stderrBytes: 20 }
    })

    expect(result.stdout).toMatchObject({
      text: `${"A".repeat(32)}${"B".repeat(32)}`,
      observedBytes: 200,
      retainedBytes: 64,
      truncated: true
    })
    expect(result.stderr).toMatchObject({
      text: "E".repeat(20),
      observedBytes: 80,
      retainedBytes: 20,
      truncated: true
    })
  })

  it.runIf(process.platform !== "win32")(
    "kills the process group including a grandchild on timeout",
    async () => {
      const cwd = await tempDir()
      const host = new NodeExecutionHost({
        terminationGraceMs: 30,
        cleanupTimeoutMs: 1_000
      })
      const result = await host.execute({
        program: process.execPath,
        args: ["-e", processTreeFixture],
        cwd,
        timeoutMs: 1_000,
        output: { stdoutBytes: 256 }
      })

      expect(result).toMatchObject({
        termination: "timed_out",
        cleanup: "completed"
      })
      const pids = processTreePids(result.stdout.text)
      expect(pids.root).toBe(result.pid)
      await expectProcessGone(pids.root)
      await expectProcessGone(pids.grandchild)
    }
  )

  it.runIf(process.platform === "win32")(
    "kills the Windows process tree including a grandchild on timeout",
    async () => {
      const cwd = await tempDir()
      const host = new NodeExecutionHost({
        terminationGraceMs: 30,
        cleanupTimeoutMs: 5_000
      })
      const result = await host.execute({
        program: process.execPath,
        args: ["-e", processTreeFixture],
        cwd,
        timeoutMs: 1_000,
        output: { stdoutBytes: 256 }
      })

      expect(result).toMatchObject({
        termination: "timed_out",
        cleanup: "completed"
      })
      const pids = processTreePids(result.stdout.text)
      expect(pids.root).toBe(result.pid)
      await expectProcessGone(pids.root)
      await expectProcessGone(pids.grandchild)
    }
  )

  it("cancels an active process before returning", async () => {
    const cwd = await tempDir()
    const controller = new AbortController()
    const host = new NodeExecutionHost({
      terminationGraceMs: 20,
      cleanupTimeoutMs: 1_000
    })
    const execution = host.execute({
      program: process.execPath,
      args: ["-e", "console.log(process.pid);setInterval(()=>{},1000)"],
      cwd,
      signal: controller.signal,
      output: { stdoutBytes: 128 }
    })
    setTimeout(() => controller.abort(), 75)
    const result = await execution

    expect(result).toMatchObject({
      termination: "cancelled",
      cleanup: "completed"
    })
    await expectProcessGone(result.pid)
  })

  it("delegates Windows cancellation to the tree terminator", async () => {
    const cwd = await tempDir()
    const terminated: number[] = []
    const host = new NodeExecutionHost({
      platform: "win32",
      cleanupTimeoutMs: 1_000,
      terminationGraceMs: 20,
      windowsTreeTerminator: {
        async terminate(pid) {
          terminated.push(pid)
          process.kill(pid, "SIGKILL")
        }
      }
    })
    const result = await host.execute({
      program: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      cwd,
      timeoutMs: 50
    })

    expect(result).toMatchObject({
      termination: "timed_out",
      cleanup: "completed"
    })
    expect(terminated).toEqual([result.pid])
  })

  it("fails before spawn for an already aborted request", async () => {
    const cwd = await tempDir()
    const controller = new AbortController()
    controller.abort()
    const host = new NodeExecutionHost()

    await expect(
      host.execute({
        program: process.execPath,
        cwd,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: "ExecutionAbortedError" })
  })
})

const processTreeFixture = [
  "const {spawn}=require('node:child_process')",
  "const grandchild=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true})",
  "process.stdout.write(JSON.stringify({root:process.pid,grandchild:grandchild.pid})+'\\n')",
  "setInterval(()=>{},1000)"
].join(";")

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-execution-host-"))
  tempDirs.push(dir)
  return dir
}

async function expectProcessGone(pid: number): Promise<void> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") {
        return
      }
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`process ${pid} is still alive`)
}

function processTreePids(output: string): {
  readonly root: number
  readonly grandchild: number
} {
  const parsed = JSON.parse(output.trim()) as {
    readonly root?: unknown
    readonly grandchild?: unknown
  }
  return {
    root: positivePid(parsed.root, "root"),
    grandchild: positivePid(parsed.grandchild, "grandchild")
  }
}

function positivePid(value: unknown, name: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`process tree fixture returned invalid ${name} pid`)
  }
  return Number(value)
}
