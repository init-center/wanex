import { describe, expect, it } from "vitest"
import type { ToolDescriptor, ToolPermissionRequest } from "@wanex/runtime/tools"
import { LocalToolPermissionPolicy } from "../src/index.js"

describe("LocalToolPermissionPolicy", () => {
  const policy = new LocalToolPermissionPolicy()

  it("allows read-only tools and the exact built-in image generation contract", async () => {
    await expect(policy.authorize(permissionRequest({
      ...descriptor("inspect", "read_only")
    }))).resolves.toMatchObject({ status: "allow" })
    await expect(policy.authorize(permissionRequest({
      ...descriptor("image_generate", "external"),
      idempotent: true,
      concurrency: "exclusive",
      resultMode: "deferred",
      requiredCapabilities: [{
        operation: "image.generate",
        inputModalities: ["text"],
        outputModalities: ["image"],
        features: []
      }]
    }))).resolves.toEqual({
      status: "allow",
      reason: "product_local_image_generation_tool"
    })
  })

  it("denies other effects and lookalike image tools", async () => {
    await expect(policy.authorize(permissionRequest(
      descriptor("shell_exec", "mutating")
    ))).resolves.toMatchObject({ status: "deny" })
    await expect(policy.authorize(permissionRequest({
      ...descriptor("image_generate", "external"),
      resultMode: "immediate"
    }))).resolves.toMatchObject({ status: "deny" })
  })
})

function descriptor(name: string, risk: ToolDescriptor["risk"]): ToolDescriptor {
  return {
    name,
    description: name,
    inputSchema: { type: "object" },
    risk,
    idempotent: false,
    concurrency: "exclusive",
    resultMode: "immediate"
  }
}

function permissionRequest(descriptor: ToolDescriptor): ToolPermissionRequest {
  return {
    principalId: "principal",
    sessionId: "session",
    inputId: "input",
    turnId: "turn",
    attemptId: "attempt",
    call: {
      id: "part-call",
      type: "tool_call",
      toolCallId: "call",
      toolName: descriptor.name,
      input: {}
    },
    descriptor
  }
}
