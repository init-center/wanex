import { spawn, type ChildProcess } from "node:child_process"
import { access } from "node:fs/promises"
import { constants } from "node:fs"
import { resolve } from "node:path"
import { WorkspaceSnapshotHelperError } from "./errors.js"
import type {
  WorkspaceSnapshotClient,
  WorkspaceSnapshotRequest,
  WorkspaceSnapshotResult
} from "./types.js"

const PROTOCOL = 1
const MAX_FRAME_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 30_000

export class NativeWorkspaceSnapshotClient implements WorkspaceSnapshotClient {
  async create(request: WorkspaceSnapshotRequest): Promise<WorkspaceSnapshotResult> {
    const result = await this.run(request, "create")
    if (result === undefined) {
      throw new WorkspaceSnapshotHelperError("helper_failed", "workspace snapshot helper did not return a snapshot")
    }
    return result
  }

  async release(
    result: Pick<WorkspaceSnapshotResult, "isolationId" | "baseRevision">,
    request: WorkspaceSnapshotRequest
  ): Promise<void> {
    await this.run({
      ...request,
      isolationId: result.isolationId
    }, "release", result.baseRevision)
  }

  private async run(
    request: WorkspaceSnapshotRequest,
    operation: "create" | "release",
    releaseBaseRevision?: string
  ): Promise<WorkspaceSnapshotResult | void> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
    await access(request.serviceBin, constants.X_OK).catch((error: unknown) => {
      throw new WorkspaceSnapshotHelperError("spawn_failed", "workspace snapshot helper is not executable", error)
    })
    const child = spawn(request.serviceBin, [
      "--workspace-snapshot",
      "--root",
      resolve(request.repositoryRoot),
      "--worktree-parent",
      resolve(request.worktreeParent),
      "--isolation",
      request.isolationId,
      ...(request.gitBin === undefined ? [] : ["--git", request.gitBin]),
      ...(operation === "release"
        ? ["--base-revision", releaseBaseRevision ?? ""]
        : []),
      ...(operation === "release" ? ["--release"] : [])
    ], { detached: false, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
    const output = await readChild(child, timeoutMs)
    const frame = parseFrame(output)
    if (operation === "create") {
      if (frame.protocol !== PROTOCOL || frame.kind !== "workspace_snapshot_created" || Object.keys(frame).length !== 6) {
        throw new WorkspaceSnapshotHelperError("invalid_protocol", "workspace snapshot helper returned an invalid create frame")
      }
      return parseResult(frame)
    }
    if (frame.protocol !== PROTOCOL || frame.kind !== "workspace_snapshot_released" || Object.keys(frame).length !== 2) {
      throw new WorkspaceSnapshotHelperError("invalid_protocol", "workspace snapshot helper returned an invalid release frame")
    }
  }
}

async function readChild(child: ChildProcess, timeoutMs: number): Promise<string> {
  if (child.stdout === null || child.stderr === null) {
    throw new WorkspaceSnapshotHelperError("spawn_failed", "workspace snapshot helper pipes are unavailable")
  }
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk, MAX_FRAME_BYTES + 1) })
  child.stderr.on("data", () => {})
  const result = await new Promise<{ code: number | null; error?: Error }>((resolveResult, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new WorkspaceSnapshotHelperError("timeout", "workspace snapshot helper timed out")) }, timeoutMs)
    child.once("error", (error) => { clearTimeout(timer); resolveResult({ code: null, error }) })
    child.once("close", (code) => { clearTimeout(timer); resolveResult({ code }) })
  })
  if (result.error !== undefined) throw new WorkspaceSnapshotHelperError("spawn_failed", "workspace snapshot helper failed to spawn", result.error)
  if (stdout.length > MAX_FRAME_BYTES) throw new WorkspaceSnapshotHelperError("invalid_protocol", "workspace snapshot helper frame exceeded its limit")
  if (result.code !== 0) throw new WorkspaceSnapshotHelperError("helper_failed", "workspace snapshot helper failed")
  return stdout.toString("utf8")
}

function append(current: Buffer, chunk: Buffer, limit: number): Buffer {
  const next = Buffer.concat([current, chunk])
  return next.length > limit ? next.subarray(0, limit) : next
}

function parseFrame(raw: string): Record<string, unknown> {
  const lines = raw.trim().split(/\r?\n/)
  if (lines.length !== 1) throw new WorkspaceSnapshotHelperError("invalid_protocol", "workspace snapshot helper returned multiple frames")
  let value: unknown
  try { value = JSON.parse(lines[0] ?? "") } catch (error) { throw new WorkspaceSnapshotHelperError("invalid_protocol", "workspace snapshot helper returned invalid JSON", error) }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceSnapshotHelperError("invalid_protocol", "workspace snapshot helper returned a non-object frame")
  return value as Record<string, unknown>
}

function parseResult(frame: Record<string, unknown>): WorkspaceSnapshotResult {
  for (const field of ["isolation_id", "base_revision", "runtime_ref", "root_dir"]) {
    if (typeof frame[field] !== "string" || frame[field].length === 0) throw new WorkspaceSnapshotHelperError("invalid_protocol", `workspace snapshot frame is missing ${field}`)
  }
  return {
    isolationId: frame.isolation_id as string,
    baseRevision: frame.base_revision as string,
    runtimeRef: frame.runtime_ref as string,
    rootDir: frame.root_dir as string
  }
}
