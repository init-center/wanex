#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const workspaceRoot = fileURLToPath(new URL("..", import.meta.url))
export const defaultDesktopDistributionReceiptPath = join(
  workspaceRoot,
  "target/distribution/desktop/desktop-distribution-receipt.json"
)

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2))
  const [electron, desktop, native] = await Promise.all([
    readJson(options.electronReceiptPath),
    readJson(options.desktopReceiptPath),
    readJson(options.nativeReceiptPath)
  ])
  const receipt = createDesktopDistributionReceipt({
    targetId: options.targetId,
    electron,
    desktop,
    native
  })
  await mkdir(dirname(options.outputPath), { recursive: true })
  await writeFile(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

export function parseArgs(args) {
  const parsed = {
    targetId: `${process.platform}-${process.arch}`,
    electronReceiptPath: join(
      workspaceRoot,
      "target/distribution/desktop/electron-artifact.json"
    ),
    desktopReceiptPath: join(
      workspaceRoot,
      "target/distribution/desktop/desktop-report.json"
    ),
    nativeReceiptPath: join(
      workspaceRoot,
      "target/distribution/native-runtime-proof.json"
    ),
    outputPath: defaultDesktopDistributionReceiptPath
  }
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === "--") continue
    const value = args[index + 1]
    if (![
      "--target",
      "--electron-receipt",
      "--desktop-receipt",
      "--native-receipt",
      "--output"
    ].includes(name)) {
      throw new Error(`unknown Desktop distribution argument: ${String(name)}`)
    }
    if (!value) throw new Error(`${name} requires a value`)
    if (name === "--target") parsed.targetId = value
    if (name === "--electron-receipt") parsed.electronReceiptPath = resolve(value)
    if (name === "--desktop-receipt") parsed.desktopReceiptPath = resolve(value)
    if (name === "--native-receipt") parsed.nativeReceiptPath = resolve(value)
    if (name === "--output") parsed.outputPath = resolve(value)
    index += 1
  }
  return parsed
}

export function createDesktopDistributionReceipt({
  targetId,
  electron,
  desktop,
  native
}) {
  const target = parseTarget(targetId)
  assertRecord(electron, "Electron receipt")
  assertRecord(desktop, "Desktop proof receipt")
  assertRecord(native, "native Runtime proof receipt")
  assertEqual(electron.kind, "wanex.desktop.electron-artifact-receipt", "Electron receipt kind")
  assertEqual(desktop.kind, "wanex.desktop.proof-receipt", "Desktop receipt kind")
  assertEqual(native.kind, "wanex.native-runtime.proof-receipt", "native receipt kind")
  assertEqual(desktop.ok, true, "Desktop receipt success marker")
  assertEqual(native.ok, true, "native receipt success marker")
  assertEqual(electron.target, targetId, "Electron target")
  assertEqual(`${desktop.packaged?.platform}-${desktop.packaged?.arch}`, targetId, "Desktop target")
  assertEqual(native.target?.id, targetId, "native target")
  assertEqual(native.target?.platform, target.platform, "native platform")
  assertEqual(native.target?.arch, target.arch, "native arch")
  if (typeof native.target?.rustTarget !== "string" || native.target.rustTarget.length === 0) {
    throw new Error("native Rust target is invalid")
  }
  assertEqual(electron.electronVersion, electronVersionFromFileName(electron.fileName), "Electron filename version")
  assertEqual(
    electron.fileName,
    `electron-v${electron.electronVersion}-${targetId}.zip`,
    "Electron artifact filename"
  )
  assertPositiveInteger(electron.bytes, "Electron artifact bytes")
  assertSha256(electron.sha256, "Electron artifact sha256")
  if (electron.fileName.includes("/") || electron.fileName.includes("\\")) {
    throw new Error("Electron artifact filename must be a basename")
  }

  const packaged = desktop.packaged
  const installed = desktop.installed
  const proof = {
    sampleCount: positiveInteger(desktop.sampleCount, "Desktop sample count"),
    executedFromInstalledCopy: installed?.executedFromInstalledCopy === true,
    packageShapeVerified: installed?.packageShapeVerified === true,
    noEpermRename: desktop.noEpermRename === true,
    noOwnedProcessAfterRun: desktop.noOwnedProcessAfterRun === true,
    screenshotsNonBlank: desktop.screenshotsNonBlank === true,
    realDesktopDocument: desktop.realDesktopDocument === true
  }
  if (Object.values(proof).some((value) => value === false)) {
    throw new Error("Desktop proof receipt does not satisfy distribution proof requirements")
  }
  if (desktop.pathCase?.spaces !== true || desktop.pathCase?.nonAscii !== true ||
      native.pathCase?.spaces !== true || native.pathCase?.nonAscii !== true) {
    throw new Error("Desktop proof does not cover path-case execution")
  }

  const packageShape = {
    fileCount: positiveInteger(packaged.fileCount, "Desktop package file count"),
    unpackedBytes: positiveInteger(packaged.unpackedBytes, "Desktop unpacked bytes"),
    asarBytes: positiveInteger(packaged.asarBytes, "Desktop ASAR bytes"),
    asarEntryCount: positiveInteger(packaged.asarEntryCount, "Desktop ASAR entry count"),
    nativeBytes: positiveInteger(packaged.nativeBytes, "Desktop native bytes"),
    nativeFileCount: positiveInteger(packaged.nativeFileCount, "Desktop native file count"),
    credentialBytes: positiveInteger(packaged.credentialBytes, "Desktop credential bytes"),
    credentialFileCount: positiveInteger(packaged.credentialFileCount, "Desktop credential file count"),
    hasApplicationNodeModules: packaged.hasApplicationNodeModules === true,
    hasAsarUnpacked: packaged.hasAsarUnpacked === true
  }
  if (packageShape.hasApplicationNodeModules || packageShape.hasAsarUnpacked) {
    throw new Error("Desktop package contains a forbidden dependency closure")
  }
  assertEqual(installed.packageFileCount, packageShape.fileCount, "installed Desktop package file count")
  assertEqual(installed.packageBytes, packageShape.unpackedBytes, "installed Desktop package bytes")

  const nativeArtifact = native.artifact
  assertRecord(nativeArtifact, "native artifact")
  const nativeSummary = {
    executableBytes: positiveInteger(nativeArtifact.bytes, "native executable bytes"),
    fileCount: positiveInteger(nativeArtifact.fileCount, "native artifact file count"),
    verificationMs: nonNegativeNumber(nativeArtifact.verificationMs, "native artifact verification ms"),
    noNodeModulesBesideArtifact: native.noNodeModulesBesideArtifact === true,
    noOwnedProcessAfterRun: native.noOwnedProcessAfterRun === true
  }
  if (!nativeSummary.noNodeModulesBesideArtifact || !nativeSummary.noOwnedProcessAfterRun) {
    throw new Error("native Runtime proof does not satisfy distribution proof requirements")
  }
  if (packageShape.nativeBytes < nativeSummary.executableBytes) {
    throw new Error("Desktop package native resource predates its native Runtime proof")
  }

  return {
    kind: "wanex.desktop.distribution-receipt",
    version: 1,
    target: {
      id: targetId,
      platform: target.platform,
      arch: target.arch,
      rustTarget: native.target.rustTarget
    },
    electron: {
      version: electron.electronVersion,
      target: electron.target,
      fileName: electron.fileName,
      bytes: electron.bytes,
      sha256: electron.sha256
    },
    package: packageShape,
    native: nativeSummary,
    proof,
    pathCase: {
      spaces: desktop.pathCase?.spaces === true && native.pathCase?.spaces === true,
      nonAscii: desktop.pathCase?.nonAscii === true && native.pathCase?.nonAscii === true
    }
  }
}

export function assertDesktopDistributionReceipt(receipt, options = {}) {
  assertRecord(receipt, "Desktop distribution receipt")
  assertEqual(receipt.kind, "wanex.desktop.distribution-receipt", "Desktop distribution receipt kind")
  assertEqual(receipt.version, 1, "Desktop distribution receipt version")
  const target = assertRecord(receipt.target, "Desktop distribution target")
  if (options.targetId !== undefined) assertEqual(target.id, options.targetId, "Desktop distribution target")
  assertTarget(target.id, target.platform, target.arch)
  if (typeof target.rustTarget !== "string" || target.rustTarget.length === 0) {
    throw new Error("Desktop distribution Rust target is invalid")
  }
  assertRecord(receipt.electron, "Desktop distribution Electron summary")
  assertRecord(receipt.package, "Desktop distribution package summary")
  assertRecord(receipt.native, "Desktop distribution native summary")
  assertRecord(receipt.proof, "Desktop distribution proof summary")
  assertRecord(receipt.pathCase, "Desktop distribution path-case summary")
  assertExactKeys(receipt, ["electron", "kind", "native", "package", "pathCase", "proof", "target", "version"], "Desktop distribution receipt")
  assertExactKeys(receipt.target, ["arch", "id", "platform", "rustTarget"], "Desktop distribution target")
  assertExactKeys(receipt.electron, ["bytes", "fileName", "sha256", "target", "version"], "Desktop distribution Electron summary")
  assertExactKeys(receipt.package, ["asarBytes", "asarEntryCount", "credentialBytes", "credentialFileCount", "fileCount", "hasApplicationNodeModules", "hasAsarUnpacked", "nativeBytes", "nativeFileCount", "unpackedBytes"], "Desktop distribution package summary")
  assertExactKeys(receipt.native, ["executableBytes", "fileCount", "noNodeModulesBesideArtifact", "noOwnedProcessAfterRun", "verificationMs"], "Desktop distribution native summary")
  assertExactKeys(receipt.proof, ["executedFromInstalledCopy", "noEpermRename", "noOwnedProcessAfterRun", "packageShapeVerified", "realDesktopDocument", "sampleCount", "screenshotsNonBlank"], "Desktop distribution proof summary")
  assertExactKeys(receipt.pathCase, ["nonAscii", "spaces"], "Desktop distribution path-case summary")
  assertEqual(receipt.electron.target, target.id, "Desktop distribution Electron target")
  assertPositiveInteger(receipt.electron.bytes, "Desktop distribution Electron bytes")
  assertSha256(receipt.electron.sha256, "Desktop distribution Electron sha256")
  if (typeof receipt.electron.fileName !== "string" ||
      receipt.electron.fileName.includes("/") ||
      receipt.electron.fileName.includes("\\")) {
    throw new Error("Desktop distribution Electron filename is invalid")
  }
  assertEqual(
    receipt.electron.fileName,
    `electron-v${receipt.electron.version}-${target.id}.zip`,
    "Desktop distribution Electron filename"
  )
  if (typeof receipt.electron.version !== "string" || receipt.electron.version.length === 0 ||
      electronVersionFromFileName(receipt.electron.fileName) !== receipt.electron.version) {
    throw new Error("Desktop distribution Electron version is invalid")
  }
  for (const [name, value] of Object.entries(receipt.package)) {
    if (name === "hasApplicationNodeModules" || name === "hasAsarUnpacked") continue
    assertPositiveInteger(value, `Desktop distribution ${name}`)
  }
  assertEqual(receipt.package.asarEntryCount, 3, "Desktop distribution ASAR entry count")
  assertEqual(receipt.package.nativeFileCount, 2, "Desktop distribution native file count")
  assertEqual(receipt.package.credentialFileCount, 2, "Desktop distribution credential file count")
  assertEqual(receipt.package.hasApplicationNodeModules, false, "Desktop distribution node_modules exclusion")
  assertEqual(receipt.package.hasAsarUnpacked, false, "Desktop distribution ASAR unpacked exclusion")
  assertEqual(receipt.proof.executedFromInstalledCopy, true, "Desktop distribution installed execution")
  assertEqual(receipt.proof.packageShapeVerified, true, "Desktop distribution package shape")
  assertEqual(receipt.proof.noEpermRename, true, "Desktop distribution EPERM rename exclusion")
  assertEqual(receipt.proof.noOwnedProcessAfterRun, true, "Desktop distribution process cleanup")
  assertEqual(receipt.native.noNodeModulesBesideArtifact, true, "Desktop distribution native node_modules exclusion")
  assertEqual(receipt.native.noOwnedProcessAfterRun, true, "Desktop distribution native process cleanup")
  assertPositiveInteger(receipt.native.executableBytes, "Desktop distribution native executable bytes")
  assertPositiveInteger(receipt.native.fileCount, "Desktop distribution native file count")
  nonNegativeNumber(receipt.native.verificationMs, "Desktop distribution native verification ms")
  assertPositiveInteger(receipt.proof.sampleCount, "Desktop distribution proof sample count")
  for (const name of [
    "executedFromInstalledCopy",
    "packageShapeVerified",
    "noEpermRename",
    "noOwnedProcessAfterRun",
    "screenshotsNonBlank",
    "realDesktopDocument"
  ]) {
    assertEqual(receipt.proof[name], true, `Desktop distribution ${name}`)
  }
  if (receipt.package.nativeBytes < receipt.native.executableBytes) {
    throw new Error("Desktop distribution native resource is smaller than its proved executable")
  }
  assertEqual(receipt.pathCase.spaces, true, "Desktop distribution spaces path proof")
  assertEqual(receipt.pathCase.nonAscii, true, "Desktop distribution non-ASCII path proof")
  if (options.desktop !== undefined) {
    assertEqual(receipt.package.fileCount, options.desktop.packaged?.fileCount, "Desktop distribution package file count matches proof")
    assertEqual(receipt.package.unpackedBytes, options.desktop.packaged?.unpackedBytes, "Desktop distribution package bytes match proof")
  }
  if (options.native !== undefined) {
    assertEqual(receipt.native.fileCount, options.native.artifact?.fileCount, "Desktop distribution native file count matches proof")
    assertEqual(receipt.native.executableBytes, options.native.artifact?.bytes, "Desktop distribution native bytes match proof")
  }
  return receipt
}

function parseTarget(targetId) {
  const match = /^(darwin|linux|win32)-(arm64|x64)$/.exec(targetId)
  if (match === null || !["darwin-arm64", "darwin-x64", "linux-x64", "win32-x64"].includes(targetId)) {
    throw new Error(`unsupported Desktop distribution target: ${targetId}`)
  }
  return { id: targetId, platform: match[1], arch: match[2] }
}

function assertTarget(id, platform, arch) {
  const target = parseTarget(id)
  assertEqual(platform, target.platform, "Desktop distribution platform")
  assertEqual(arch, target.arch, "Desktop distribution arch")
}

function electronVersionFromFileName(fileName) {
  const version = /^electron-v([^/\\]+)-(?:darwin|linux|win32)-(?:arm64|x64)\.zip$/.exec(fileName ?? "")?.[1]
  if (version === undefined) throw new Error("Electron artifact filename is invalid")
  return version
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} differs from expected value`)
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
  return value
}

function positiveInteger(value, label) {
  return assertPositiveInteger(value, label)
}

function nonNegativeNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`)
  }
  return value
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest`)
  }
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort()
  const keys = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(keys)) {
    throw new Error(`${label} contains unexpected fields`)
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"))
}
