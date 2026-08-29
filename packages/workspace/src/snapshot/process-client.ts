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

export class ProcessWorkspaceSnapshotClient implements WorkspaceSnapshotClient {
  async create(request: WorkspaceSnapshotRequest): Promise<WorkspaceSnapshotResult> {
    const result = await this.run(request, "create")
    if (result === undefined) {
      throw new WorkspaceSnapshotHelperError(
        "helper_failed",
        "workspace snapshot helper did not return a snapshot"
      )
    }
    return result
  }

  async release(
    result: Pick<WorkspaceSnapshotResult, "isolationId" | "baseRevision">,
    request: WorkspaceSnapshotRequest
  ): Promise<void> {
    await this.run({ ...request, isolationId: result.isolationId }, "release", result.baseRevision)
  }

  private async run(
    request: WorkspaceSnapshotRequest,
    operation: "create" | "release",
    releaseBaseRevision?: string
  ): Promise<WorkspaceSnapshotResult | void> {
    const result = await request.executionProcess.execute({
      program: request.serviceBin,
      args: [
        "--workspace-snapshot",
        "--root",
        resolve(request.repositoryRoot),
        "--worktree-parent",
        resolve(request.worktreeParent),
        "--isolation",
        request.isolationId,
        ...(request.gitBin === undefined ? [] : ["--git", request.gitBin]),
        ...(operation === "release"
          ? ["--base-revision", releaseBaseRevision ?? "", "--release"]
          : [])
      ],
      cwd: resolve(request.repositoryRoot),
      timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      output: { stdoutBytes: MAX_FRAME_BYTES, stderrBytes: MAX_FRAME_BYTES }
    })
    if (
      result.termination !== "exited" ||
      result.exitCode !== 0 ||
      result.cleanup === "failed" ||
      result.stdout.truncated
    ) {
      const diagnostic = result.stderr.text.trim()
      throw new WorkspaceSnapshotHelperError(
        "helper_failed",
        `workspace snapshot helper failed; exit=${String(result.exitCode)}${
          diagnostic.length === 0 ? "" : `; stderr=${diagnostic}`
        }`
      )
    }
    const frame = parseFrame(result.stdout.text)
    if (operation === "create") {
      if (
        frame.protocol !== PROTOCOL ||
        frame.kind !== "workspace_snapshot_created" ||
        Object.keys(frame).length !== 6
      ) {
        throw new WorkspaceSnapshotHelperError(
          "invalid_protocol",
          "workspace snapshot helper returned an invalid create frame"
        )
      }
      return parseResult(frame)
    }
    if (
      frame.protocol !== PROTOCOL ||
      frame.kind !== "workspace_snapshot_released" ||
      Object.keys(frame).length !== 2
    ) {
      throw new WorkspaceSnapshotHelperError(
        "invalid_protocol",
        "workspace snapshot helper returned an invalid release frame"
      )
    }
  }
}

function parseFrame(raw: string): Record<string, unknown> {
  const lines = raw.trim().split(/\r?\n/)
  if (lines.length !== 1) {
    throw new WorkspaceSnapshotHelperError(
      "invalid_protocol",
      "workspace snapshot helper returned multiple frames"
    )
  }
  let value: unknown
  try {
    value = JSON.parse(lines[0] ?? "")
  } catch (error) {
    throw new WorkspaceSnapshotHelperError(
      "invalid_protocol",
      "workspace snapshot helper returned invalid JSON",
      error
    )
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceSnapshotHelperError(
      "invalid_protocol",
      "workspace snapshot helper returned a non-object frame"
    )
  }
  return value as Record<string, unknown>
}

function parseResult(frame: Record<string, unknown>): WorkspaceSnapshotResult {
  for (const field of ["isolation_id", "base_revision", "runtime_ref", "root_dir"]) {
    if (typeof frame[field] !== "string" || frame[field].length === 0) {
      throw new WorkspaceSnapshotHelperError(
        "invalid_protocol",
        `workspace snapshot frame is missing ${field}`
      )
    }
  }
  return {
    isolationId: frame.isolation_id as string,
    baseRevision: frame.base_revision as string,
    runtimeRef: frame.runtime_ref as string,
    rootDir: frame.root_dir as string
  }
}
