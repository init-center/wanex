import { builtinModules } from "node:module"
import { isAbsoluteModuleId } from "./distribution-policy.mjs"

const builtinSet = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`)
])

export function findStagingManifestFailures(manifest, packageInfo) {
  const failures = []
  if (manifest.name !== packageInfo.name) {
    failures.push(failure("manifest-name", "generated package name is incorrect"))
  }
  if (manifest.version !== packageInfo.manifest.version) {
    failures.push(failure("manifest-version", "generated package version is incorrect"))
  }
  if (manifest.private !== undefined) {
    failures.push(failure("manifest-private", "compiled SDK manifest must not be private"))
  }
  if (manifest.license !== "UNLICENSED") {
    failures.push(failure("manifest-license", "compiled SDK must declare UNLICENSED"))
  }
  if (manifest.type !== "module") {
    failures.push(failure("manifest-module", "compiled SDK must be ESM"))
  }
  if (manifest.types !== "./dist/index.d.ts") {
    failures.push(failure("manifest-types", "compiled SDK root types target is incorrect"))
  }
  if (manifest.dependencies?.["@wanex/protocol"] !== undefined) {
    failures.push(failure("manifest-protocol", "internal Protocol must not be a dependency"))
  }
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    if (typeof version !== "string" || version.startsWith("workspace:")) {
      failures.push(failure(
        "manifest-workspace-range",
        `compiled dependency ${name} must use an installable version`
      ))
    }
  }
  for (const forbidden of ["devDependencies", "scripts", "bin", "main", "module"]) {
    if (manifest[forbidden] !== undefined) {
      failures.push(failure(
        "manifest-forbidden-field",
        `compiled SDK manifest must not define ${forbidden}`
      ))
    }
  }
  const exportKeys = Object.keys(manifest.exports ?? {}).sort()
  const expectedKeys = packageInfo.entries.map((entry) => entry.exportPath).sort()
  if (JSON.stringify(exportKeys) !== JSON.stringify(expectedKeys)) {
    failures.push(failure("manifest-exports", "compiled export keys differ from policy"))
  }
  for (const entry of packageInfo.entries) {
    const exported = manifest.exports?.[entry.exportPath]
    const base = `./dist/${entry.artifactPath}`
    if (
      exported?.types !== `${base}.d.ts` ||
      exported?.import !== `${base}.js` ||
      exported?.default !== `${base}.js`
    ) {
      failures.push(failure(
        "manifest-export-target",
        `${entry.exportPath} does not target compiled ESM and declarations`
      ))
    }
  }
  return failures
}

export function findArtifactFileFailures(files, packageInfo) {
  const expected = new Set(["README.md", "package.json"])
  for (const entry of packageInfo.entries) {
    expected.add(`dist/${entry.artifactPath}.js`)
    expected.add(`dist/${entry.artifactPath}.d.ts`)
  }
  const actual = new Set(files)
  const failures = []
  for (const path of expected) {
    if (!actual.has(path)) {
      failures.push(failure("artifact-file-missing", `missing ${path}`, path))
    }
  }
  for (const path of actual) {
    if (!expected.has(path)) {
      failures.push(failure("artifact-file-extra", `unexpected ${path}`, path))
    }
    if (
      (path.endsWith(".ts") && !path.endsWith(".d.ts")) ||
      path.endsWith(".map") ||
      path.startsWith("test/") ||
      path.includes("/fixtures/")
    ) {
      failures.push(failure("artifact-source-leak", `forbidden artifact ${path}`, path))
    }
  }
  return failures
}

export function findCompiledModuleFailures(request) {
  const failures = []
  const specifiers = extractModuleSpecifiers(request.content)
  if (
    request.content.includes(request.workspaceRoot) ||
    specifiers.some((specifier) => isAbsoluteModuleId(specifier))
  ) {
    failures.push(failure("artifact-absolute-path", "absolute workspace path leaked"))
  }
  if (/(?:packages|apps)[\\/]+[^\n"']+[\\/]+src[\\/]+/.test(request.content)) {
    failures.push(failure("artifact-source-path", "workspace source path leaked"))
  }
  for (const specifier of specifiers) {
    if (specifier === "@wanex/protocol" || specifier.startsWith("@wanex/protocol/")) {
      failures.push(failure("artifact-protocol-import", "internal Protocol import leaked"))
      continue
    }
    if (
      specifier.startsWith(".") ||
      isAbsoluteModuleId(specifier) ||
      builtinSet.has(specifier)
    ) {
      continue
    }
    const dependency = packageNameForSpecifier(specifier)
    if (
      dependency !== request.packageName &&
      request.dependencies[dependency] === undefined
    ) {
      failures.push(failure(
        "artifact-undeclared-import",
        `undeclared package import ${specifier}`
      ))
    }
  }
  return failures
}

export function extractModuleSpecifiers(content) {
  const specifiers = new Set()
  const patterns = [
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.add(match[1])
    }
  }
  return [...specifiers].sort()
}

function packageNameForSpecifier(specifier) {
  if (!specifier.startsWith("@")) return specifier.split("/")[0]
  return specifier.split("/").slice(0, 2).join("/")
}

function failure(code, message, path = "package.json") {
  return { code, message, path }
}
