import type { ResourceRecord } from "@wanex/protocol"
import type { RuntimeStore } from "@wanex/storage"
import { sha256Bytes } from "./path.js"
import { resourceKindForMediaType } from "./provider-output.js"
import type {
  EnvironmentArtifactScope,
  EnvironmentFileExportRequest
} from "./types.js"

const MAX_ENVIRONMENT_ARTIFACT_BYTES = 50 * 1024 * 1024

export async function exportEnvironmentFile(
  storage: Pick<RuntimeStore, "ingestResource">,
  scope: EnvironmentArtifactScope,
  request: EnvironmentFileExportRequest
): Promise<ResourceRecord> {
  validateRequest(request)
  if (scope.binding.capabilities.artifactExport.supported !== true) {
    throw new Error("execution environment does not support artifact export")
  }

  const before = await scope.fileSystem.metadata(request.path)
  if (before === null) {
    throw new Error("execution artifact file does not exist")
  }
  if (before.kind !== "file") {
    throw new Error(`execution artifact path is not a regular file: ${before.kind}`)
  }
  assertSizeWithinLimit(before.size, request.maxBytes)

  const bytes = await scope.fileSystem.read(request.path)
  assertSizeWithinLimit(bytes.byteLength, request.maxBytes)

  const after = await scope.fileSystem.metadata(request.path)
  if (
    after === null ||
    after.kind !== "file" ||
    after.size !== before.size ||
    after.modifiedAt !== before.modifiedAt ||
    bytes.byteLength !== before.size
  ) {
    throw new Error("execution artifact file changed while being exported")
  }

  const sha256 = sha256Bytes(bytes)
  if (
    request.expectedSha256 !== undefined &&
    request.expectedSha256 !== sha256
  ) {
    throw new Error("execution artifact sha256 does not match expected content")
  }
  const kind = request.kind ?? resourceKindForMediaType(request.mediaType)
  return await storage.ingestResource({
    content: bytes,
    expectedSha256: sha256,
    kind,
    origin: request.origin ?? "tool_output",
    ...(request.mediaType === undefined ? {} : { mediaType: request.mediaType }),
    ...(request.label === undefined ? {} : { label: request.label }),
    ...(request.width === undefined ? {} : { width: request.width }),
    ...(request.height === undefined ? {} : { height: request.height }),
    ...(request.durationMs === undefined ? {} : { durationMs: request.durationMs })
  })
}

function validateRequest(request: EnvironmentFileExportRequest): void {
  if (request.path.length === 0 || request.path.includes("\0")) {
    throw new Error("execution artifact path must not be empty")
  }
  if (!Number.isSafeInteger(request.maxBytes) || request.maxBytes <= 0) {
    throw new Error("execution artifact maxBytes must be a positive integer")
  }
  if (request.maxBytes > MAX_ENVIRONMENT_ARTIFACT_BYTES) {
    throw new Error(
      `execution artifact maxBytes exceeds ${MAX_ENVIRONMENT_ARTIFACT_BYTES} byte runtime limit`
    )
  }
  if (
    request.expectedSha256 !== undefined &&
    !/^[a-f0-9]{64}$/u.test(request.expectedSha256)
  ) {
    throw new Error("execution artifact expectedSha256 must be lowercase sha256")
  }
}

function assertSizeWithinLimit(size: number, callerLimit: number): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("execution artifact file size is invalid")
  }
  const limit = Math.min(callerLimit, MAX_ENVIRONMENT_ARTIFACT_BYTES)
  if (size > limit) {
    throw new Error(`execution artifact exceeds ${limit} byte limit`)
  }
}
