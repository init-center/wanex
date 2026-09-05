#!/usr/bin/env node
import { createRequire } from "node:module"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { build } from "esbuild"
import { resolvePackageBinary } from "./process-step.mjs"

export const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const distributionRoot = join(
  workspaceRoot,
  "target/distribution/server"
)
export const stagingRoot = join(distributionRoot, "staging")

const nativeTargetPackages = new Map([
  ["darwin-arm64", "@napi-rs/keyring-darwin-arm64"],
  ["darwin-x64", "@napi-rs/keyring-darwin-x64"],
  ["linux-x64", "@napi-rs/keyring-linux-x64-gnu"],
  ["win32-x64", "@napi-rs/keyring-win32-x64-msvc"]
])
const nativeTargetBindingFiles = new Map([
  ["darwin-arm64", "keyring.darwin-arm64.node"],
  ["darwin-x64", "keyring.darwin-x64.node"],
  ["linux-x64", "keyring.linux-x64-gnu.node"],
  ["win32-x64", "keyring.win32-x64-msvc.node"]
])
const execFileAsync = promisify(execFile)

if (import.meta.main) {
  const targetId = process.argv.includes("--target")
    ? process.argv[process.argv.indexOf("--target") + 1]
    : `${process.platform}-${process.arch}`
  if (!targetId) throw new Error("--target requires a value")
  const receipt = await buildServerDistribution({ targetId })
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

export async function buildServerDistribution(options) {
  const targetId = options.targetId
  const outputRoot = resolve(options.outputRoot ?? stagingRoot)
  const nativeRoot = join(outputRoot, "native")
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })

  await build({
    absWorkingDir: workspaceRoot,
    entryPoints: ["apps/server/src/cli/main.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node26",
    outfile: join(outputRoot, "server.mjs"),
    external: ["@napi-rs/keyring", "@napi-rs/keyring-*", "yaml"]
  })

  const native = await stageNativeArtifact({
    targetId,
    outputDir: nativeRoot,
    sourceBin: options.sourceBin
  })
  await copyKeyringBinding({ outputRoot, targetId })
  await copyYamlRuntime({ outputRoot })
  await writeFile(join(outputRoot, "package.json"), `${JSON.stringify({
    name: "wanex-server",
    version: "0.0.0",
    private: true,
    type: "module",
    main: "server.mjs",
    bin: { "wanex-server": "server.mjs" },
    engines: { node: ">=26" }
  }, null, 2)}\n`, "utf8")

  const files = await listFiles(outputRoot)
  const bytes = (await Promise.all(files.map(async (path) =>
    (await stat(join(outputRoot, path))).size
  ))).reduce((total, value) => total + value, 0)
  return {
    kind: "wanex.server.distribution-receipt",
    targetId,
    outputRoot,
    native,
    files,
    bytes
  }
}

async function stageNativeArtifact(options) {
  const args = [
    resolvePackageBinary("tsx", "tsx"),
    join(workspaceRoot, "scripts/stage-native-artifact.ts"),
    "--target", options.targetId,
    "--output-dir", options.outputDir
  ]
  if (options.sourceBin !== undefined) args.push("--source-bin", options.sourceBin)
  const { stdout } = await execFileAsync(process.execPath, args, {
    cwd: workspaceRoot,
    maxBuffer: 20 * 1024 * 1024
  })
  return JSON.parse(stdout.trim())
}

async function copyKeyringBinding(options) {
  const packageName = nativeTargetPackages.get(options.targetId)
  const bindingFile = nativeTargetBindingFiles.get(options.targetId)
  if (packageName === undefined || bindingFile === undefined) {
    throw new Error(`unsupported keyring target: ${options.targetId}`)
  }
  const localStoreManifest = join(
    workspaceRoot,
    "apps/assistant-host/node_modules/@wanex/local-credential-store/package.json"
  )
  const localStoreRequire = createRequire(localStoreManifest)
  const keyringEntry = localStoreRequire.resolve("@napi-rs/keyring")
  const keyringRoot = dirname(keyringEntry)
  const bindingRoot = join(
    workspaceRoot,
    "node_modules/.pnpm/node_modules",
    packageName
  )
  const bindingEntry = join(bindingRoot, bindingFile)
  const targetRoot = join(options.outputRoot, "node_modules/@napi-rs/keyring")
  await mkdir(targetRoot, { recursive: true })
  await Promise.all([
    cp(join(keyringRoot, "index.js"), join(targetRoot, "index.js")),
    cp(join(keyringRoot, "keytar.js"), join(targetRoot, "keytar.js")),
    cp(bindingEntry, join(targetRoot, bindingFile))
  ])
  await writeFile(join(targetRoot, "package.json"), `${JSON.stringify({
    name: "@napi-rs/keyring",
    version: "1.3.0",
    main: "index.js"
  }, null, 2)}\n`, "utf8")
}

async function copyYamlRuntime(options) {
  const runtimeRequire = createRequire(join(workspaceRoot, "packages/runtime/package.json"))
  const yamlEntry = runtimeRequire.resolve("yaml")
  const yamlRoot = dirname(dirname(yamlEntry))
  const targetRoot = join(options.outputRoot, "node_modules/yaml")
  await mkdir(targetRoot, { recursive: true })
  await Promise.all([
    copyJavaScriptTree(join(yamlRoot, "dist"), join(targetRoot, "dist")),
    cp(join(yamlRoot, "package.json"), join(targetRoot, "package.json"))
  ])
}

async function copyJavaScriptTree(sourceRoot, targetRoot) {
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    const source = join(sourceRoot, entry.name)
    const target = join(targetRoot, entry.name)
    if (entry.isDirectory()) {
      await copyJavaScriptTree(source, target)
    } else if (entry.isFile() && /\.m?js$/u.test(entry.name)) {
      await mkdir(dirname(target), { recursive: true })
      await cp(source, target)
    }
  }
}

async function listFiles(root, current = root) {
  const entries = await (await import("node:fs/promises")).readdir(current, {
    withFileTypes: true
  })
  const files = []
  for (const entry of entries) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(root, path))
    else if (entry.isFile()) files.push(path.slice(root.length + 1).replaceAll("\\", "/"))
    else throw new Error(`distribution contains unsupported entry: ${path}`)
  }
  return files.sort()
}

export async function auditServerDistribution(
  root = stagingRoot,
  targetId = targetIdForHost()
) {
  const files = await listFiles(root)
  const required = [
    "native/runtime-artifacts.json",
    "package.json",
    "server.mjs"
  ]
  for (const path of required) {
    if (!files.includes(path)) throw new Error(`server distribution is missing ${path}`)
  }
  if (files.some((path) => path.includes("/src/") || path.includes("/target/"))) {
    throw new Error("server distribution contains workspace source or target paths")
  }
  if (files.some((path) => path.includes("credentials") || path.endsWith(".pem"))) {
    throw new Error("server distribution contains credentials")
  }
  if (files.some((path) => path.includes("node_modules/.pnpm") || path.includes("/node_modules/"))) {
    throw new Error("server distribution contains a nested dependency tree")
  }
  const allowedDependencyRoots = [
    "node_modules/@napi-rs/keyring/",
    "node_modules/yaml/"
  ]
  if (files.some((path) => path.startsWith("node_modules/") &&
      !allowedDependencyRoots.some((root) => path.startsWith(root)))) {
    throw new Error("server distribution contains an undeclared dependency")
  }
  const packageManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  if (
    packageManifest.main !== "server.mjs" ||
    packageManifest.type !== "module" ||
    packageManifest.dependencies !== undefined ||
    packageManifest.devDependencies !== undefined
  ) {
    throw new Error("server distribution manifest has undeclared dependencies")
  }
  const manifest = JSON.parse(await readFile(
    join(root, "native/runtime-artifacts.json"),
    "utf8"
  ))
  const target = manifest.targets.find((item) => item.id === targetId)
  if (target === undefined) throw new Error("server distribution native target does not match host")
  const nativePath = join(root, "native", ...target.systemService.path.split("/"))
  const nativeBytes = await readFile(nativePath)
  if (nativeBytes.byteLength !== target.systemService.bytes) {
    throw new Error("server distribution native artifact size does not match manifest")
  }
  if (createHash("sha256").update(nativeBytes).digest("hex") !== target.systemService.sha256) {
    throw new Error("server distribution native artifact checksum does not match manifest")
  }
  return files
}

function targetIdForHost() {
  return `${process.platform}-${process.arch}`
}
