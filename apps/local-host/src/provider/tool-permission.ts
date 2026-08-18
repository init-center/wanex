import {
  createToolRuntimeBinding,
  type ToolPermissionDecision,
  type ToolPermissionPolicy,
  type ToolPermissionRequest
} from "@wanex/runtime/tools"

export class LocalToolPermissionPolicy
  implements ToolPermissionPolicy {
  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.local-host.tool-policy",
      implementationRevision: "1",
      configuration: {
        readOnly: "allow",
        imageGenerate: "allow_exact_builtin_contract",
        other: "deny"
      }
    })
  }

  async authorize(
    request: ToolPermissionRequest
  ): Promise<ToolPermissionDecision> {
    if (request.descriptor.risk === "read_only") {
      return {
        status: "allow",
        reason: "product_local_read_only_tool"
      }
    }
    if (
      request.descriptor.name === "image_generate" &&
      request.descriptor.risk === "external" &&
      request.descriptor.idempotent === true &&
      request.descriptor.concurrency === "exclusive" &&
      request.descriptor.resultMode === "deferred" &&
      request.descriptor.requiredCapabilities?.some(
        (capability) =>
          capability.operation === "image.generate" &&
          capability.inputModalities.includes("text") &&
          capability.outputModalities.includes("image")
      ) === true
    ) {
      return {
        status: "allow",
        reason: "product_local_image_generation_tool"
      }
    }
    return {
      status: "deny",
      reason: "product_local_tool_not_allowed"
    }
  }
}
