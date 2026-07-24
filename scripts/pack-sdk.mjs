#!/usr/bin/env node
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { promisify } from "node:util"
import { resolveStepCommand } from "./process-step.mjs"
import {
  encodedPackageName,
  loadSdkDistributionPolicy
} from "./sdk/distribution-policy.mjs"

const execFileAsync = promisify(execFile)
const policy = await loadSdkDistributionPolicy()
const stagingRoot = join(policy.outputDir, "staging")
const tarballRoot = join(policy.outputDir, "tarballs")
const reportRoot = join(policy.outputDir, "reports")
await rm(tarballRoot, { recursive: true, force: true })
await mkdir(tarballRoot, { recursive: true })
await mkdir(reportRoot, { recursive: true })

const artifacts = []
for (const packageInfo of policy.packages) {
  const stagingDir = join(stagingRoot, encodedPackageName(packageInfo.name))
  const packCommand = resolveStepCommand({
    command: "pnpm",
    args: [
      "--config.ignore-scripts=true",
      "pack",
      "--json",
      "--skip-manifest-obfuscation",
      "--pack-destination",
      tarballRoot
    ]
  })
  const { stdout } = await execFileAsync(
    packCommand.command,
    packCommand.args,
    { cwd: stagingDir, maxBuffer: 10 * 1024 * 1024 }
  )
  const packed = JSON.parse(stdout)
  if (
    typeof packed?.filename !== "string" ||
    !Array.isArray(packed.files)
  ) {
    throw new Error(`pnpm pack returned no artifact for ${packageInfo.name}`)
  }
  const filename = basename(packed.filename)
  const tarballPath = join(tarballRoot, filename)
  const bytes = await readFile(tarballPath)
  const manifest = JSON.parse(await readFile(join(stagingDir, "package.json"), "utf8"))
  const files = await Promise.all(
    packed.files.map(async (file) => ({
      path: file.path,
      bytes: (await stat(join(stagingDir, file.path))).size
    }))
  )
  artifacts.push({
    name: packageInfo.name,
    version: manifest.version,
    filename,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    entries: packageInfo.entries.map((entry) => entry.exportPath),
    dependencies: manifest.dependencies ?? {},
    files: files.sort((left, right) => left.path.localeCompare(right.path))
  })
  console.log(`${packageInfo.name}: ${filename}`)
}

const report = {
  schemaVersion: 1,
  packages: artifacts.sort((left, right) => left.name.localeCompare(right.name))
}
await writeFile(
  join(reportRoot, "artifacts.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
)
console.log(`SDK tarballs packed: ${artifacts.length}`)
