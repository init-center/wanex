#!/usr/bin/env node
import { createHash } from "node:crypto"
import {
  copyFile,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises"
import { createReadStream } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { pipeline } from "node:stream/promises"
import { downloadArtifact } from "@electron/get"

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const workspaceRoot = dirname(dirname(packageRoot))
export const electronZipDir = join(workspaceRoot, "target/tool-cache/electron")
export const electronReceiptPath = join(
  workspaceRoot,
  "target/distribution/desktop/electron-artifact.json"
)

const electronPackage = JSON.parse(await readFile(
  join(packageRoot, "node_modules/electron/package.json"),
  "utf8"
))
const electronChecksums = JSON.parse(await readFile(
  join(packageRoot, "node_modules/electron/checksums.json"),
  "utf8"
))

export const electronVersion = electronPackage.version

if (import.meta.main) {
  const receipt = await prepareElectronArtifact()
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

export function electronArtifactFileName({
  version = electronVersion,
  platform = process.platform,
  arch = process.arch
} = {}) {
  return `electron-v${version}-${platform}-${arch}.zip`
}

export function electronArtifactChecksum(fileName) {
  const checksum = electronChecksums[fileName]
  if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error(`Electron checksum is missing for ${fileName}`)
  }
  return checksum
}

export async function prepareElectronArtifact(options = {}) {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const version = options.version ?? electronVersion
  const fileName = electronArtifactFileName({ version, platform, arch })
  if (`${process.platform}-${process.arch}` !== `${platform}-${arch}`) {
    throw new Error(
      `Electron artifact preparation requires the host target, received ${platform}-${arch}`
    )
  }
  const checksum = electronArtifactChecksum(fileName)
  await mkdir(electronZipDir, { recursive: true })
  const outputPath = join(electronZipDir, fileName)
  try {
    const prepared = await validateElectronArtifact({
      filePath: outputPath,
      root: electronZipDir,
      expectedName: fileName,
      expectedChecksum: checksum
    })
    return await writeElectronArtifactReceipt({
      version,
      platform,
      arch,
      fileName,
      bytes: prepared.bytes,
      checksum
    })
  } catch {
    // Missing or invalid canonical artifacts are repaired from the verified download.
  }
  const downloadedPath = await downloadArtifact({
    version,
    artifactName: "electron",
    platform,
    arch,
    checksums: { [fileName]: checksum },
    downloadOptions: { signal: AbortSignal.timeout(600_000) }
  })
  await validateElectronArtifact({
    filePath: downloadedPath,
    root: dirname(downloadedPath),
    expectedName: fileName,
    expectedChecksum: checksum
  })
  const temporaryPath = join(electronZipDir, `.${fileName}.${process.pid}.tmp`)
  await rm(temporaryPath, { force: true })
  await copyFile(downloadedPath, temporaryPath)
  try {
    await validateElectronArtifact({
      filePath: temporaryPath,
      root: electronZipDir,
      expectedName: basename(temporaryPath),
      expectedChecksum: checksum
    })
    try {
      await rename(temporaryPath, outputPath)
    } catch (error) {
      if (process.platform !== "win32" || !["EEXIST", "EPERM"].includes(error.code)) {
        throw error
      }
      await rm(outputPath, { force: true })
      await rename(temporaryPath, outputPath)
    }
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
  return await writeElectronArtifactReceipt({
    version,
    platform,
    arch,
    fileName,
    bytes: (await stat(outputPath)).size,
    checksum
  })
}

async function writeElectronArtifactReceipt({
  version,
  platform,
  arch,
  fileName,
  bytes,
  checksum
}) {
  const receipt = {
    kind: "wanex.desktop.electron-artifact-receipt",
    version: 1,
    electronVersion: version,
    target: `${platform}-${arch}`,
    fileName,
    bytes,
    sha256: checksum
  }
  await mkdir(dirname(electronReceiptPath), { recursive: true })
  await writeFile(electronReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8")
  return receipt
}

export async function resolvePreparedElectronZipPath(options = {}) {
  const fileName = electronArtifactFileName(options)
  const filePath = join(electronZipDir, fileName)
  const checksum = electronArtifactChecksum(fileName)
  await validateElectronArtifact({
    filePath,
    root: electronZipDir,
    expectedName: fileName,
    expectedChecksum: checksum
  })
  return filePath
}

export async function validateElectronArtifact({
  filePath,
  root,
  expectedName,
  expectedChecksum
}) {
  const canonicalRoot = await realpath(root)
  const canonicalPath = await realpath(filePath)
  const pathFromRoot = relative(canonicalRoot, canonicalPath)
  if (
    pathFromRoot === "" ||
    pathFromRoot.startsWith("..") ||
    resolve(canonicalRoot, pathFromRoot) !== canonicalPath
  ) {
    throw new Error("Electron artifact is outside its preparation directory")
  }
  if (canonicalPath !== join(canonicalRoot, expectedName)) {
    throw new Error(`Electron artifact must be named ${expectedName}`)
  }
  const status = await stat(canonicalPath)
  if (!status.isFile()) {
    throw new Error("Electron artifact must be a regular file")
  }
  const actualChecksum = await sha256File(canonicalPath)
  if (actualChecksum !== expectedChecksum) {
    throw new Error(`Electron artifact checksum mismatch for ${expectedName}`)
  }
  return { path: canonicalPath, bytes: status.size, sha256: actualChecksum }
}

export async function sha256File(filePath) {
  const hash = createHash("sha256")
  await pipeline(createReadStream(filePath), hash)
  return hash.digest("hex")
}
