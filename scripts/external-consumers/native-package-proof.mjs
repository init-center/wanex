import { execFile } from "node:child_process"
import {
  access,
  chmod,
  readFile,
  realpath,
  writeFile
} from "node:fs/promises"
import { constants } from "node:fs"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { resolvePackageBinary } from "../process-step.mjs"

const execFileAsync = promisify(execFile)

export async function prepareExternalNativePackage(context) {
  if (context.nativePackageReport !== undefined) {
    return await loadNativePackageReport({
      workspaceRoot: context.workspaceRoot,
      path: context.nativePackageReport,
      nativePackage: context.nativePackage
    })
  }
  const artifactDir = context.nativeArtifactDir ?? join(
    context.workspaceRoot,
    "target/sdk/native-proof-artifacts",
    context.nativePackage.targetId
  )
  if (context.nativeArtifactDir === undefined) {
    if (context.sourceServiceBin === undefined) {
      throw new Error("native package generation requires a source binary")
    }
    await runTsxScript(context.workspaceRoot, "./scripts/stage-native-artifact.ts", [
      "--target",
      context.nativePackage.targetId,
      "--source-bin",
      context.sourceServiceBin,
      "--output-dir",
      artifactDir
    ])
  }
  const outputDir = join(
    context.workspaceRoot,
    "target/sdk/native",
    context.nativePackage.targetId
  )
  await runTsxScript(context.workspaceRoot, "./scripts/release-native-package.ts", [
    "--target",
    context.nativePackage.targetId,
    "--artifact-dir",
    artifactDir,
    "--output-dir",
    outputDir
  ])
  return await loadNativePackageReport({
    workspaceRoot: context.workspaceRoot,
    path: join(outputDir, "report.json"),
    nativePackage: context.nativePackage
  })
}

export async function resolvePackagedServiceBinary(nativeReport) {
  const path = join(
    nativeReport.stagingDir,
    nativeReport.targetId,
    nativeReport.platform === "win32"
      ? "wanex-system-service.exe"
      : "wanex-system-service"
  )
  await access(
    path,
    nativeReport.platform === "win32" ? constants.F_OK : constants.X_OK
  )
  return path
}

export function assertOnlyHostNativeTarballRequested(
  requests,
  nativeReport
) {
  const unexpected = requests.filter((request) =>
    request.path.startsWith("/tarballs/wanex-system-service-") &&
    !request.path.endsWith(`/${nativeReport.filename}`)
  )
  if (unexpected.length > 0) {
    throw new Error(
      `package manager requested non-host native tarballs: ${
        unexpected.map((request) => request.path).join(",")
      }`
    )
  }
}

export async function proveTamperedInstalledPackageFails(context) {
  const executableName = context.nativeReport.platform === "win32"
    ? "wanex-system-service.exe"
    : "wanex-system-service"
  const executablePath = join(
    context.projectDir,
    "node_modules",
    ...context.nativeReport.name.split("/"),
    context.nativeReport.targetId,
    executableName
  )
  const original = await readFile(executablePath)
  const tampered = Buffer.from(original)
  tampered[0] = tampered[0] ^ 0xff
  await writeFile(executablePath, tampered)
  if (context.nativeReport.platform !== "win32") {
    await chmod(executablePath, 0o755)
  }
  try {
    await execFileAsync(process.execPath, ["main.mjs"], {
      cwd: context.projectDir,
      env: context.executionEnvironment,
      maxBuffer: 20 * 1024 * 1024
    })
    throw new Error("tampered native package unexpectedly executed")
  } catch (error) {
    const detail = `${error?.stderr ?? ""}\n${error?.message ?? ""}`
    if (
      !detail.includes("runtime_artifact_checksum_mismatch") &&
      !detail.includes("SHA-256 differs")
    ) {
      throw error
    }
  } finally {
    await writeFile(executablePath, original)
    if (context.nativeReport.platform !== "win32") {
      await chmod(executablePath, 0o755)
    }
  }
}

async function loadNativePackageReport(context) {
  const report = JSON.parse(await readFile(context.path, "utf8"))
  if (
    report.name !== context.nativePackage.name ||
    report.targetId !== context.nativePackage.targetId ||
    report.platform !== context.nativePackage.platform ||
    report.arch !== context.nativePackage.arch ||
    report.rustTarget !== context.nativePackage.rustTarget ||
    typeof report.outputDir !== "string" ||
    typeof report.stagingDir !== "string" ||
    typeof report.tarballPath !== "string" ||
    typeof report.sha256 !== "string"
  ) {
    throw new Error(`native package report is invalid: ${context.path}`)
  }
  const normalized = {
    ...report,
    outputDir: resolve(context.workspaceRoot, report.outputDir),
    stagingDir: resolve(context.workspaceRoot, report.stagingDir),
    tarballPath: resolve(context.workspaceRoot, report.tarballPath)
  }
  await Promise.all([
    realpath(normalized.stagingDir),
    realpath(normalized.tarballPath)
  ])
  return normalized
}

async function runTsxScript(workspaceRoot, script, args) {
  const tsxCli = resolvePackageBinary("tsx", "tsx")
  const result = await execFileAsync(
    process.execPath,
    [tsxCli, script, ...args],
    {
      cwd: workspaceRoot,
      maxBuffer: 20 * 1024 * 1024
    }
  )
  if (result.stderr.trim().length > 0) process.stderr.write(result.stderr)
}
