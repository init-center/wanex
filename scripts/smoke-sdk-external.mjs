#!/usr/bin/env node
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { build } from "esbuild"
import { resolveStepCommand } from "./process-step.mjs"
import { loadSdkDistributionPolicy } from "./sdk/distribution-policy.mjs"

const execFileAsync = promisify(execFile)
const policy = await loadSdkDistributionPolicy()
const report = JSON.parse(await readFile(
  join(policy.outputDir, "reports/artifacts.json"),
  "utf8"
))
const projectDir = await mkdtemp(join(tmpdir(), "wanex-sdk-consumer-"))

try {
  await writeFile(join(projectDir, "package.json"), `${JSON.stringify({
    name: "wanex-sdk-external-smoke",
    version: "1.0.0",
    private: true,
    type: "module"
  }, null, 2)}\n`, "utf8")
  const tarballs = report.packages.map((artifact) =>
    join(policy.outputDir, "tarballs", artifact.filename)
  )
  const installCommand = resolveStepCommand({
    command: "npm",
    args: [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...tarballs,
      "typescript@6.0.3",
      "@types/node@24.13.3"
    ]
  })
  await execFileAsync(installCommand.command, installCommand.args, {
    cwd: projectDir,
    maxBuffer: 20 * 1024 * 1024
  })

  const specifiers = policy.packages.flatMap((packageInfo) =>
    packageInfo.entries.map((entry) => entry.exportPath === "."
      ? packageInfo.name
      : `${packageInfo.name}${entry.exportPath.slice(1)}`)
  )
  await writeFile(
    join(projectDir, "imports.mjs"),
    `${specifiers.map((specifier) => `await import(${JSON.stringify(specifier)})`).join("\n")}\nconsole.log("imports:${specifiers.length}")\n`,
    "utf8"
  )
  const imported = await execFileAsync(process.execPath, ["imports.mjs"], {
    cwd: projectDir,
    maxBuffer: 10 * 1024 * 1024
  })
  if (!imported.stdout.includes(`imports:${specifiers.length}`)) {
    throw new Error("plain Node did not import every SDK entry")
  }

  await writeFile(
    join(projectDir, "types.ts"),
    `${specifiers.map((specifier, index) =>
      `import * as entry${index} from ${JSON.stringify(specifier)}\nvoid entry${index}`
    ).join("\n")}\n`,
    "utf8"
  )
  await writeFile(join(projectDir, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: ["node"]
    },
    include: ["types.ts"]
  }, null, 2)}\n`, "utf8")
  const projectRequire = createRequire(join(projectDir, "package.json"))
  const tscCli = projectRequire.resolve("typescript/bin/tsc")
  await execFileAsync(process.execPath, [tscCli, "-p", "tsconfig.json"], {
    cwd: projectDir,
    maxBuffer: 20 * 1024 * 1024
  })

  await writeFile(
    join(projectDir, "runtime-entry.mjs"),
    'import { createWanexRuntime } from "@wanex/runtime"\nconsole.log(typeof createWanexRuntime)\n',
    "utf8"
  )
  await writeFile(
    join(projectDir, "app-entry.mjs"),
    'import { createWanexApp } from "@wanex/app"\nconsole.log(typeof createWanexApp)\n',
    "utf8"
  )
  const runtimeBundle = await bundleConsumer(projectDir, "runtime-entry.mjs")
  const appBundle = await bundleConsumer(projectDir, "app-entry.mjs")
  assertOptionalClosureAbsent("Runtime", runtimeBundle, [
    "@wanex/app",
    "@wanex/extension",
    "@wanex/mcp",
    "@wanex/workspace",
    "@wanex/team",
    "@wanex/plugin",
    "@wanex/connector"
  ])
  assertOptionalClosureAbsent("App", appBundle, [
    "@wanex/extension",
    "@wanex/mcp",
    "@wanex/workspace",
    "@wanex/team",
    "@wanex/plugin",
    "@wanex/connector"
  ])

  console.log("Wanex External SDK Smoke")
  console.log("")
  console.log(`Packages installed: ${policy.packages.length}`)
  console.log(`Entries imported and typechecked: ${specifiers.length}`)
  console.log(`Runtime bundle inputs: ${Object.keys(runtimeBundle.metafile.inputs).length}`)
  console.log(`App bundle inputs: ${Object.keys(appBundle.metafile.inputs).length}`)
  console.log("Failures: 0")
} finally {
  await rm(projectDir, { recursive: true, force: true })
}

async function bundleConsumer(projectDir, entry) {
  return await build({
    absWorkingDir: projectDir,
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    write: false,
    metafile: true,
    logLevel: "silent"
  })
}

function assertOptionalClosureAbsent(label, result, forbiddenPackages) {
  const inputs = Object.keys(result.metafile.inputs).map((path) => path.replaceAll("\\", "/"))
  for (const packageName of forbiddenPackages) {
    const packagePath = `/node_modules/${packageName}/`
    if (inputs.some((path) => path.includes(packagePath))) {
      throw new Error(`${label} bundle includes forbidden optional package ${packageName}`)
    }
  }
}
