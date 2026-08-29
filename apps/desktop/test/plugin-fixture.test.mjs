import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createDesktopPluginProofFixtures
} from "../scripts/plugin-fixture.mjs"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) =>
    rm(dir, { recursive: true, force: true })
  ))
})

describe("Desktop Plugin proof fixture", () => {
  it("builds exact-version native packages without Node dependencies", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanex-desktop-plugin-proof-"))
    tempDirs.push(root)
    const fixtures = await createDesktopPluginProofFixtures({ root })

    expect(fixtures.pluginId).toBe("wanex.proof.extension")
    expect(fixtures.commandId).toBe("wanex.proof.extension.echo")
    for (const fixture of [fixtures.v1, fixtures.v2]) {
      const layout = JSON.parse(await readFile(
        join(fixture.root, "wanex.plugin.json"),
        "utf8"
      ))
      const executable = await readFile(fixture.executable)
      expect(layout).toMatchObject({
        kind: "wanex.plugin.package.layout.v1",
        pluginId: fixtures.pluginId,
        version: fixture.version,
        entry: {
          command: expect.stringMatching(/^bin\/plugin-host(?:\.exe)?$/),
          args: [fixture.version]
        },
        contributes: {
          commands: [{ id: fixtures.commandId }]
        },
        files: [{
          bytes: executable.byteLength,
          executable: true
        }]
      })
      expect(layout).not.toHaveProperty("runtimeDependencies")
      expect((await stat(fixture.executable)).isFile()).toBe(true)

      const response = await executeFixture(fixture.executable, fixture.version)
      expect(response).toEqual({
        protocol: "wanex.plugin.host.v1",
        type: "result",
        result: { fixture: true, version: fixture.version }
      })
    }
  }, 120_000)
})

function executeFixture(executable, version) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [version], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.once("error", reject)
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`fixture exited ${String(code)}: ${stderr}`))
        return
      }
      try {
        resolve(JSON.parse(stdout.trim()))
      } catch (error) {
        reject(error)
      }
    })
    child.stdin.end(`${JSON.stringify({
      protocol: "wanex.plugin.host.v1",
      type: "execute",
      request: { jobId: "job_fixture" }
    })}\n`)
  })
}
