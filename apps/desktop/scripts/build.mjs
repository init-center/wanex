#!/usr/bin/env node
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import {
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"
import { extractFile, listPackage } from "@electron/asar"
import { packager } from "@electron/packager"
import { build } from "esbuild"

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const workspaceRoot = dirname(dirname(packageRoot))
export const distributionRoot = join(
  workspaceRoot,
  "target/distribution/product-desktop"
)
export const stagingDir = join(distributionRoot, "staging-app")
export const packageOutputDir = join(distributionRoot, "packaged")
export const nativeArtifactDir = join(
  workspaceRoot,
  "target/distribution/native"
)
export const credentialArtifactDir = join(distributionRoot, "credentials")
export const electronZipDir = join(workspaceRoot, "target/tool-cache/electron")

const electronVersion = JSON.parse(await readFile(
  join(packageRoot, "node_modules/electron/package.json"),
  "utf8"
)).version

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2))
  const receipt = options.package
    ? await packageProductDesktop()
    : await buildProductDesktop()
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

export async function buildProductDesktop() {
  await rm(stagingDir, { recursive: true, force: true })
  await mkdir(stagingDir, { recursive: true })
  await bundleDesktopMain()
  await writeFile(join(stagingDir, "package.json"), `${JSON.stringify({
    name: "wanex-product-desktop",
    productName: "Wanex",
    version: "0.0.0",
    private: true,
    author: "Wanex Project",
    main: "main.cjs"
  }, null, 2)}\n`, "utf8")
  return await auditProductDesktopStaging(stagingDir)
}

export async function packageProductDesktop() {
  const staging = await buildProductDesktop()
  await assertNativeArtifactDirectory(nativeArtifactDir)
  const credential = await stageProductDesktopCredentialArtifact()
  const hostElectronZipDir = await resolveHostElectronZipDir()
  await rm(packageOutputDir, { recursive: true, force: true })
  const outputPaths = await packager({
    dir: stagingDir,
    name: "Wanex",
    appVersion: "0.0.0",
    buildVersion: "0.0.0",
    platform: process.platform,
    arch: process.arch,
    asar: true,
    prune: true,
    overwrite: true,
    quiet: true,
    out: packageOutputDir,
    extraResource: [nativeArtifactDir, credentialArtifactDir],
    electronVersion,
    electronZipDir: hostElectronZipDir,
    osxSign: false
  })
  if (outputPaths.length !== 1) {
    throw new Error(
      `expected one Product Desktop package, received ${outputPaths.length}`
    )
  }
  const packaged = await auditPackagedProductDesktop({
    packageDir: outputPaths[0],
    stagedNativeDir: nativeArtifactDir,
    stagedCredentialDir: credentialArtifactDir
  })
  return { staging, credential, packaged }
}

export async function stageProductDesktopCredentialArtifact(options = {}) {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const target = credentialTarget(platform, arch)
  if (`${process.platform}-${process.arch}` !== target.id && options.binaryPath === undefined) {
    throw new Error("Product Desktop credentials can only be staged on the host target")
  }
  const binaryPath = options.binaryPath ?? resolveInstalledKeyringBinary(target)
  const canonicalBinaryPath = await realpath(binaryPath)
  const binaryStatus = await stat(canonicalBinaryPath)
  if (!binaryStatus.isFile()) {
    throw new Error("Product Desktop keyring binding must be a regular file")
  }
  const binary = await readFile(canonicalBinaryPath)
  const manifest = {
    kind: "wanex.desktop-credential-artifact",
    version: 1,
    target: {
      id: target.id,
      platform,
      arch
    },
    keyring: {
      kind: "node-api-module",
      path: "keyring.node",
      bytes: binary.byteLength,
      sha256: createHash("sha256").update(binary).digest("hex")
    }
  }
  await rm(credentialArtifactDir, { recursive: true, force: true })
  await mkdir(credentialArtifactDir, { recursive: true })
  await Promise.all([
    writeFile(
      join(credentialArtifactDir, "desktop-credential-artifact.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    ),
    writeFile(join(credentialArtifactDir, "keyring.node"), binary)
  ])
  return {
    kind: "wanex.product-desktop.credential-staging-receipt",
    target: target.id,
    fileCount: 2,
    bytes: binary.byteLength,
    sha256: manifest.keyring.sha256
  }
}

export async function auditProductDesktopStaging(root = stagingDir) {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  if (
    manifest.main !== "main.cjs" ||
    manifest.author !== "Wanex Project" ||
    manifest.type !== undefined
  ) {
    throw new Error("Product Desktop staging manifest has an invalid entry")
  }
  if (manifest.dependencies !== undefined || manifest.devDependencies !== undefined) {
    throw new Error("Product Desktop staging manifest must not declare dependencies")
  }
  const files = await listFiles(root)
  const expected = ["main.cjs", "package.json"]
  if (JSON.stringify(files.map((item) => item.path)) !== JSON.stringify(expected)) {
    throw new Error(
      `Product Desktop staging contains unexpected files: ${files.map((item) => item.path).join(",")}`
    )
  }
  const main = await readFile(join(root, "main.cjs"), "utf8")
  if (main.includes(workspaceRoot)) {
    throw new Error("workspace path leaked into Product Desktop staging")
  }
  if (
    /sourceMappingURL/.test(main) ||
    /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']@wanex\//.test(main)
  ) {
    throw new Error("unbundled source reference in Product Desktop staging")
  }
  return {
    kind: "wanex.product-desktop.staging-receipt",
    fileCount: files.length,
    bytes: sumBytes(files),
    hasNodeModules: false
  }
}

export async function auditPackagedProductDesktop({
  packageDir,
  stagedNativeDir,
  stagedCredentialDir
}) {
  const resourcesDir = productDesktopResourcesDir(packageDir)
  const files = await listFiles(packageDir)
  const relativeResources = relative(packageDir, resourcesDir).replaceAll("\\", "/")
  const asarPath = `${relativeResources}/app.asar`
  const nativePrefix = `${relativeResources}/native/`
  const credentialPrefix = `${relativeResources}/credentials/`
  const nativeFiles = files.filter((item) => item.path.startsWith(nativePrefix))
  const credentialFiles = files.filter((item) =>
    item.path.startsWith(credentialPrefix)
  )
  if (!files.some((item) => item.path === asarPath)) {
    throw new Error("packaged Product Desktop application is missing app.asar")
  }
  const absoluteAsarPath = join(packageDir, asarPath)
  const asarEntries = listPackage(absoluteAsarPath, { isPack: false })
    .map(normalizeAsarEntry)
    .sort()
  const expectedAsarEntries = ["/main.cjs", "/package.json"]
  if (JSON.stringify(asarEntries) !== JSON.stringify(expectedAsarEntries)) {
    throw new Error(
      `packaged Product Desktop ASAR contains unexpected entries: ${asarEntries.join(",")}`
    )
  }
  const asarManifest = JSON.parse(
    extractFile(absoluteAsarPath, "package.json").toString("utf8")
  )
  if (
    asarManifest.main !== "main.cjs" ||
    asarManifest.dependencies !== undefined ||
    asarManifest.devDependencies !== undefined
  ) {
    throw new Error("packaged Product Desktop ASAR manifest violates policy")
  }
  if (files.some((item) => item.path.includes("app.asar.unpacked"))) {
    throw new Error("packaged Product Desktop must not contain app.asar.unpacked")
  }
  await assertExactResourceCopy({
    label: "native",
    packagedFiles: nativeFiles,
    packagedPrefix: nativePrefix,
    packagedDir: join(resourcesDir, "native"),
    stagedDir: stagedNativeDir,
    expectedFileCount: 2
  })
  await assertExactResourceCopy({
    label: "credential",
    packagedFiles: credentialFiles,
    packagedPrefix: credentialPrefix,
    packagedDir: join(resourcesDir, "credentials"),
    stagedDir: stagedCredentialDir,
    expectedFileCount: 2
  })
  const forbidden = files.filter((item) =>
    /(^|\/)(?:node_modules|src|test|tests|fixtures|stores|caches)(\/|$)/.test(item.path)
  )
  if (forbidden.length > 0) {
    throw new Error(
      `forbidden packaged Product Desktop paths: ${forbidden.map((item) => item.path).join(",")}`
    )
  }
  const asarBytes = files.find((item) => item.path === asarPath)?.bytes ?? 0
  return {
    kind: "wanex.product-desktop.package-receipt",
    packageDir,
    platform: process.platform,
    arch: process.arch,
    fileCount: files.length,
    unpackedBytes: sumBytes(files),
    asarBytes,
    asarEntryCount: asarEntries.length,
    nativeBytes: sumBytes(nativeFiles),
    nativeFileCount: nativeFiles.length,
    credentialBytes: sumBytes(credentialFiles),
    credentialFileCount: credentialFiles.length,
    hasApplicationNodeModules: false,
    hasAsarUnpacked: false
  }
}

export function normalizeAsarEntry(entry) {
  const normalized = entry.replaceAll("\\", "/")
  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

export function packagedExecutable(packageDir) {
  if (process.platform === "darwin") {
    return join(packageDir, "Wanex.app/Contents/MacOS/Wanex")
  }
  return join(
    packageDir,
    process.platform === "win32" ? "Wanex.exe" : "Wanex"
  )
}

export function productDesktopResourcesDir(packageDir) {
  return process.platform === "darwin"
    ? join(packageDir, "Wanex.app/Contents/Resources")
    : join(packageDir, "resources")
}

async function bundleDesktopMain() {
  await build({
    absWorkingDir: workspaceRoot,
    entryPoints: [join(packageRoot, "src/main.ts")],
    outfile: join(stagingDir, "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "es2022",
    external: ["electron"],
    plugins: [await createWanexSourceResolver()],
    sourcemap: false,
    minifySyntax: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
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
    "packages/plugin",
    "packages/team",
    "packages/local-credential-store",
    "packages/app",
    "apps/product",
    "apps/plugin-command-host",
    "apps/web",
    "apps/local-host"
  ]
  const entries = new Map()
  for (const packageDir of packageDirs) {
    const absoluteDir = join(workspaceRoot, packageDir)
    const manifest = JSON.parse(await readFile(
      join(absoluteDir, "package.json"),
      "utf8"
    ))
    for (const [subpath, target] of Object.entries(manifest.exports)) {
      if (typeof target !== "string") {
        throw new Error(
          `unsupported workspace export for ${manifest.name}: ${subpath}`
        )
      }
      const specifier = subpath === "."
        ? manifest.name
        : `${manifest.name}/${subpath.slice(2)}`
      entries.set(specifier, resolve(absoluteDir, target))
    }
  }
  return {
    name: "wanex-product-desktop-source-closure",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@wanex\// }, (args) => {
        if (args.path === "@wanex/local-credential-store/keychain") {
          return {
            path: args.path,
            namespace: "wanex-product-desktop-injected-credential-store"
          }
        }
        const path = entries.get(args.path)
        if (path === undefined) {
          return {
            errors: [{
              text: `Product Desktop closure rejects workspace import: ${args.path}`
            }]
          }
        }
        return { path }
      })
      buildContext.onLoad(
        { filter: /.*/, namespace: "wanex-product-desktop-injected-credential-store" },
        () => ({
          contents: [
            "export class WanexLocalKeychainSecretStore {",
            "  constructor() {",
            "    throw new Error('Product Desktop requires its verified injected credential binding')",
            "  }",
            "}"
          ].join("\n"),
          loader: "js"
        })
      )
    }
  }
}

async function assertExactResourceCopy({
  label,
  packagedFiles,
  packagedPrefix,
  packagedDir,
  stagedDir,
  expectedFileCount
}) {
  if (packagedFiles.length !== expectedFileCount) {
    throw new Error(
      `packaged Product Desktop ${label} resource must contain ${expectedFileCount} files, received ${packagedFiles.length}`
    )
  }
  const stagedFiles = await listFiles(stagedDir)
  if (stagedFiles.length !== expectedFileCount) {
    throw new Error(
      `staged Product Desktop ${label} resource must contain ${expectedFileCount} files`
    )
  }
  for (const staged of stagedFiles) {
    const packaged = packagedFiles.find((item) =>
      item.path === `${packagedPrefix}${staged.path}`
    )
    if (packaged === undefined || packaged.bytes !== staged.bytes) {
      throw new Error(
        `packaged Product Desktop ${label} resource differs: ${staged.path}`
      )
    }
    const [stagedBytes, packagedBytes] = await Promise.all([
      readFile(join(stagedDir, staged.path)),
      readFile(join(packagedDir, staged.path))
    ])
    if (!stagedBytes.equals(packagedBytes)) {
      throw new Error(
        `packaged Product Desktop ${label} resource bytes differ: ${staged.path}`
      )
    }
  }
}

async function assertNativeArtifactDirectory(root) {
  const files = await listFiles(root)
  if (
    files.length !== 2 ||
    !files.some((item) => item.path === "runtime-artifacts.json")
  ) {
    throw new Error(
      "native artifact staging must contain one manifest and one executable"
    )
  }
}

function resolveInstalledKeyringBinary(target) {
  const credentialStoreRequire = createRequire(join(
    workspaceRoot,
    "packages/local-credential-store/package.json"
  ))
  const keyringManifest = credentialStoreRequire.resolve(
    "@napi-rs/keyring/package.json"
  )
  return createRequire(keyringManifest).resolve(target.packageName)
}

function credentialTarget(platform, arch) {
  const id = `${platform}-${arch}`
  const packageName = new Map([
    ["darwin-arm64", "@napi-rs/keyring-darwin-arm64"],
    ["darwin-x64", "@napi-rs/keyring-darwin-x64"],
    ["win32-x64", "@napi-rs/keyring-win32-x64-msvc"]
  ]).get(id)
  if (packageName === undefined) {
    throw new Error(`unsupported Product Desktop target: ${id}`)
  }
  return { id, packageName }
}

async function resolveHostElectronZipDir() {
  const name = `electron-v${electronVersion}-${process.platform}-${process.arch}.zip`
  const roots = [
    electronZipDir,
    process.env.ELECTRON_CACHE,
    process.platform === "darwin"
      ? join(homedir(), "Library/Caches/electron")
      : undefined,
    process.platform === "win32" && process.env.LOCALAPPDATA !== undefined
      ? join(process.env.LOCALAPPDATA, "electron/Cache")
      : undefined,
    process.platform === "linux"
      ? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "electron")
      : undefined
  ].filter((value) => value !== undefined)
  for (const root of roots) {
    const found = await findNamedFile(root, name, 3)
    if (found !== undefined) return dirname(found)
  }
  throw new Error(
    `Electron ${electronVersion} ${process.platform}-${process.arch} ZIP is not present in the install cache`
  )
}

async function findNamedFile(root, name, remainingDepth) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isFile() && entry.name === name) return path
    if (entry.isDirectory() && remainingDepth > 0) {
      const nested = await findNamedFile(path, name, remainingDepth - 1)
      if (nested !== undefined) return nested
    }
  }
  return undefined
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
    else throw new Error(`unknown Product Desktop build argument: ${arg}`)
  }
  return { package: packageApp }
}
