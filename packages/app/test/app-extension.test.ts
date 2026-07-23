import { describe, expect, it } from "vitest"
import {
  resolveAppExtensionContributions,
  type AppAgentContribution,
  type AppCommandContribution,
  type AppExtensionContribution,
  type AppInstructionContribution,
  type AppLifecycleHookContribution,
  type AppProviderCatalogContribution,
  type AppSkillContribution,
  type AppToolContribution
} from "@wanex/extension"
import {
  createWanexApp,
  prepareWanexAppExtensionAgentContext
} from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"

describe("@wanex/app extension contributions", () => {
  it("projects resolved instruction and skill contributions into agent context", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      extensions: {
        snapshot: resolveAppExtensionContributions([
          instructionContribution({
            id: "instruction.project",
            text: "Use extension instructions."
          }),
          skillContribution({
            id: "skill.review",
            name: "review-code",
            description: "Review code changes.",
            body: "FULL CONTRIBUTED SKILL BODY"
          })
        ])
      }
    })

    try {
      const result = await app.commands.runAgentTurn({
        content: [{ type: "text", text: "use extension context" }],
        sessionId: "ses_wanex_app_extension_context"
      })

      expect(result).toMatchObject({
        sessionId: "ses_wanex_app_extension_context",
        assistantText: "Fake response from wanex-app-model",
        context: {
          instructionSources: 1,
          skillNames: ["review-code"],
          diagnostics: [],
          activationToolRegistered: false
        }
      })
      expect(JSON.stringify(result)).not.toContain("FULL CONTRIBUTED SKILL BODY")
      expect(app.status().extensions).toMatchObject({
        configured: true,
        contributionCount: 2,
        diagnosticCount: 0,
        byDomain: {
          instruction: 1,
          skill: 1
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("preserves extension skill source hashes in prepared agent context", async () => {
    const snapshot = resolveAppExtensionContributions([
      skillContribution({
        id: "skill.file-review",
        name: "review-code",
        description: "Review code changes.",
        body: "/repo/.agents/skills/review-code/SKILL.md",
        sourceKind: "directory",
        sourceHash: "hash_from_file_discovery",
        bodyHash: "body_hash_from_file_discovery",
        byteLength: 512
      })
    ])

    const prepared = await prepareWanexAppExtensionAgentContext({ snapshot })

    expect(prepared?.skillSnapshot?.sources).toEqual([
      expect.objectContaining({
        id: "skill.file-review",
        name: "review-code",
        byteLength: 512,
        hash: "hash_from_file_discovery",
        bodyHash: "body_hash_from_file_discovery"
      })
    ])
  })

  it("exposes non-context contributions as read models without executing handlers", async () => {
    const storeDir = await createStoreDir()
    const snapshot = resolveAppExtensionContributions([
      commandContribution({
        id: "command.plan",
        aliases: ["plan"],
        handlerRef: "plugin.plan.handler"
      }),
      agentContribution({
        id: "agent.reviewer",
        skillRefs: ["skill.review"]
      }),
      toolContribution({
        id: "tool.issue.create",
        permission: "network",
        privileged: true
      }),
      providerCatalogContribution({
        id: "provider.deepseek"
      }),
      lifecycleHookContribution({
        id: "hook.start"
      })
    ])
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      extensions: {
        snapshot
      }
    })

    try {
      await expect(app.commands.readExtensionContributions()).resolves.toMatchObject({
        configured: true,
        counts: {
          command: 1,
          agent: 1,
          tool: 1,
          providerCatalog: 1,
          lifecycleHook: 1
        },
        commands: [
          {
            id: "command.plan",
            name: "plan",
            title: "Plan",
            aliases: ["plan"],
            handlerRef: "plugin.plan.handler",
            sourceKind: "plugin",
            trust: "user_enabled"
          }
        ],
        agents: [
          {
            id: "agent.reviewer",
            name: "reviewer",
            skillRefs: ["skill.review"]
          }
        ],
        tools: [
          {
            id: "tool.issue.create",
            name: "issue.create",
            permission: "network",
            privileged: true
          }
        ],
        providerCatalog: [
          {
            id: "provider.deepseek",
            providerId: "deepseek",
            modelIds: ["deepseek-v4"],
            defaultModelId: "deepseek-v4"
          }
        ],
        lifecycleHooks: [
          {
            id: "hook.start",
            event: "app.start",
            handlerRef: "hook.start.handler"
          }
        ]
      })
    } finally {
      await app.dispose()
    }
  })
})

function instructionContribution(options: {
  id: string
  text: string
}): AppInstructionContribution {
  return {
    id: options.id,
    domain: "instruction",
    value: {
      text: options.text,
      scope: "project",
      target: "test"
    },
    provenance: provenance("project_file", "project-agents"),
    order: 1
  }
}

function skillContribution(options: {
  id: string
  name: string
  description: string
  body: string
  sourceKind?: "embedded" | "directory"
  sourceHash?: string
  bodyHash?: string
  byteLength?: number
}): AppSkillContribution {
  const source =
    options.sourceKind === "directory"
      ? {
          kind: "directory" as const,
          directory: "/repo/.agents/skills/review-code",
          entryPath: options.body
        }
      : {
          kind: "embedded" as const,
          body: options.body
        }
  return {
    id: options.id,
    domain: "skill",
    value: {
      name: options.name,
      description: options.description,
      source,
      ...(options.sourceHash === undefined
        ? {}
        : { sourceHash: options.sourceHash }),
      ...(options.bodyHash === undefined ? {} : { bodyHash: options.bodyHash }),
      ...(options.byteLength === undefined
        ? {}
        : { byteLength: options.byteLength })
    },
    provenance: provenance("plugin", "plugin.skills"),
    order: 2
  }
}

function commandContribution(options: {
  id: string
  aliases: readonly string[]
  handlerRef: string
}): AppCommandContribution {
  return {
    id: options.id,
    domain: "command",
    value: {
      name: "plan",
      title: "Plan",
      aliases: options.aliases,
      handlerRef: options.handlerRef
    },
    provenance: provenance("plugin", "plugin.commands")
  }
}

function agentContribution(options: {
  id: string
  skillRefs: readonly string[]
}): AppAgentContribution {
  return {
    id: options.id,
    domain: "agent",
    value: {
      name: "reviewer",
      title: "Reviewer",
      skillRefs: options.skillRefs
    },
    provenance: provenance("plugin", "plugin.agents")
  }
}

function toolContribution(options: {
  id: string
  permission: NonNullable<AppToolContribution["value"]["permission"]>
  privileged: boolean
}): AppToolContribution {
  return {
    id: options.id,
    domain: "tool",
    value: {
      name: "issue.create",
      handlerRef: "tool.issue.create.handler",
      permission: options.permission
    },
    provenance: provenance("plugin", "plugin.tools"),
    privileged: options.privileged
  }
}

function providerCatalogContribution(options: {
  id: string
}): AppProviderCatalogContribution {
  return {
    id: options.id,
    domain: "provider_catalog",
    value: {
      providerId: "deepseek",
      models: [
        {
          id: "deepseek-v4",
          displayName: "DeepSeek V4",
          modalities: ["text"],
          defaultReasoningMode: "thinking"
        }
      ],
      defaults: {
        modelId: "deepseek-v4"
      }
    },
    provenance: provenance("marketplace", "catalog.deepseek")
  }
}

function lifecycleHookContribution(options: {
  id: string
}): AppLifecycleHookContribution {
  return {
    id: options.id,
    domain: "lifecycle_hook",
    value: {
      event: "app.start",
      handlerRef: "hook.start.handler"
    },
    provenance: provenance("policy", "policy.lifecycle")
  }
}

function provenance(
  kind: AppExtensionContribution["provenance"]["source"]["kind"],
  id: string
): AppExtensionContribution["provenance"] {
  return {
    source: {
      kind,
      scope: kind === "project_file" ? "project" : "user",
      id
    },
    trust: kind === "project_file" ? "trusted" : "user_enabled"
  }
}
