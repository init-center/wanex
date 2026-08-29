import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises"
import { join, resolve } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const pluginId = "wanex.proof.extension"
const commandId = "wanex.proof.extension.echo"
const fixtureSource = resolve(
  import.meta.dirname,
  "../test/fixtures/plugin-host.rs"
)

export async function createDesktopPluginProofFixtures(options) {
  const root = resolve(options.root)
  const platform = options.platform ?? process.platform
  const executableName = platform === "win32" ? "plugin-host.exe" : "plugin-host"
  const compiled = join(root, ".build", executableName)
  await mkdir(join(root, ".build"), { recursive: true })
  await execFileAsync(options.rustc ?? "rustc", [
    fixtureSource,
    "--edition=2021",
    "-C",
    "opt-level=s",
    "-C",
    "strip=symbols",
    "-o",
    compiled
  ], { maxBuffer: 4 * 1024 * 1024 })

  const v1 = await createVersion("1.0.0")
  const v2 = await createVersion("2.0.0")
  return { pluginId, commandId, v1, v2 }

  async function createVersion(version) {
    const packageRoot = join(root, version)
    const command = `bin/${executableName}`
    const executable = join(packageRoot, command)
    await mkdir(join(packageRoot, "bin"), { recursive: true })
    await copyFile(compiled, executable)
    if (platform !== "win32") await chmod(executable, 0o755)
    const binary = await readFile(executable)
    const layout = {
      kind: "wanex.plugin.package.layout.v1",
      pluginId,
      version,
      name: "Proof Extension",
      entry: {
        kind: "wanex.plugin.host.subprocess.v1",
        command,
        args: [version],
        timeoutMs: 5_000,
        actions: [{ actionId: "echo", capability: "config.read" }]
      },
      capabilities: ["config.read"],
      contributes: {
        commands: [{
          id: commandId,
          name: "proof-extension-echo",
          title: "Proof extension echo",
          category: "extensions",
          paletteVisibility: "visible",
          actionId: "echo"
        }]
      },
      files: [{
        path: command,
        bytes: binary.byteLength,
        sha256: createHash("sha256").update(binary).digest("hex"),
        executable: true
      }]
    }
    await writeFile(
      join(packageRoot, "wanex.plugin.json"),
      `${JSON.stringify(layout, null, 2)}\n`,
      "utf8"
    )
    return {
      root: packageRoot,
      executable,
      version,
      bytes: (await stat(executable)).size,
      artifactFileCount: 1
    }
  }
}
