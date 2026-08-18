#!/usr/bin/env node
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises"
import { basename, dirname, join, relative, resolve } from "node:path"
import { builtinModules } from "node:module"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { build } from "esbuild"
import { resolveStepCommand } from "../../../scripts/process-step.mjs"

const execFileAsync = promisify(execFile)
const builtinModuleNames = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`)
])

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const workspaceRoot = dirname(dirname(packageRoot))
export const distributionRoot = join(
  workspaceRoot,
  "target/distribution/tui"
)
export const stagingDir = join(distributionRoot, "staging")
export const tarballDir = join(distributionRoot, "tarballs")
export const bundleRelativePath = "dist/wanex-tui.js"
export const bundlePath = join(stagingDir, bundleRelativePath)

const nativeSystemServicePackages = [
  "@wanex/system-service-darwin-arm64",
  "@wanex/system-service-darwin-x64",
  "@wanex/system-service-linux-x64",
  "@wanex/system-service-win32-x64"
]
const expectedRootFiles = new Set([
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  bundleRelativePath,
  "package.json"
])

if (import.meta.main) {
  const receipt = await buildTuiDistribution()
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

export async function buildTuiDistribution() {
  await rm(distributionRoot, { recursive: true, force: true })
  await mkdir(dirname(bundlePath), { recursive: true })
  await bundleTui()
  await chmod(bundlePath, 0o755)

  const sourceManifest = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8")
  )
  const manifest = createTuiDistributionManifest(sourceManifest)
  await Promise.all([
    writeFile(
      join(stagingDir, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    ),
    copyText("README.md"),
    copyText("THIRD_PARTY_NOTICES.md")
  ])

  const staging = await auditTuiDistribution(stagingDir)
  await mkdir(tarballDir, { recursive: true })
  const packed = await packTuiDistribution()
  const receipt = {
    kind: "wanex.tui.distribution-receipt",
    name: manifest.name,
    version: manifest.version,
    staging,
    tarball: packed
  }
  await writeFile(
    join(distributionRoot, "report.json"),
    `${JSON.stringify({
      ...receipt,
      tarball: {
        ...receipt.tarball,
        path: relative(workspaceRoot, receipt.tarball.path).replaceAll("\\", "/")
      }
    }, null, 2)}\n`,
    "utf8"
  )
  return receipt
}

export function createTuiDistributionManifest(sourceManifest) {
  if (
    sourceManifest.name !== "@wanex/tui" ||
    typeof sourceManifest.version !== "string" ||
    sourceManifest.version.length === 0
  ) {
    throw new Error("TUI source manifest is invalid")
  }
  return {
    name: sourceManifest.name,
    version: sourceManifest.version,
    type: "module",
    license: "UNLICENSED",
    engines: { node: ">=26" },
    bin: { "wanex-tui": `./${bundleRelativePath}` },
    files: ["dist", "README.md", "THIRD_PARTY_NOTICES.md"],
    dependencies: {
      "@napi-rs/keyring": "1.3.0",
      ajv: "8.20.0"
    },
    optionalDependencies: Object.fromEntries(
      nativeSystemServicePackages.map((name) => [name, sourceManifest.version])
    )
  }
}

export async function auditTuiDistribution(root = stagingDir) {
  const files = await listFiles(root)
  const paths = files.map((file) => file.path)
  const unexpected = paths.filter((path) =>
    !expectedRootFiles.has(path) &&
    !/^dist\/chunks\/[a-zA-Z0-9_-]+-[a-zA-Z0-9]+\.js$/.test(path)
  )
  const missing = [...expectedRootFiles].filter((path) => !paths.includes(path))
  const chunkPaths = paths.filter((path) => path.startsWith("dist/chunks/"))
  if (unexpected.length > 0 || missing.length > 0 || chunkPaths.length === 0) {
    throw new Error(
      "TUI distribution file closure differs: " +
      `missing=${missing.join(",")} unexpected=${unexpected.join(",")} ` +
      `chunks=${chunkPaths.length}`
    )
  }
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  const expectedManifest = createTuiDistributionManifest({
    name: "@wanex/tui",
    version: manifest.version
  })
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
    throw new Error("TUI distribution manifest differs from policy")
  }
  if (manifest.private !== undefined || manifest.devDependencies !== undefined) {
    throw new Error("TUI distribution contains development metadata")
  }

  const compiledSources = await Promise.all(
    paths.filter((path) => path.endsWith(".js"))
      .map(async (path) => [path, await readFile(join(root, path), "utf8")])
  )
  const entrySource = compiledSources.find(([path]) =>
    path === bundleRelativePath
  )?.[1]
  if (entrySource === undefined || !entrySource.startsWith("#!/usr/bin/env node\n")) {
    throw new Error("TUI distribution entry is missing its Node launcher")
  }
  for (const [path, source] of compiledSources) {
    if (
      source.includes(workspaceRoot) ||
      /(?:^|["'])(?:file:|link:|workspace:)/m.test(source) ||
      /sourceMappingURL|\btsx\b/.test(source) ||
      /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']@wanex\//.test(source) ||
      /(?:packages|apps)[\\/]+[^\n"']+[\\/]+src[\\/]+/.test(source)
    ) {
      throw new Error(`TUI distribution bundle leaks workspace code: ${path}`)
    }
  }
  if (entrySource.includes("@napi-rs/keyring")) {
    throw new Error("TUI distribution eagerly imports the native keyring")
  }
  const externalPackages = [...new Set(compiledSources.flatMap(([, source]) =>
    barePackageSpecifiers(source)
  ))].sort(compareText)
  if (
    JSON.stringify(externalPackages) !==
      JSON.stringify(["@napi-rs/keyring", "ajv"])
  ) {
    throw new Error(
      `TUI distribution has an unexpected external closure: ${externalPackages.join(",")}`
    )
  }
  const executable = await stat(join(root, bundleRelativePath))
  if (!executable.isFile()) {
    throw new Error("TUI distribution entry is not a regular file")
  }
  if (process.platform !== "win32" && (executable.mode & 0o111) === 0) {
    throw new Error("TUI distribution entry is not executable")
  }
  return {
    kind: "wanex.tui.staging-receipt",
    fileCount: files.length,
    bytes: sumBytes(files),
    bundleBytes: executable.size,
    compiledBytes: sumBytes(files.filter((file) => file.path.endsWith(".js"))),
    chunkCount: chunkPaths.length,
    externalPackages,
    hasSource: false,
    hasTests: false,
    hasWorkspaceLinks: false,
    hasNodeModules: false
  }
}

async function bundleTui() {
  await build({
    absWorkingDir: workspaceRoot,
    entryPoints: [join(packageRoot, "src/cli/main.ts")],
    outdir: dirname(bundlePath),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node26",
    splitting: true,
    entryNames: "wanex-tui",
    chunkNames: "chunks/[name]-[hash]",
    external: ["@napi-rs/keyring"],
    plugins: [await createWanexSourceResolver()],
    banner: {
      js: [
        "#!/usr/bin/env node",
        'import { createRequire as __wanexCreateRequire } from "node:module"',
        "const require = __wanexCreateRequire(import.meta.url)"
      ].join("\n")
    },
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
    "packages/local-credential-store",
    "packages/app",
    "apps/product",
    "packages/team",
    "apps/local-host",
    "apps/tui"
  ]
  const entries = new Map()
  for (const packageDir of packageDirs) {
    const absoluteDir = join(workspaceRoot, packageDir)
    const manifest = JSON.parse(
      await readFile(join(absoluteDir, "package.json"), "utf8")
    )
    for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
      if (typeof target !== "string") {
        throw new Error(
          `unsupported TUI workspace export: ${manifest.name} ${subpath}`
        )
      }
      entries.set(
        subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`,
        resolve(absoluteDir, target)
      )
    }
  }
  return {
    name: "wanex-tui-source-closure",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@wanex\// }, (args) => {
        const path = entries.get(args.path)
        if (path === undefined) {
          return {
            errors: [{
              text: `TUI closure rejects workspace import: ${args.path}`
            }]
          }
        }
        return { path }
      })
    }
  }
}

async function packTuiDistribution() {
  const packCommand = resolveStepCommand({
    command: "npm",
    args: [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      tarballDir
    ]
  })
  const { stdout } = await execFileAsync(packCommand.command, packCommand.args, {
    cwd: stagingDir,
    maxBuffer: 20 * 1024 * 1024
  })
  const output = JSON.parse(stdout)
  const packed = Array.isArray(output) ? output[0] : output
  if (typeof packed?.filename !== "string" || !Array.isArray(packed.files)) {
    throw new Error("npm pack returned no TUI artifact")
  }
  const packedPaths = packed.files.map((file) => file.path).sort(compareText)
  const stagingPaths = (await listFiles(stagingDir)).map((file) => file.path)
  if (JSON.stringify(packedPaths) !== JSON.stringify(stagingPaths)) {
    throw new Error(
      `TUI tarball contains unexpected files: ${packedPaths.join(",")}`
    )
  }
  const packedEntry = packed.files.find(
    (file) => file.path === bundleRelativePath
  )
  if (process.platform !== "win32" && packedEntry?.mode !== 0o755) {
    throw new Error("TUI tarball entry is not executable")
  }
  const path = join(tarballDir, basename(packed.filename))
  const bytes = await readFile(path)
  return {
    filename: basename(path),
    path,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    fileCount: packed.files.length,
    files: packed.files.map((file) => ({
      path: file.path,
      bytes: file.size,
      mode: file.mode
    })).sort((left, right) => compareText(left.path, right.path))
  }
}

async function copyText(name) {
  const value = await readFile(join(packageRoot, name), "utf8")
  await writeFile(join(stagingDir, name), value, "utf8")
}

async function listFiles(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const path = join(entry.parentPath, entry.name)
      return {
        path: relative(root, path).replaceAll("\\", "/"),
        bytes: (await stat(path)).size
      }
    }))
  return files.sort((left, right) => compareText(left.path, right.path))
}

function barePackageSpecifiers(source) {
  const packages = new Set()
  const patterns = [
    /\b(?:import|export)(?:[^"']*?\bfrom\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (
        specifier === undefined ||
        builtinModuleNames.has(specifier) ||
        specifier.startsWith(".") ||
        specifier.startsWith("/")
      ) {
        continue
      }
      packages.add(
        specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0]
      )
    }
  }
  return [...packages].sort(compareText)
}

function sumBytes(files) {
  return files.reduce((total, file) => total + file.bytes, 0)
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}
