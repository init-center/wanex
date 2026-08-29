import { createServer } from "node:net"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  MacosSeatbeltExecutionEnvironment,
  NativeChildSupervisor,
  NativeExecutionEnvironment
} from "../src/execution/index.js"
import type { ExecutionPolicySnapshot } from "@wanex/protocol"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
)

describe.runIf(process.platform === "darwin")("macOS Seatbelt environment", () => {
  it("enforces the admitted root in nested Node processes", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanex-seatbelt-root-"))
    const outside = await mkdtemp(join(tmpdir(), "wanex-seatbelt-outside-"))
    const outsideSecret = join(outside, "secret.txt")
    const outsideWrite = join(outside, "should-not-exist.txt")
    const insideWrite = join(root, "inside.txt")
    await writeFile(outsideSecret, "outside", "utf8")
    const environment = createEnvironment("seatbelt_root")
    try {
      const scope = await environment.bind({
        scopeId: "scope_seatbelt_root",
        policy: policy({ isolation: "os" }),
        fileSystemRoots: [{ id: "workspace", path: root }],
        supervisorClaim: claim("scope_seatbelt_root")
      })
      const result = await scope.process.execute({
        program: process.execPath,
        args: [
          "-e",
          [
            "const fs=require('node:fs')",
            "const outcome={}",
            "try{outcome.read=fs.readFileSync(process.argv[1],'utf8')}catch(error){outcome.readError=error.code}",
            "try{fs.writeFileSync(process.argv[2],'blocked')}catch(error){outcome.writeError=error.code}",
            "fs.writeFileSync(process.argv[3],'inside')",
            "process.stdout.write(JSON.stringify(outcome))"
          ].join(";"),
          outsideSecret,
          outsideWrite,
          insideWrite
        ],
        cwd: root
      })
      expect(result).toMatchObject({
        termination: "exited",
        exitCode: 0,
        cleanup: "completed"
      })
      expect(JSON.parse(result.stdout.text)).toMatchObject({
        readError: expect.stringMatching(/^(EACCES|EPERM)$/),
        writeError: expect.stringMatching(/^(EACCES|EPERM)$/)
      })
      await expect(readFile(insideWrite, "utf8")).resolves.toBe("inside")
      await expect(readFile(outsideWrite, "utf8")).rejects.toMatchObject({
        code: "ENOENT"
      })
      await scope.close()
    } finally {
      await environment.close()
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("enforces network policy at the OS boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanex-seatbelt-network-"))
    const server = createServer((socket) => {
      socket.on("error", () => {})
      socket.end("connected")
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("test server did not expose a TCP port")
    }
    const environment = createEnvironment("seatbelt_network")
    try {
      const run = async (network: ExecutionPolicySnapshot["network"], scopeId: string) => {
        const scope = await environment.bind({
          scopeId,
          policy: policy({ network, isolation: "os" }),
          fileSystemRoots: [{ id: "workspace", path: root }],
          supervisorClaim: claim(scopeId)
        })
        try {
          const result = await scope.process.execute({
            program: process.execPath,
            args: [
              "-e",
              "const net=require('node:net');const s=net.createConnection({host:'127.0.0.1',port:Number(process.argv[1])});s.once('connect',()=>{process.stdout.write('connected');s.destroy()});s.once('error',()=>process.stdout.write('denied'))",
              String(address.port)
            ],
            cwd: root
          })
          return result
        } finally {
          await scope.close()
        }
      }

      await expect(run("denied", "scope_seatbelt_network_denied")).resolves.toMatchObject({
        stdout: { text: "denied" },
        cleanup: "completed"
      })
      await expect(run("unrestricted", "scope_seatbelt_network_open")).resolves.toMatchObject({
        stdout: { text: "connected" },
        cleanup: "completed"
      })
    } finally {
      await environment.close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(root, { recursive: true, force: true })
    }
  })

  it("keeps PTY interaction inside the Seatbelt execution boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanex-seatbelt-pty-"))
    const environment = createEnvironment("seatbelt_pty")
    try {
      const scope = await environment.bind({
        scopeId: "scope_seatbelt_pty",
        policy: policy({ pty: true }),
        fileSystemRoots: [{ id: "workspace", path: root }],
        supervisorClaim: claim("scope_seatbelt_pty")
      })
      expect(environment.capabilities.pty.supported).toBe(true)
      const terminal = await scope.terminal?.start({
        program: "/bin/sh",
        args: ["-c", "printf 'tty:%s\\n' \"$(test -t 0 && echo true || echo false)\"; while IFS= read -r line; do printf 'echo:%s\\n' \"$line\"; [ \"$line\" = finish ] && exit 0; done"],
        cwd: root,
        size: { columns: 80, rows: 24 },
        outputBytes: 4_096
      })
      expect(terminal).toBeDefined()
      await terminal!.write("finish\n")
      await expect(terminal!.wait()).resolves.toMatchObject({
        termination: "exited",
        exitCode: 0,
        cleanup: "completed",
        output: { text: expect.stringContaining("tty:true") }
      })
      await scope.close()
    } finally {
      await environment.close()
      await rm(root, { recursive: true, force: true })
    }
  })
})

function createEnvironment(environmentId: string): MacosSeatbeltExecutionEnvironment {
  return new MacosSeatbeltExecutionEnvironment({
    environmentId,
    childSupervisor: new NativeChildSupervisor({ serviceBin }),
    nativeEnvironmentFactory: (options) => new NativeExecutionEnvironment(options),
    terminationGraceMs: 30,
    cleanupTimeoutMs: 1_000
  })
}

function claim(scopeId: string) {
  return {
    runId: `run_${scopeId}`,
    attemptId: `attempt_${scopeId}`,
    claimToken: "c".repeat(64)
  }
}

function policy(
  overrides: {
    readonly network?: ExecutionPolicySnapshot["network"]
    readonly isolation?: ExecutionPolicySnapshot["isolation"]
    readonly pty?: boolean
  } = {},
): ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: [{ id: "workspace", effects: ["create", "read", "remove", "write"] }],
      maxReadBytes: 1024 * 1024,
      maxDirectoryEntries: 1_000
    },
    process: {
      oneShot: true,
      managed: overrides.pty ?? false,
      cleanup: "durable_supervisor",
      environmentVariables: []
    },
    network: overrides.network ?? "denied",
    isolation: overrides.isolation ?? "os",
    pty: overrides.pty ?? false
  }
}
