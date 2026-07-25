import { readFile } from "node:fs/promises"
import { dirname, join, posix, resolve, win32 } from "node:path"
import { fileURLToPath } from "node:url"
import { repositoryRelativePath } from "../audit/repository-path.mjs"

export const workspaceRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
export const sdkPolicyPath = join(
  workspaceRoot,
  "docs/architecture/sdk-distribution.json"
)
export const packageRolesPath = join(
  workspaceRoot,
  "docs/architecture/package-roles.json"
)

export async function loadSdkDistributionPolicy() {
  const [rawPolicy, roles] = await Promise.all([
    readJson(sdkPolicyPath),
    readJson(packageRolesPath)
  ])
  validateTopLevelPolicy(rawPolicy)
  const nativePackages = Object.entries(rawPolicy.nativePackages)
    .map(([targetId, configured]) =>
      validateNativePackagePolicy(targetId, configured)
    )
    .sort((left, right) => left.targetId.localeCompare(right.targetId))
  const packages = []
  for (const [name, configured] of Object.entries(rawPolicy.packages)) {
    const packageDir = resolve(workspaceRoot, configured.path)
    const manifestPath = join(packageDir, "package.json")
    const manifest = await readJson(manifestPath)
    validatePackagePolicy({ name, configured, manifest, roles, packageDir })
    packages.push({
      name,
      packageDir,
      relativeDir: repositoryRelativePath(workspaceRoot, packageDir),
      platform: configured.platform,
      manifest,
      entries: readExportEntries(manifest, configured.sourceOnlyExports),
      sourceOnlyExports: [...(configured.sourceOnlyExports ?? [])].sort(),
      optionalNativePackages: name === "@wanex/runtime"
        ? nativePackages
        : []
    })
  }
  const publishedNames = new Set(packages.map((item) => item.name))
  const sourcePreviewPackages = [...rawPolicy.sourcePreviewPackages].sort()
  const previewNames = new Set(sourcePreviewPackages)
  const publicNames = Object.entries(roles)
    .filter(([, role]) => role === "public-facade" || role === "public-capability")
    .map(([name]) => name)
    .sort()
  const overlap = [...publishedNames].filter((name) => previewNames.has(name))
  const missing = publicNames.filter(
    (name) => !publishedNames.has(name) && !previewNames.has(name)
  )
  const extra = [...publishedNames, ...previewNames]
    .filter((name) => !publicNames.includes(name))
  const invalidPreview = sourcePreviewPackages.filter(
    (name) => roles[name] !== "public-capability"
  )
  if (
    overlap.length > 0 ||
    missing.length > 0 ||
    extra.length > 0 ||
    invalidPreview.length > 0
  ) {
    throw new Error(
      "SDK policy/public role mismatch: " +
      `missing=${missing.join(",")} extra=${extra.join(",")} ` +
      `overlap=${overlap.join(",")} invalidPreview=${invalidPreview.join(",")}`
    )
  }
  const versionByPackage = Object.fromEntries(
    packages.map((item) => [item.name, item.manifest.version])
  )
  for (const packageInfo of packages) {
    packageInfo.versionByPackage = versionByPackage
  }
  return {
    schemaVersion: rawPolicy.schemaVersion,
    outputDir: resolve(workspaceRoot, rawPolicy.outputDir),
    internalBundledPackages: [...rawPolicy.internalBundledPackages],
    sourcePreviewPackages,
    nativePackages,
    packages: packages.sort((left, right) => left.name.localeCompare(right.name))
  }
}

export function readExportEntries(manifest, sourceOnlyExports = []) {
  if (!isRecord(manifest.exports)) {
    throw new Error(`${manifest.name} exports must be an object`)
  }
  const sourceOnly = new Set(sourceOnlyExports)
  if (sourceOnly.size !== sourceOnlyExports.length) {
    throw new Error(`${manifest.name} sourceOnlyExports must be unique`)
  }
  for (const exportPath of sourceOnly) {
    if (exportPath === "." || manifest.exports[exportPath] === undefined) {
      throw new Error(`${manifest.name} has invalid source-only export ${exportPath}`)
    }
  }
  return Object.entries(manifest.exports)
    .filter(([exportPath]) => !sourceOnly.has(exportPath))
    .map(([exportPath, sourceTarget]) => {
      if (typeof sourceTarget !== "string") {
        throw new Error(`${manifest.name} ${exportPath} must be a source string`)
      }
      if (!sourceTarget.startsWith("./src/") || !sourceTarget.endsWith(".ts")) {
        throw new Error(`${manifest.name} ${exportPath} must target TypeScript under src`)
      }
      const artifactPath = exportPath === "."
        ? "index"
        : exportPath.slice(2)
      return {
        exportPath,
        sourceTarget,
        artifactPath
      }
    })
    .sort((left, right) => left.exportPath.localeCompare(right.exportPath))
}

export function createStagingManifest(packageInfo) {
  const dependencies = projectRuntimeDependencies(packageInfo)
  const optionalDependencies = Object.fromEntries(
    (packageInfo.optionalNativePackages ?? []).map((nativePackage) => [
      nativePackage.name,
      packageInfo.manifest.version
    ])
  )
  const exports = Object.fromEntries(packageInfo.entries.map((entry) => [
    entry.exportPath,
    {
      types: `./dist/${entry.artifactPath}.d.ts`,
      import: `./dist/${entry.artifactPath}.js`,
      default: `./dist/${entry.artifactPath}.js`
    }
  ]))
  return {
    name: packageInfo.name,
    version: packageInfo.manifest.version,
    type: "module",
    license: "UNLICENSED",
    types: "./dist/index.d.ts",
    exports,
    files: ["dist", "README.md"],
    ...(packageInfo.platform === "node" ? { engines: { node: ">=24" } } : {}),
    ...(Object.keys(dependencies).length === 0 ? {} : { dependencies }),
    ...(Object.keys(optionalDependencies).length === 0
      ? {}
      : { optionalDependencies })
  }
}

export function nativePackageForTarget(policy, targetId) {
  const nativePackage = policy.nativePackages.find(
    (candidate) => candidate.targetId === targetId
  )
  if (nativePackage === undefined) {
    throw new Error(`unsupported native package target: ${targetId}`)
  }
  return nativePackage
}

export function nativePackageForHost(
  policy,
  platform = process.platform,
  arch = process.arch
) {
  const nativePackage = policy.nativePackages.find(
    (candidate) =>
      candidate.platform === platform && candidate.arch === arch
  )
  if (nativePackage === undefined) {
    throw new Error(`unsupported native package host: ${platform}-${arch}`)
  }
  return nativePackage
}

export function encodedPackageName(name) {
  return name.replace(/^@/, "").replaceAll("/", "-")
}

export function artifactBareImportIsExternal(id, policy) {
  if (policy.internalBundledPackages.includes(id)) return false
  return isBareImport(id)
}

export function isBareImport(id) {
  return id.startsWith("node:") || (
    !id.startsWith(".") &&
    !isAbsoluteModuleId(id)
  )
}

export function isAbsoluteModuleId(id) {
  return posix.isAbsolute(id) || win32.isAbsolute(id)
}

function projectRuntimeDependencies(packageInfo) {
  const dependencies = packageInfo.manifest.dependencies ?? {}
  return Object.fromEntries(Object.entries(dependencies)
    .filter(([name]) => name !== "@wanex/protocol")
    .map(([name, version]) => {
      if (typeof version !== "string" || !version.startsWith("workspace:")) {
        return [name, version]
      }
      const targetVersion = packageInfo.versionByPackage[name]
      if (targetVersion === undefined) {
        throw new Error(`${packageInfo.name} depends on unpublished workspace package ${name}`)
      }
      return [name, targetVersion]
    })
    .sort(([left], [right]) => left.localeCompare(right)))
}

function validateTopLevelPolicy(policy) {
  if (!isRecord(policy) || policy.schemaVersion !== 1) {
    throw new Error("SDK distribution policy schemaVersion must be 1")
  }
  if (typeof policy.outputDir !== "string" || policy.outputDir.length === 0) {
    throw new Error("SDK distribution outputDir is required")
  }
  if (!Array.isArray(policy.internalBundledPackages)) {
    throw new Error("SDK internalBundledPackages must be an array")
  }
  if (
    !Array.isArray(policy.sourcePreviewPackages) ||
    !policy.sourcePreviewPackages.every((name) => typeof name === "string")
  ) {
    throw new Error("SDK sourcePreviewPackages must be a string array")
  }
  if (new Set(policy.sourcePreviewPackages).size !== policy.sourcePreviewPackages.length) {
    throw new Error("SDK sourcePreviewPackages must be unique")
  }
  if (!isRecord(policy.nativePackages)) {
    throw new Error("SDK nativePackages must be an object")
  }
  const expectedTargets = [
    "darwin-arm64",
    "darwin-x64",
    "linux-x64",
    "win32-x64"
  ]
  const actualTargets = Object.keys(policy.nativePackages).sort()
  if (JSON.stringify(actualTargets) !== JSON.stringify(expectedTargets)) {
    throw new Error(
      `SDK native package targets differ: ${actualTargets.join(",")}`
    )
  }
  if (!isRecord(policy.packages)) {
    throw new Error("SDK packages must be an object")
  }
}

function validateNativePackagePolicy(targetId, configured) {
  if (!isRecord(configured)) {
    throw new Error(`SDK native package ${targetId} must be an object`)
  }
  const expected = {
    "darwin-arm64": {
      name: "@wanex/system-service-darwin-arm64",
      platform: "darwin",
      arch: "arm64",
      rustTarget: "aarch64-apple-darwin"
    },
    "darwin-x64": {
      name: "@wanex/system-service-darwin-x64",
      platform: "darwin",
      arch: "x64",
      rustTarget: "x86_64-apple-darwin"
    },
    "linux-x64": {
      name: "@wanex/system-service-linux-x64",
      platform: "linux",
      arch: "x64",
      rustTarget: "x86_64-unknown-linux-gnu"
    },
    "win32-x64": {
      name: "@wanex/system-service-win32-x64",
      platform: "win32",
      arch: "x64",
      rustTarget: "x86_64-pc-windows-msvc"
    }
  }[targetId]
  if (
    expected === undefined ||
    Object.keys(configured).sort().join(",") !==
      ["arch", "name", "platform", "rustTarget"].join(",") ||
    configured.name !== expected.name ||
    configured.platform !== expected.platform ||
    configured.arch !== expected.arch ||
    configured.rustTarget !== expected.rustTarget
  ) {
    throw new Error(`SDK native package ${targetId} is invalid`)
  }
  return {
    targetId,
    name: configured.name,
    platform: configured.platform,
    arch: configured.arch,
    rustTarget: configured.rustTarget
  }
}

function validatePackagePolicy(request) {
  if (request.manifest.name !== request.name) {
    throw new Error(`${request.name} policy path resolves ${String(request.manifest.name)}`)
  }
  const role = request.roles[request.name]
  if (role !== "public-facade" && role !== "public-capability") {
    throw new Error(`${request.name} has non-SDK package role ${String(role)}`)
  }
  if (
    request.configured.platform !== "node" &&
    request.configured.platform !== "neutral"
  ) {
    throw new Error(`${request.name} has invalid SDK platform`)
  }
  if (!request.packageDir.startsWith(workspaceRoot)) {
    throw new Error(`${request.name} resolves outside the workspace`)
  }
  if (
    request.configured.sourceOnlyExports !== undefined &&
    (!Array.isArray(request.configured.sourceOnlyExports) ||
      !request.configured.sourceOnlyExports.every(
        (exportPath) => typeof exportPath === "string"
      ))
  ) {
    throw new Error(`${request.name} sourceOnlyExports must be a string array`)
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"))
}
