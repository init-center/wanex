import { execFile } from "node:child_process"
import { join, resolve } from "node:path"
import { execPath } from "node:process"
import { assert, isRecord } from "./scenario-utils.js"

const repoRootDir = resolve(import.meta.dirname, "../../..")

export interface AuditFailure {
  readonly code: string
  readonly entry?: string
  readonly package?: string
  readonly path?: string
}

export interface FootprintReport {
  readonly entries: readonly FootprintEntry[]
  readonly failures: readonly AuditFailure[]
  readonly totals: {
    readonly failures: number
  }
}

export interface FootprintEntry {
  readonly entry: string
  readonly kind: string
  readonly missing: readonly string[]
  readonly totals: {
    readonly packageCount: number
    readonly fixtureFileCount: number
  }
  readonly contains: {
    readonly pluginRuntime: boolean
    readonly connectorRuntime: boolean
    readonly concreteAdapters: readonly string[]
    readonly forbiddenPackages: readonly string[]
  }
  readonly workspaceClosure: readonly string[]
}

export interface PacklistReport {
  readonly packages: readonly PacklistPackage[]
  readonly failures: readonly AuditFailure[]
  readonly totals: {
    readonly packages: number
    readonly failures: number
    readonly packlistFiles: number
    readonly packlistBytes: number
  }
}

export interface PacklistPackage {
  readonly name: string
  readonly forbiddenFileCount: number
  readonly forbiddenFiles: readonly string[]
}

export function entryByName(
  report: FootprintReport,
  name: string
): FootprintEntry {
  const entry = report.entries.find((item) => item.entry === name)
  assert(entry !== undefined, `footprint report should include ${name}`)
  return entry
}

export async function runJsonAudit<T>(
  scriptName: string,
  args: readonly string[]
): Promise<T> {
  const scriptPath = join(repoRootDir, "scripts", scriptName)
  const result = await execFileAsync(execPath, [scriptPath, ...args], {
    cwd: repoRootDir
  })
  const parsed = JSON.parse(result.stdout) as unknown
  assert(isRecord(parsed), `${scriptName} should return a JSON object`)
  return parsed as T
}

function execFileAsync(
  file: string,
  args: readonly string[],
  options: {
    readonly cwd: string
  }
): Promise<{
  readonly stdout: string
  readonly stderr: string
}> {
  return new Promise((resolvePromise, reject) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      if (error !== null) {
        const detail = [
          `${file} ${args.join(" ")} failed`,
          stderr.trim(),
          stdout.trim()
        ]
          .filter((line) => line.length > 0)
          .join("\n")
        reject(new Error(detail))
        return
      }
      resolvePromise({
        stdout,
        stderr
      })
    })
  })
}
