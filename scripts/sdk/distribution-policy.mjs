import { readFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

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
  const packages = []
  for (const [name, configured] of Object.entries(rawPolicy.packages)) {
    const packageDir = resolve(workspaceRoot, configured.path)
    const manifestPath = join(packageDir, "package.json")
    const manifest = await readJson(manifestPath)
    validatePackagePolicy({ name, configured, manifest, roles, packageDir })
    packages.push({
      name,
      packageDir,
      relativeDir: relative(workspaceRoot, packageDir),
      platform: configured.platform,
      manifest,
      entries: readExportEntries(manifest)
    })
  }
  const configuredNames = new Set(packages.map((item) => item.name))
  const publicNames = Object.entries(roles)
    .filter(([, role]) => role === "public-facade" || role === "public-capability")
    .map(([name]) => name)
    .sort()
  const missing = publicNames.filter((name) => !configuredNames.has(name))
  const extra = [...configuredNames].filter((name) => !publicNames.includes(name))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `SDK policy/public role mismatch: missing=${missing.join(",")} extra=${extra.join(",")}`
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
    packages: packages.sort((left, right) => left.name.localeCompare(right.name))
  }
}

export function readExportEntries(manifest) {
  if (!isRecord(manifest.exports)) {
    throw new Error(`${manifest.name} exports must be an object`)
  }
  return Object.entries(manifest.exports)
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
    ...(packageInfo.platform === "node" ? { engines: { node: ">=26" } } : {}),
    ...(Object.keys(dependencies).length === 0 ? {} : { dependencies })
  }
}

export function encodedPackageName(name) {
  return name.replace(/^@/, "").replaceAll("/", "-")
}

export function artifactBareImportIsExternal(id, policy) {
  if (policy.internalBundledPackages.includes(id)) return false
  return isBareImport(id)
}

export function isBareImport(id) {
  return id.startsWith("node:") || (!id.startsWith(".") && !id.startsWith("/"))
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
  if (!isRecord(policy.packages)) {
    throw new Error("SDK packages must be an object")
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
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"))
}
