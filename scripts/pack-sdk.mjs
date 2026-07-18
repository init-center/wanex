#!/usr/bin/env node
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
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
  const { stdout } = await execFileAsync(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", tarballRoot],
    { cwd: stagingDir, maxBuffer: 10 * 1024 * 1024 }
  )
  const packed = JSON.parse(stdout)[0]
  if (packed === undefined) {
    throw new Error(`npm pack returned no artifact for ${packageInfo.name}`)
  }
  const tarballPath = join(tarballRoot, packed.filename)
  const bytes = await readFile(tarballPath)
  const manifest = JSON.parse(await readFile(join(stagingDir, "package.json"), "utf8"))
  artifacts.push({
    name: packageInfo.name,
    version: manifest.version,
    filename: packed.filename,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    entries: packageInfo.entries.map((entry) => entry.exportPath),
    dependencies: manifest.dependencies ?? {},
    files: packed.files
      .map((file) => ({ path: file.path, bytes: file.size }))
      .sort((left, right) => left.path.localeCompare(right.path))
  })
  console.log(`${packageInfo.name}: ${packed.filename}`)
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
