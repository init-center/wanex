#!/usr/bin/env node
import { packager } from "@electron/packager"
import { extractFile, listPackage } from "@electron/asar"
import { build } from "esbuild"
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const workspaceRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
export const boundaryRoot = join(workspaceRoot, "scripts/electron-boundary")
export const distributionRoot = join(workspaceRoot, "target/distribution/electron")
export const stagingDir = join(distributionRoot, "staging-app")
export const packageOutputDir = join(distributionRoot, "packaged")
export const nativeArtifactDir = join(workspaceRoot, "target/distribution/native")
export const electronZipDir = join(workspaceRoot, "target/tool-cache/electron")
const electronVersion = JSON.parse(await readFile(
  join(workspaceRoot, "node_modules/electron/package.json"),
  "utf8"
)).version

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2))
  const receipt = options.package
    ? await packageElectronBoundary()
    : await buildElectronBoundary()
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

export async function buildElectronBoundary() {
  await rm(stagingDir, { recursive: true, force: true })
  await mkdir(stagingDir, { recursive: true })
  await Promise.all([
    bundle({
      entry: join(boundaryRoot, "main.ts"),
      outfile: join(stagingDir, "main.cjs"),
      platform: "node",
      format: "cjs"
    }),
    bundle({
      entry: join(boundaryRoot, "preload.ts"),
      outfile: join(stagingDir, "preload.cjs"),
      platform: "node",
      format: "cjs"
    }),
    bundle({
      entry: join(boundaryRoot, "renderer.ts"),
      outfile: join(stagingDir, "renderer.js"),
      platform: "browser",
      format: "iife"
    }),
    cp(join(boundaryRoot, "renderer.html"), join(stagingDir, "renderer.html"))
  ])
  await writeFile(join(stagingDir, "package.json"), `${JSON.stringify({
    name: "wanex-electron-boundary",
    productName: "Wanex Boundary",
    version: "0.0.0",
    private: true,
    author: "Wanex Project",
    main: "main.cjs"
  }, null, 2)}\n`, "utf8")
  return await auditElectronStaging(stagingDir)
}

export async function packageElectronBoundary() {
  const staging = await buildElectronBoundary()
  await assertNativeArtifactDirectory(nativeArtifactDir)
  const cachedElectronZip = await hasHostElectronZip()
  await rm(packageOutputDir, { recursive: true, force: true })
  const outputPaths = await packager({
    dir: stagingDir,
    name: "Wanex Boundary",
    appVersion: "0.0.0",
    buildVersion: "0.0.0",
    platform: process.platform,
    arch: process.arch,
    asar: true,
    prune: true,
    overwrite: true,
    quiet: true,
    out: packageOutputDir,
    extraResource: nativeArtifactDir,
    electronVersion,
    ...(cachedElectronZip ? { electronZipDir } : {}),
    osxSign: false
  })
  if (outputPaths.length !== 1) {
    throw new Error(`expected one Electron package, received ${outputPaths.length}`)
  }
  const packaged = await auditPackagedElectronBoundary({
    packageDir: outputPaths[0],
    stagedNativeDir: nativeArtifactDir
  })
  return { staging, packaged }
}

async function hasHostElectronZip() {
  const name = `electron-v${electronVersion}-${process.platform}-${process.arch}.zip`
  try {
    return (await stat(join(electronZipDir, name))).isFile()
  } catch {
    return false
  }
}

export async function auditElectronStaging(root = stagingDir) {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  if (
    manifest.main !== "main.cjs" ||
    manifest.author !== "Wanex Project" ||
    manifest.type !== undefined
  ) {
    throw new Error("Electron staging manifest has an invalid entry")
  }
  if (manifest.dependencies !== undefined || manifest.devDependencies !== undefined) {
    throw new Error("Electron staging manifest must not declare dependencies")
  }
  const files = await listFiles(root)
  const expected = [
    "main.cjs",
    "package.json",
    "preload.cjs",
    "renderer.html",
    "renderer.js"
  ]
  if (JSON.stringify(files.map((item) => item.path)) !== JSON.stringify(expected)) {
    throw new Error(`Electron staging contains unexpected files: ${files.map((item) => item.path).join(",")}`)
  }
  for (const file of files.filter((item) => /\.(?:js|cjs|html)$/.test(item.path))) {
    const content = await readFile(join(root, file.path), "utf8")
    if (content.includes(workspaceRoot)) {
      throw new Error(`workspace path leaked into Electron staging: ${file.path}`)
    }
    if (
      /sourceMappingURL/.test(content) ||
      /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']@wanex\//.test(content)
    ) {
      throw new Error(`unbundled source reference in Electron staging: ${file.path}`)
    }
  }
  return {
    kind: "wanex.electron-boundary.staging-receipt",
    fileCount: files.length,
    bytes: sumBytes(files),
    hasNodeModules: files.some((item) => item.path.split("/").includes("node_modules"))
  }
}

export async function auditPackagedElectronBoundary({
  packageDir,
  stagedNativeDir
}) {
  const resourcesDir = process.platform === "darwin"
    ? join(packageDir, "Wanex Boundary.app/Contents/Resources")
    : join(packageDir, "resources")
  const files = await listFiles(packageDir)
  const relativeResources = relative(packageDir, resourcesDir).replaceAll("\\", "/")
  const asarPath = `${relativeResources}/app.asar`
  const nativePrefix = `${relativeResources}/native/`
  const nativeFiles = files.filter((item) => item.path.startsWith(nativePrefix))
  if (!files.some((item) => item.path === asarPath)) {
    throw new Error("packaged Electron application is missing app.asar")
  }
  const absoluteAsarPath = join(packageDir, asarPath)
  const asarEntries = listPackage(absoluteAsarPath, { isPack: false })
    .map(normalizeAsarEntry)
    .sort()
  const expectedAsarEntries = [
    "/main.cjs",
    "/package.json",
    "/preload.cjs",
    "/renderer.html",
    "/renderer.js"
  ]
  if (JSON.stringify(asarEntries) !== JSON.stringify(expectedAsarEntries)) {
    throw new Error(`packaged Electron ASAR contains unexpected entries: ${asarEntries.join(",")}`)
  }
  const asarManifest = JSON.parse(
    extractFile(absoluteAsarPath, "package.json").toString("utf8")
  )
  if (
    asarManifest.main !== "main.cjs" ||
    asarManifest.dependencies !== undefined ||
    asarManifest.devDependencies !== undefined
  ) {
    throw new Error("packaged Electron ASAR manifest violates the entry policy")
  }
  if (files.some((item) => item.path.includes("app.asar.unpacked"))) {
    throw new Error("packaged Electron application must not contain app.asar.unpacked")
  }
  if (nativeFiles.length !== 2) {
    throw new Error(`packaged Electron native resource must contain two files, received ${nativeFiles.length}`)
  }
  if (!nativeFiles.some((item) => item.path.endsWith("/runtime-artifacts.json"))) {
    throw new Error("packaged Electron native resource is missing its manifest")
  }
  const stagedNativeFiles = await listFiles(stagedNativeDir)
  for (const staged of stagedNativeFiles) {
    const packaged = nativeFiles.find((item) =>
      item.path === `${nativePrefix}${staged.path}`
    )
    if (packaged === undefined || packaged.bytes !== staged.bytes) {
      throw new Error(`packaged Electron native resource differs: ${staged.path}`)
    }
    const [stagedBytes, packagedBytes] = await Promise.all([
      readFile(join(stagedNativeDir, staged.path)),
      readFile(join(resourcesDir, "native", staged.path))
    ])
    if (!stagedBytes.equals(packagedBytes)) {
      throw new Error(`packaged Electron native resource bytes differ: ${staged.path}`)
    }
  }
  const forbidden = files.filter((item) =>
    /(^|\/)(?:node_modules|src|test|tests|fixtures|stores|caches)(\/|$)/.test(item.path)
  )
  if (forbidden.length > 0) {
    throw new Error(`forbidden packaged Electron paths: ${forbidden.map((item) => item.path).join(",")}`)
  }
  const asarBytes = files.find((item) => item.path === asarPath)?.bytes ?? 0
  const nativeBytes = sumBytes(nativeFiles)
  return {
    kind: "wanex.electron-boundary.package-receipt",
    packageDir,
    platform: process.platform,
    arch: process.arch,
    fileCount: files.length,
    unpackedBytes: sumBytes(files),
    asarBytes,
    asarEntryCount: asarEntries.length,
    nativeBytes,
    hasApplicationNodeModules: false,
    hasAsarUnpacked: false,
    nativeFileCount: nativeFiles.length
  }
}

export function normalizeAsarEntry(entry) {
  const normalized = entry.replaceAll("\\", "/")
  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

export function packagedExecutable(packageDir) {
  if (process.platform === "darwin") {
    return join(packageDir, "Wanex Boundary.app/Contents/MacOS/Wanex Boundary")
  }
  return join(packageDir, process.platform === "win32"
    ? "Wanex Boundary.exe"
    : "Wanex Boundary")
}

async function bundle(options) {
  const sourceResolver = options.platform === "node"
    ? await createWanexSourceResolver()
    : undefined
  await build({
    absWorkingDir: workspaceRoot,
    entryPoints: [options.entry],
    outfile: options.outfile,
    bundle: true,
    platform: options.platform,
    format: options.format,
    target: "es2022",
    external: options.platform === "node" ? ["electron"] : [],
    plugins: sourceResolver === undefined ? [] : [sourceResolver],
    sourcemap: false,
    minify: false,
    legalComments: "none",
    logLevel: "silent"
  })
}

async function createWanexSourceResolver() {
  const packageDirs = [
    "packages/protocol",
    "packages/storage",
    "packages/runtime",
    "packages/extension",
    "packages/app",
    "apps/product-app",
    "apps/product-app-web",
    "apps/product-app-local"
  ]
  const entries = new Map()
  for (const packageDir of packageDirs) {
    const absoluteDir = join(workspaceRoot, packageDir)
    const manifest = JSON.parse(await readFile(join(absoluteDir, "package.json"), "utf8"))
    for (const [subpath, target] of Object.entries(manifest.exports)) {
      if (typeof target !== "string") {
        throw new Error(`unsupported workspace export for ${manifest.name}: ${subpath}`)
      }
      const specifier = subpath === "."
        ? manifest.name
        : `${manifest.name}/${subpath.slice(2)}`
      entries.set(specifier, resolve(absoluteDir, target))
    }
  }
  return {
    name: "wanex-electron-source-closure",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@wanex\// }, (args) => {
        const path = entries.get(args.path)
        if (path === undefined) {
          return {
            errors: [{ text: `Electron default closure rejects workspace import: ${args.path}` }]
          }
        }
        return { path }
      })
    }
  }
}

async function assertNativeArtifactDirectory(root) {
  const files = await listFiles(root)
  if (files.length !== 2 || !files.some((item) => item.path === "runtime-artifacts.json")) {
    throw new Error("native artifact staging must contain one manifest and one executable")
  }
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, path))
      continue
    }
    const status = await stat(path)
    files.push({
      path: relative(root, path).replaceAll("\\", "/"),
      bytes: status.size
    })
  }
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function sumBytes(files) {
  return files.reduce((sum, item) => sum + item.bytes, 0)
}

function parseArgs(args) {
  let packageApp = false
  for (const arg of args) {
    if (arg === "--package") packageApp = true
    else throw new Error(`unknown Electron boundary argument: ${arg}`)
  }
  return { package: packageApp }
}
