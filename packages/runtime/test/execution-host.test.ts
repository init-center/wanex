import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  NativeChildSupervisor,
  NodeExecutionHost,
  type ChildSupervisor
} from "../src/execution/index.js"
import { terminateProcessTree } from "../src/execution/process-tree.js"

const tempDirs: string[] = []
const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

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

      expect(result, result.cleanupError).toMatchObject({
        termination: "timed_out",
        cleanup: "completed"
      })
      const pids = processTreePids(result.stdout.text)
      await expectProcessGone(pids.root)
      await expectProcessGone(pids.grandchild)
    }
  )

  it.runIf(process.platform !== "win32")(
    "uses final process-group evidence after a transient signal error",
    async () => {
      const cwd = await tempDir()
      const pidFile = join(cwd, "transient-signal-process-tree.json")
      const controller = new AbortController()
      const host = new NodeExecutionHost({
        terminationGraceMs: 30,
        cleanupTimeoutMs: 1_000
      })
      const execution = host.execute({
        program: process.execPath,
        args: ["-e", stubbornProcessTreeFixture, pidFile],
        cwd,
        signal: controller.signal,
        output: { stdoutBytes: 256 }
      })
      let pids: { readonly root: number; readonly grandchild: number }
      try {
        pids = await waitForProcessTreePidFile(pidFile)
      } catch (error) {
        controller.abort()
        await execution.catch(() => undefined)
        throw error
      }
      const kill = process.kill.bind(process)
      let injected = false
      const killSpy = vi.spyOn(process, "kill").mockImplementation((
        pid: number,
        signal?: string | number
      ) => {
        const result = kill(pid, signal)
        if (!injected && pid < 0 && signal === "SIGTERM") {
          injected = true
          throw Object.assign(new Error("injected transient signal error"), {
            code: "EPERM"
          })
        }
        return result
      })
      let result
      try {
        controller.abort()
        result = await execution
      } finally {
        killSpy.mockRestore()
      }

      expect(injected).toBe(true)
      expect(result, result.cleanupError).toMatchObject({
        termination: "cancelled",
        cleanup: "completed"
      })
      await expectProcessGone(pids.root)
      await expectProcessGone(pids.grandchild)
    }
  )

  it.runIf(process.platform !== "win32")(
    "accepts process-group cleanup proof before root close notification",
    async () => {
      const cwd = await tempDir()
      const child = spawn(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        {
          cwd,
          detached: true,
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"]
        }
      )
      const pid = child.pid
      if (pid === undefined) {
        throw new Error("process-group cleanup fixture has no pid")
      }

      try {
        await terminateProcessTree({
          child,
          platform: process.platform,
          graceMs: 30,
          cleanupTimeoutMs: 1_000,
          async waitForClose() {
            return false
          },
          windowsTreeTerminator: {
            async terminate() {
              throw new Error("unexpected Windows process terminator")
            }
          }
        })

        await expectProcessGone(pid)
      } finally {
        killProcessGroupBestEffort(pid)
        await waitForChildClose(child)
      }
    }
  )

  it.runIf(process.platform !== "win32")(
    "cleans remaining process-group members after the root exits",
    async () => {
      const cwd = await tempDir()
      const pidFile = join(cwd, "exited-root-process-tree.json")
      const child = spawn(
        process.execPath,
        ["-e", exitingRootProcessTreeFixture, pidFile],
        {
          cwd,
          detached: true,
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"]
        }
      )
      const pids = await waitForProcessTreePidFile(pidFile)
      await waitForChildClose(child)

      try {
        expect(isProcessAlive(pids.grandchild)).toBe(true)
        await terminateProcessTree({
          child,
          platform: process.platform,
          graceMs: 30,
          cleanupTimeoutMs: 1_000,
          async waitForClose() {
            return true
          },
          windowsTreeTerminator: {
            async terminate() {
              throw new Error("unexpected Windows process terminator")
            }
          }
        })
        await expectProcessGone(pids.grandchild)
      } finally {
        killProcessGroupBestEffort(pids.root)
      }
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
      await expectProcessGone(pids.root)
      await expectProcessGone(pids.grandchild)
    }
  )

  it("cancels an active process before returning", async () => {
    const cwd = await tempDir()
    const pidFile = join(cwd, "active-process.pid")
    const controller = new AbortController()
    const host = new NodeExecutionHost({
      terminationGraceMs: 250,
      cleanupTimeoutMs: 2_000
    })
    const execution = host.execute({
      program: process.execPath,
      args: [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",
        pidFile
      ],
      cwd,
      signal: controller.signal
    })
    let pid: number
    try {
      pid = await waitForPositivePidFile(pidFile)
    } catch (error) {
      controller.abort()
      await execution.catch(() => undefined)
      throw error
    }
    controller.abort()
    const result = await execution

    expect(result, result.cleanupError).toMatchObject({
      termination: "cancelled",
      cleanup: "completed"
    })
    await expectProcessGone(pid)
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
    expect(terminated).toHaveLength(1)
    await expectProcessGone(terminated[0]!)
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

  it("executes through the native child supervisor with bounded evidence", async () => {
    const cwd = await tempDir()
    const host = nativeExecutionHost()
    const result = await host.execute({
      program: process.execPath,
      args: [
        "-e",
        "process.stdout.write('A'.repeat(50)+'Z'.repeat(50));process.stderr.write('B'.repeat(20)+'Y'.repeat(20))"
      ],
      cwd,
      output: { stdoutBytes: 20, stderrBytes: 10 }
    })

    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      termination: "exited",
      cleanup: "completed"
    })
    expect(result.stdout).toMatchObject({
      text: `${"A".repeat(10)}${"Z".repeat(10)}`,
      observedBytes: 100,
      retainedBytes: 20,
      truncated: true
    })
    expect(result.stderr).toMatchObject({
      text: `${"B".repeat(5)}${"Y".repeat(5)}`,
      observedBytes: 40,
      retainedBytes: 10,
      truncated: true
    })
  })

  it("streams retained native output across the protocol frame limit", async () => {
    const cwd = await tempDir()
    const retainedBytes = 2 * 1024 * 1024
    const result = await nativeExecutionHost().execute({
      program: process.execPath,
      args: [
        "-e",
        `process.stdout.write('A'.repeat(${retainedBytes / 2})+'Z'.repeat(${retainedBytes / 2}))`
      ],
      cwd,
      output: { stdoutBytes: retainedBytes }
    })

    expect(result).toMatchObject({
      exitCode: 0,
      termination: "exited",
      cleanup: "completed"
    })
    expect(result.stdout).toMatchObject({
      observedBytes: retainedBytes,
      retainedBytes,
      truncated: false
    })
    expect(result.stdout.text.startsWith("A".repeat(64))).toBe(true)
    expect(result.stdout.text.endsWith("Z".repeat(64))).toBe(true)
  })

  it("uses native process ownership to clean descendants on timeout", async () => {
    const cwd = await tempDir()
    const result = await nativeExecutionHost().execute({
      program: process.execPath,
      args: ["-e", processTreeFixture],
      cwd,
      timeoutMs: 300,
      output: { stdoutBytes: 256 }
    })

    expect(result).toMatchObject({
      termination: "timed_out",
      cleanup: "completed"
    })
    const pids = processTreePids(result.stdout.text)
    await expectProcessGone(pids.root)
    await expectProcessGone(pids.grandchild)
  })

  it("uses native process ownership to clean descendants on cancellation", async () => {
    const cwd = await tempDir()
    const pidFile = join(cwd, "native-cancel-process-tree.json")
    const controller = new AbortController()
    const execution = nativeExecutionHost().execute({
      program: process.execPath,
      args: ["-e", processTreeFixture, pidFile],
      cwd,
      signal: controller.signal,
      output: { stdoutBytes: 256 }
    })
    let pids: { readonly root: number; readonly grandchild: number }
    try {
      pids = await waitForProcessTreePidFile(pidFile)
    } catch (error) {
      controller.abort()
      await execution.catch(() => undefined)
      throw error
    }
    controller.abort()
    const result = await execution

    expect(result, result.cleanupError).toMatchObject({
      termination: "cancelled",
      cleanup: "completed"
    })
    await expectProcessGone(pids.root)
    await expectProcessGone(pids.grandchild)
  })

  it("redacts transient program and cwd when native spawn fails", async () => {
    const cwd = await tempDir()
    const program = join(cwd, "secret-program-that-does-not-exist")

    await expect(
      nativeExecutionHost().execute({
        program,
        cwd
      })
    ).rejects.toSatisfy((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return !message.includes(program) && !message.includes(cwd)
    })
  })

  it("requires recovery when a started helper exits without terminal evidence", async () => {
    const cwd = await tempDir()
    const program = join(cwd, "private-program")
    let terminateCalls = 0
    const supervisor: ChildSupervisor = {
      async start() {
        return {
          async wait() {
            throw new Error(`untrusted helper diagnostic ${program}`)
          },
          async terminate() {
            terminateCalls += 1
          }
        }
      }
    }
    const host = new NodeExecutionHost({ childSupervisor: supervisor })

    await expect(host.execute({ program, cwd })).rejects.toMatchObject({
      name: "ExecutionCleanupRequiredError",
      message: "execution process tree cleanup could not be proven"
    })
    expect(terminateCalls).toBe(1)
  })

  it("settles owned child cleanup when the Host control pipe closes", async () => {
    const cwd = await tempDir()
    const helper = spawn(serviceBin, ["--workspace-child"], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    })
    const frames = lineFrames(helper.stdout)
    const claimToken = "a".repeat(64)
    const identity = {
      run_id: "wtsk_pipe_eof",
      attempt_id: "wtat_pipe_eof",
      child_id: "exch_pipe_eof",
      claim_token_sha256: createHash("sha256")
        .update(claimToken)
        .digest("hex")
    }
    helper.stdin.write(`${JSON.stringify({
      protocol: 1,
      kind: "workspace_child_start",
      ...identity,
      program: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      cwd,
      environment: { PATH: process.env.PATH ?? "" },
      stdin_base64: "",
      stdout_limit_bytes: 256,
      stderr_limit_bytes: 256,
      termination_grace_ms: 30
    })}\n`)
    expect(await frames.next()).toMatchObject({
      kind: "workspace_child_ready",
      ...identity
    })
    helper.stdin.end()
    const terminal = await nextFrameOfKind(frames, "workspace_child_terminal")
    expect(terminal).toMatchObject({
      kind: "workspace_child_terminal",
      termination: "pipe_eof",
      cleanup: "completed",
      ...identity
    })
    await waitForChildClose(helper)
  })

  it("keeps different supervisor claims isolated while cancelling one child", async () => {
    const cwd = await tempDir()
    const firstController = new AbortController()
    const first = claimedExecutionHost("run_first", "attempt_first").execute({
      program: process.execPath,
      args: ["-e", processTreeFixture],
      cwd,
      signal: firstController.signal,
      output: { stdoutBytes: 256 }
    })
    const second = claimedExecutionHost("run_second", "attempt_second").execute({
      program: process.execPath,
      args: ["-e", "setTimeout(()=>process.stdout.write('second-complete'),600)"],
      cwd,
      output: { stdoutBytes: 64 }
    })
    setTimeout(() => firstController.abort(), 300)

    await expect(first).resolves.toMatchObject({
      termination: "cancelled",
      cleanup: "completed"
    })
    await expect(second).resolves.toMatchObject({
      termination: "exited",
      cleanup: "completed",
      stdout: { text: "second-complete" }
    })
  })
})

const processTreeFixture = [
  "const {spawn}=require('node:child_process')",
  "const {renameSync,writeFileSync}=require('node:fs')",
  "const grandchild=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true})",
  "const pids={root:process.pid,grandchild:grandchild.pid}",
  "if(process.argv[1]){writeFileSync(process.argv[1]+'.tmp',JSON.stringify(pids));renameSync(process.argv[1]+'.tmp',process.argv[1])}",
  "process.stdout.write(JSON.stringify(pids)+'\\n')",
  "setInterval(()=>{},1000)"
].join(";")

const stubbornProcessTreeFixture =
  "process.on('SIGTERM',()=>{});" + processTreeFixture

const exitingRootProcessTreeFixture = [
  "const {spawn}=require('node:child_process')",
  "const {renameSync,writeFileSync}=require('node:fs')",
  "const grandchild=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true})",
  "grandchild.unref()",
  "const pids={root:process.pid,grandchild:grandchild.pid}",
  "writeFileSync(process.argv[1]+'.tmp',JSON.stringify(pids))",
  "renameSync(process.argv[1]+'.tmp',process.argv[1])"
].join(";")

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-execution-host-"))
  tempDirs.push(dir)
  return dir
}

async function waitForPositivePidFile(path: string): Promise<number> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      return positivePid((await readFile(path, "utf8")).trim(), "root")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("active process did not publish its pid")
}

async function waitForProcessTreePidFile(
  path: string
): Promise<{ readonly root: number; readonly grandchild: number }> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      return processTreePids(await readFile(path, "utf8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("process tree fixture did not publish its pids")
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

function killProcessGroupBestEffort(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false
    throw error
  }
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
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`process tree fixture returned invalid ${name} pid`)
  }
  return number
}

function nativeExecutionHost(): NodeExecutionHost {
  return new NodeExecutionHost({
    childSupervisor: new NativeChildSupervisor({ serviceBin }),
    terminationGraceMs: 30,
    cleanupTimeoutMs: 1_000
  })
}

function claimedExecutionHost(runId: string, attemptId: string): NodeExecutionHost {
  return new NodeExecutionHost({
    childSupervisor: new NativeChildSupervisor({ serviceBin }),
    supervisorClaim: {
      runId,
      attemptId,
      claimToken: "b".repeat(64)
    },
    terminationGraceMs: 30,
    cleanupTimeoutMs: 1_000
  })
}

function lineFrames(stream: NodeJS.ReadableStream): {
  next(): Promise<Record<string, unknown>>
} {
  let buffer = ""
  let terminalError: Error | undefined
  const queued: Record<string, unknown>[] = []
  const waiters: Array<{
    resolve(frame: Record<string, unknown>): void
    reject(error: Error): void
  }> = []
  const finish = (error: Error) => {
    if (terminalError !== undefined) return
    terminalError = error
    for (const waiter of waiters.splice(0)) waiter.reject(error)
  }
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    buffer += chunk
    while (true) {
      const newline = buffer.indexOf("\n")
      if (newline < 0) return
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      let frame: Record<string, unknown>
      try {
        frame = JSON.parse(line) as Record<string, unknown>
      } catch (cause) {
        finish(new Error("workspace child emitted an invalid protocol frame", {
          cause
        }))
        return
      }
      const waiter = waiters.shift()
      if (waiter === undefined) queued.push(frame)
      else waiter.resolve(frame)
    }
  })
  stream.once("end", () => {
    finish(new Error("workspace child protocol stream ended before the next frame"))
  })
  stream.once("error", (cause) => {
    finish(new Error("workspace child protocol stream failed", { cause }))
  })
  return {
    async next() {
      const frame = queued.shift()
      if (frame !== undefined) return frame
      if (terminalError !== undefined) throw terminalError
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        waiters.push({ resolve, reject })
      })
    }
  }
}

async function nextFrameOfKind(
  frames: { next(): Promise<Record<string, unknown>> },
  kind: string
): Promise<Record<string, unknown>> {
  while (true) {
    const frame = await frames.next()
    if (frame.kind === kind) {
      return frame
    }
  }
}

async function waitForChildClose(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("workspace child helper did not close")),
      2_000
    )
    child.once("close", () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}
