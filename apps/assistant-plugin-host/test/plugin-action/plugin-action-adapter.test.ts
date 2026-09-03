import { describe, expect, it } from "vitest"
import type { PluginActionSubmission } from "@wanex/protocol"
import type { SubmitPluginActionRequest } from "@wanex/plugin"
import {
  createPluginActionAssistantCommandExecutor,
  invokePluginActionHandler,
  parsePluginActionHandlerRef,
  pluginActionHandlerRef,
  requirePluginActionHandlerRef,
  type SubmitPluginActionPort
} from "../../src/plugin-action/index.js"

describe("@wanex/assistant-plugin-host", () => {
  it("serializes and parses plugin action handler refs", () => {
    const ref = pluginActionHandlerRef({
      kind: "plugin_action",
      pluginId: "plugin.demo",
      actionId: "say-hello",
      version: "1.0.0",
      requiredCapability: "team.conversation.write"
    })

    expect(ref).toBe(
      "wanex.plugin-action:plugin.demo/say-hello?version=1.0.0&capability=team.conversation.write"
    )
    expect(parsePluginActionHandlerRef(ref)).toEqual({
      kind: "plugin_action",
      pluginId: "plugin.demo",
      actionId: "say-hello",
      version: "1.0.0",
      requiredCapability: "team.conversation.write"
    })
  })

  it("returns undefined for non-plugin refs and throws for malformed plugin refs", () => {
    expect(parsePluginActionHandlerRef("handler.command.open")).toBeUndefined()
    expect(() =>
      requirePluginActionHandlerRef("handler.command.open")
    ).toThrow(/not a plugin action/)
    expect(() =>
      parsePluginActionHandlerRef("wanex.plugin-action:plugin-only")
    ).toThrow(/invalid plugin action handlerRef/)
    expect(() =>
      pluginActionHandlerRef({
        kind: "plugin_action",
        pluginId: "bad/plugin",
        version: "1.0.0",
        actionId: "run"
      })
    ).toThrow(/pluginId/)
  })

  it("submits durable plugin action jobs through the injected port", async () => {
    const port = recordingPort()
    const ref = pluginActionHandlerRef({
      kind: "plugin_action",
      pluginId: "plugin.demo",
      actionId: "deliver",
      version: "2.0.0",
      requiredCapability: "channel.deliver"
    })

    const result = await invokePluginActionHandler(port, {
      handlerRef: ref,
      principalId: "principal_assistant",
      payload: {
        text: "hello"
      },
      jobId: "job_plugin_deliver",
      jobIdempotencyKey: "idem_plugin_deliver",
      scheduledAt: 10,
      notBefore: 11,
      priority: 3,
      maxAttempts: 2,
      retryPolicy: {
        strategy: "fixed",
        initialDelayMs: 100
      },
      budgetGrantId: "budget_1"
    })

    expect(port.requests).toEqual([
      {
        pluginId: "plugin.demo",
        version: "2.0.0",
        actionId: "deliver",
        principalId: "principal_assistant",
        payload: {
          text: "hello"
        },
        requiredCapability: "channel.deliver",
        jobId: "job_plugin_deliver",
        jobIdempotencyKey: "idem_plugin_deliver",
        scheduledAt: 10,
        notBefore: 11,
        priority: 3,
        maxAttempts: 2,
        retryPolicy: {
          strategy: "fixed",
          initialDelayMs: 100
        },
        budgetGrantId: "budget_1"
      }
    ])
    expect(result.job.id).toBe("job_plugin_deliver")
  })

  it("lets caller require a capability when the handler ref omits one", async () => {
    const port = recordingPort()
    await invokePluginActionHandler(port, {
      handlerRef: pluginActionHandlerRef({
        kind: "plugin_action",
        pluginId: "plugin.demo",
        version: "1.0.0",
        actionId: "read"
      }),
      principalId: "principal_assistant",
      payload: {},
      requiredCapability: "network.fetch"
    })

    expect(port.requests[0]).toMatchObject({
      requiredCapability: "network.fetch"
    })
  })

  it("rejects mismatched caller and handler capability policy", async () => {
    const port = recordingPort()

    await expect(
      invokePluginActionHandler(port, {
        handlerRef: pluginActionHandlerRef({
          kind: "plugin_action",
          pluginId: "plugin.demo",
          version: "1.0.0",
          actionId: "write",
          requiredCapability: "team.conversation.write"
        }),
        principalId: "principal_assistant",
        payload: {},
        requiredCapability: "network.fetch"
      })
    ).rejects.toThrow(/capability mismatch/)
    expect(port.requests).toEqual([])
  })

  it("adapts assistant command execution to a bounded durable job submission", async () => {
    const port = recordingPort()
    const executor = createPluginActionAssistantCommandExecutor({
      port,
      principalId: "principal_assistant_command"
    })
    const handlerRef = pluginActionHandlerRef({
      kind: "plugin_action",
      pluginId: "plugin.demo",
      version: "1.0.0",
      actionId: "echo"
    })

    expect(executor.supports(handlerRef)).toBe(true)
    expect(executor.supports("wanex.unknown.status")).toBe(false)
    expect(
      executor.preview({
        commandId: "plugin.echo",
        handlerRef,
        input: { text: "hello" }
      })
    ).toEqual({ ok: true })
    expect(
      executor.preview({
        commandId: "plugin.echo",
        handlerRef,
        input: undefined
      })
    ).toEqual({ ok: true })

    await expect(
      executor.execute({
        commandId: "plugin.echo",
        handlerRef,
        input: { text: "hello" }
      })
    ).resolves.toEqual({
      kind: "submitted",
      value: {
        kind: "plugin-action.submitted",
        jobId: "job_generated"
      }
    })
    await expect(
      executor.execute({
        commandId: "plugin.echo",
        handlerRef,
        input: undefined
      })
    ).resolves.toEqual({
      kind: "submitted",
      value: {
        kind: "plugin-action.submitted",
        jobId: "job_generated"
      }
    })
    expect(port.requests).toEqual([
      expect.objectContaining({
        pluginId: "plugin.demo",
        version: "1.0.0",
        actionId: "echo",
        principalId: "principal_assistant_command",
        payload: { text: "hello" }
      }),
      expect.objectContaining({
        pluginId: "plugin.demo",
        version: "1.0.0",
        actionId: "echo",
        principalId: "principal_assistant_command",
        payload: null
      })
    ])
  })
})

function recordingPort(): SubmitPluginActionPort & {
  requests: SubmitPluginActionRequest[]
} {
  const requests: SubmitPluginActionRequest[] = []
  return {
    requests,
    submitAction(request): PluginActionSubmission {
      requests.push(request)
      return {
        manifest: {
          id: `manifest_${request.pluginId}`,
          pluginId: request.pluginId,
          version: request.version,
          capabilities:
            request.requiredCapability === undefined
              ? []
              : [request.requiredCapability],
          state: "registered",
          createdAt: 1,
          updatedAt: 1
        },
        job: {
          id: request.jobId ?? "job_generated",
          kind: "plugin.action",
          queue: "default",
          state: "ready",
          principalId: request.principalId,
          payload: {
            pluginId: request.pluginId,
            actionId: request.actionId,
            payload: request.payload
          },
          scheduledAt: request.scheduledAt ?? 1,
          ...(request.notBefore === undefined
            ? {}
            : { notBefore: request.notBefore }),
          priority: request.priority ?? 0,
          attempt: 0,
          maxAttempts: request.maxAttempts ?? 1,
          retryPolicy: request.retryPolicy ?? { strategy: "none" },
          ...(request.jobIdempotencyKey === undefined
            ? {}
            : { idempotencyKey: request.jobIdempotencyKey }),
          ...(request.budgetGrantId === undefined
            ? {}
            : { budgetGrantId: request.budgetGrantId }),
          createdAt: 1,
          updatedAt: 1
        }
      }
    }
  }
}
