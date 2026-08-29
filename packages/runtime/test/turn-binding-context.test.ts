import { describe, expect, it } from "vitest"
import type { PreparedAgentContext } from "../src/context/agent/index.js"
import {
  assertAgentContextMatchesBinding,
  createTurnExecutionBinding
} from "../src/execution/turn-binding.js"
import { NativeExecutionEnvironment } from "../src/execution/index.js"
import { fakeModelEndpoint } from "./model-endpoint-fixture.js"

describe("Turn context binding evidence", () => {
  it("persists only bounded context evidence and rejects semantic drift", () => {
    const context = preparedContext({
      instructionPath: "/private/repository/AGENTS.md",
      instructionContent: "Never disclose this instruction body.",
      skillPath: "/private/repository/.agents/skills/review/SKILL.md",
      skillDescription: "Review changes carefully."
    })
    const binding = createTurnExecutionBinding({
      modelEndpoint: fakeModelEndpoint("context-evidence"),
      agentContext: context,
      createdAt: 1
    })
    const serialized = JSON.stringify(binding)

    expect(binding.contextEvidence).toEqual({
      revision: 1,
      instructions: {
        state: "available",
        sourceCount: 1,
        digest: expect.stringMatching(/^[a-f0-9]{64}$/u)
      },
      skills: {
        state: "available",
        sourceCount: 1,
        digest: expect.stringMatching(/^[a-f0-9]{64}$/u)
      }
    })
    expect(serialized).not.toContain("/private/repository")
    expect(serialized).not.toContain("Never disclose")
    expect(serialized).not.toContain("Review changes carefully")
    expect(serialized).not.toContain("instructionSnapshot")
    expect(serialized).not.toContain("skillSnapshot")
    expect(() => assertAgentContextMatchesBinding(binding, context)).not.toThrow()

    expect(() =>
      assertAgentContextMatchesBinding(
        binding,
        preparedContext({
          instructionPath: "/private/repository/AGENTS.md",
          instructionContent: "A changed instruction body.",
          skillPath: "/private/repository/.agents/skills/review/SKILL.md",
          skillDescription: "Review changes carefully."
        })
      )
    ).toThrow("resolved agent context does not match the admitted turn binding")
  })

  it("rejects malformed execution environment evidence before Turn admission", async () => {
    const environment = new NativeExecutionEnvironment({
      environmentId: "native_turn_binding_validation",
      strategy: { kind: "direct" }
    })
    try {
      const valid = environment.resolveBinding({ policy: executionPolicy() })
      const create = (
        executionEnvironment: typeof valid
      ) => createTurnExecutionBinding({
        modelEndpoint: fakeModelEndpoint("execution-environment-evidence"),
        executionEnvironment,
        createdAt: 1
      })

      expect(() => create({
        ...valid,
        capabilities: {
          ...valid.capabilities,
          network: { enforcement: "os" }
        }
      })).toThrow(
        "execution environment capability digest does not match its content"
      )
      expect(() => create({
        ...valid,
        policy: {
          ...valid.policy,
          filesystem: {
            ...valid.policy.filesystem,
            maxReadBytes: valid.policy.filesystem.maxReadBytes + 1
          }
        }
      })).toThrow(
        "execution environment policy digest does not match its content"
      )
      expect(() => create({
        ...valid,
        capabilities: {
          ...valid.capabilities,
          unknown: true
        }
      } as typeof valid)).toThrow(
        "execution environment capabilities contains missing or unknown fields"
      )
    } finally {
      await environment.close()
    }
  })
})

function executionPolicy(): import("@wanex/protocol").ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: [{ id: "workspace", effects: ["read"] }],
      maxReadBytes: 1_024,
      maxDirectoryEntries: 1_024
    },
    process: {
      oneShot: true,
      managed: false,
      cleanup: "runtime_process_tree",
      environmentVariables: []
    },
    network: "unrestricted",
    isolation: "none",
    pty: false
  }
}

function preparedContext(options: {
  readonly instructionPath: string
  readonly instructionContent: string
  readonly skillPath: string
  readonly skillDescription: string
}): PreparedAgentContext {
  return {
    instructionSnapshot: {
      status: "available",
      diagnostics: [],
      sources: [{
        id: "project:instructions",
        scope: "project",
        path: options.instructionPath,
        target: "AGENTS.md",
        content: options.instructionContent,
        order: 0,
        byteLength: Buffer.byteLength(options.instructionContent),
        hash: "1".repeat(64)
      }]
    },
    skillSnapshot: {
      complete: true,
      diagnostics: [],
      sources: [{
        id: "project:skill",
        scope: "project",
        name: "review",
        description: options.skillDescription,
        directory: options.skillPath.slice(0, -"/SKILL.md".length),
        path: options.skillPath,
        order: 0,
        byteLength: 100,
        hash: "2".repeat(64),
        bodyHash: "3".repeat(64)
      }]
    }
  }
}
