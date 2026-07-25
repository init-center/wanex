#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { build } from "esbuild"
import { rollup } from "rollup"
import { dts } from "rollup-plugin-dts"
import ts from "typescript"
import {
  artifactBareImportIsExternal,
  createStagingManifest,
  encodedPackageName,
  isAbsoluteModuleId,
  loadSdkDistributionPolicy,
  workspaceRoot
} from "./sdk/distribution-policy.mjs"
import { extractModuleSpecifiers } from "./sdk/artifact-policy.mjs"

const options = parseArgs(process.argv.slice(2))
const policy = await loadSdkDistributionPolicy()
const selected = options.packages.length === 0
  ? policy.packages
  : policy.packages.filter((item) => options.packages.includes(item.name))
if (selected.length !== (options.packages.length === 0
  ? policy.packages.length
  : options.packages.length)) {
  const selectedNames = new Set(selected.map((item) => item.name))
  const missing = options.packages.filter((name) => !selectedNames.has(name))
  throw new Error(`unknown SDK package: ${missing.join(", ")}`)
}

const stagingRoot = join(policy.outputDir, "staging")
if (options.clean) {
  await rm(policy.outputDir, { recursive: true, force: true })
}
await mkdir(stagingRoot, { recursive: true })

for (const packageInfo of selected) {
  await buildPackage({ packageInfo, policy, stagingRoot })
}

console.log(`SDK staging built: ${selected.length} packages`)

async function buildPackage(request) {
  const stagingDir = join(
    request.stagingRoot,
    encodedPackageName(request.packageInfo.name)
  )
  await rm(stagingDir, { recursive: true, force: true })
  await mkdir(join(stagingDir, "dist"), { recursive: true })
  for (const entry of request.packageInfo.entries) {
    const sourcePath = resolve(request.packageInfo.packageDir, entry.sourceTarget)
    const jsPath = join(stagingDir, "dist", `${entry.artifactPath}.js`)
    const declarationPath = join(
      stagingDir,
      "dist",
      `${entry.artifactPath}.d.ts`
    )
    await mkdir(dirname(jsPath), { recursive: true })
    await buildJavaScript({
      sourcePath,
      outputPath: jsPath,
      platform: request.packageInfo.platform,
      policy: request.policy
    })
    await buildDeclarations({
      sourcePath,
      outputPath: declarationPath,
      policy: request.policy
    })
  }
  const manifest = createStagingManifest(request.packageInfo)
  await writeFile(
    join(stagingDir, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  )
  await cp(
    join(request.packageInfo.packageDir, "README.md"),
    join(stagingDir, "README.md")
  )
  await assertNoInternalProtocol(stagingDir)
  console.log(`${request.packageInfo.name}: ${request.packageInfo.entries.length} entries`)
}

async function buildJavaScript(request) {
  await build({
    absWorkingDir: workspaceRoot,
    entryPoints: [request.sourcePath],
    outfile: request.outputPath,
    bundle: true,
    format: "esm",
    platform: request.platform,
    target: request.platform === "node" ? "node24" : "es2022",
    packages: "external",
    sourcemap: false,
    minify: false,
    legalComments: "none",
    logLevel: "silent",
    alias: {
      "@wanex/protocol": join(workspaceRoot, "packages/protocol/src/index.ts")
    }
  })
  const output = await readFile(request.outputPath, "utf8")
  const withoutModulePathComments = output
    .split("\n")
    .filter((line) => !/^\/\/ (?:packages|apps|node_modules)\//.test(line))
    .join("\n")
  await writeFile(request.outputPath, withoutModulePathComments, "utf8")
}

async function buildDeclarations(request) {
  const bundle = await rollup({
    input: request.sourcePath,
    external: (id) => artifactBareImportIsExternal(id, request.policy),
    plugins: [dts({
      respectExternal: true,
      compilerOptions: {
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
        strict: true,
        stripInternal: true,
        skipLibCheck: true
      }
    })],
    onwarn(warning, warn) {
      if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning)
    }
  })
  try {
    await bundle.write({ file: request.outputPath, format: "es" })
  } finally {
    await bundle.close()
  }
}

async function assertNoInternalProtocol(stagingDir) {
  const files = await import("node:fs/promises").then(({ readdir }) =>
    readdir(join(stagingDir, "dist"), { recursive: true, withFileTypes: true })
  )
  for (const file of files) {
    if (!file.isFile() || (!file.name.endsWith(".js") && !file.name.endsWith(".d.ts"))) {
      continue
    }
    const path = join(file.parentPath, file.name)
    const content = await readFile(path, "utf8")
    if (
      /(?:\bfrom\s*|\bimport\s*\()\s*["']@wanex\/protocol(?:\/[^"']*)?["']/.test(
        content
      )
    ) {
      throw new Error(`internal protocol leaked into ${path}`)
    }
    if (
      content.includes(workspaceRoot) ||
      extractModuleSpecifiers(content).some((specifier) => isAbsoluteModuleId(specifier))
    ) {
      throw new Error(`absolute workspace path leaked into ${path}`)
    }
    if (/(?:packages|apps)[\\/]+[^\n"']+[\\/]+src[\\/]+/.test(content)) {
      throw new Error(`workspace source path leaked into ${path}`)
    }
  }
}

function parseArgs(args) {
  const packages = []
  let clean = true
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--") continue
    if (arg === "--package") {
      const value = args[index + 1]
      if (value === undefined) throw new Error("--package requires a value")
      packages.push(value)
      index += 1
      continue
    }
    if (arg === "--no-clean") {
      clean = false
      continue
    }
    throw new Error(`unknown build-sdk argument: ${String(arg)}`)
  }
  return { clean, packages: [...new Set(packages)] }
}
