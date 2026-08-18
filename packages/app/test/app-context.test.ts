import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import {
  createWanexApp,
  WANEX_APP_AGENT_CONTEXT_PROFILE_KEY
} from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

const fakeModelEndpoint = appTestModelEndpoint()

describe("@wanex/app agent context commands", () => {
  it("runs agent turns with an app-owned context profile", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const cwd = join(workspaceRoot, "apps/demo")
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Use app profile.")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/write-tests/SKILL.md"),
      skillMd({
        name: "write-tests",
        description: "Write focused tests.",
        body: "FULL APP SHELL SKILL BODY"
      })
    )
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: fakeModelEndpoint,
      agentContextProfile: {
        instructions: {
          cwd,
          projectRoot: workspaceRoot,
          trustProject: true
        },
        skills: {
          cwd,
          projectRoot: workspaceRoot,
          trustProject: true,
          registerActivationTool: true
        }
      }
    })

    try {
      const result = await app.commands.runAgentTurn({
        content: [{ type: "text", text: "use configured context" }],
        sessionId: "ses_wanex_app_context"
      })

      expect(result).toMatchObject({
        sessionId: "ses_wanex_app_context",
        assistantText: "Fake response from wanex-app-model",
        context: {
          instructionSources: 1,
          skillNames: ["write-tests"],
          diagnostics: [],
          activationToolRegistered: true
        }
      })
      expect(JSON.stringify(result)).not.toContain("FULL APP SHELL SKILL BODY")
      expect(app.status().agentContext).toMatchObject({
        configured: true,
        revision: 1,
        context: {
          instructionSources: 1,
          skillNames: ["write-tests"],
          activationToolRegistered: true
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("hot reloads context profile config for later commands", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const firstCwd = join(workspaceRoot, "first")
    const secondCwd = join(workspaceRoot, "second")
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Use hot profile.")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/first-skill/SKILL.md"),
      skillMd({
        name: "first-skill",
        description: "First skill.",
        body: "FIRST APP SHELL SKILL BODY"
      })
    )
    await writeFileRecursive(
      join(workspaceRoot, "custom-skills/second-skill/SKILL.md"),
      skillMd({
        name: "second-skill",
        description: "Second skill.",
        body: "SECOND APP SHELL SKILL BODY"
      })
    )
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: fakeModelEndpoint,
      agentContextProfile: {
        instructions: {
          cwd: firstCwd,
          projectRoot: workspaceRoot,
          trustProject: true
        },
        skills: {
          cwd: firstCwd,
          projectRoot: workspaceRoot,
          trustProject: true,
          registerActivationTool: true
        }
      }
    })

    try {
      await expect(
        app.commands.runAgentTurn({
          content: [{ type: "text", text: "first profile" }],
          sessionId: "ses_wanex_app_hot_first"
        })
      ).resolves.toMatchObject({
        context: {
          skillNames: ["first-skill"],
          activationToolRegistered: true
        }
      })

      await expect(
        app.commands.setAgentContextProfile({
          instructions: {
            cwd: secondCwd,
            projectRoot: workspaceRoot,
            trustProject: true
          },
          skills: {
            cwd: secondCwd,
            projectRoot: workspaceRoot,
            projectSkillDirs: ["custom-skills"],
            trustProject: true,
            registerActivationTool: true
          }
        })
      ).resolves.toMatchObject({
        key: WANEX_APP_AGENT_CONTEXT_PROFILE_KEY,
        reloaded: true,
        detail: {
          revision: 2,
          instructionSources: 1,
          skillNames: ["second-skill"],
          activationToolRegistered: true
        }
      })

      const second = await app.commands.runAgentTurn({
        content: [{ type: "text", text: "second profile" }],
        sessionId: "ses_wanex_app_hot_second"
      })
      expect(second.context).toMatchObject({
        skillNames: ["second-skill"],
        activationToolRegistered: true
      })
      expect(JSON.stringify(second)).not.toContain("SECOND APP SHELL SKILL BODY")
      expect(app.status().agentContext).toMatchObject({
        configured: true,
        revision: 2,
        context: {
          skillNames: ["second-skill"]
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("fails closed on malformed hot reload config and keeps the previous profile", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Use safe profile.")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/safe-skill/SKILL.md"),
      skillMd({
        name: "safe-skill",
        description: "Safe skill.",
        body: "SAFE APP SHELL SKILL BODY"
      })
    )
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: fakeModelEndpoint,
      agentContextProfile: {
        skills: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot,
          trustProject: true,
          registerActivationTool: true
        }
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await storage.putConfig(WANEX_APP_AGENT_CONTEXT_PROFILE_KEY, {
        skills: {
          cwd: "",
          registerActivationTool: true
        }
      })
      const reload = await app.commands.refreshAgentContextProfile()

      expect(reload).toMatchObject({
        key: WANEX_APP_AGENT_CONTEXT_PROFILE_KEY,
        reloaded: false,
        error: {
          name: "Error",
          message:
            "agent context profile.skills.cwd must be a non-empty string"
        }
      })
      expect(app.status().agentContext).toMatchObject({
        configured: true,
        revision: 1,
        context: {
          skillNames: ["safe-skill"]
        }
      })
      await expect(
        app.commands.runAgentTurn({
          content: [{ type: "text", text: "after bad config" }],
          sessionId: "ses_wanex_app_bad_profile"
        })
      ).resolves.toMatchObject({
        context: {
          skillNames: ["safe-skill"]
        }
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("retains the last complete skill generation across incomplete discovery", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/safe-skill/SKILL.md"),
      skillMd({
        name: "safe-skill",
        description: "Safe skill.",
        body: "SAFE SKILL BODY"
      })
    )
    await writeFileRecursive(
      join(workspaceRoot, "custom-skills/next-skill/SKILL.md"),
      skillMd({
        name: "next-skill",
        description: "Next skill.",
        body: "NEXT SKILL BODY"
      })
    )
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      agentContextProfile: {
        skills: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot,
          trustProject: true,
          registerActivationTool: true
        }
      }
    })

    try {
      await expect(
        app.commands.setAgentContextProfile({
          skills: {
            cwd: workspaceRoot,
            projectRoot: workspaceRoot,
            projectSkillDirs: ["../unsafe"],
            trustProject: true,
            registerActivationTool: true
          }
        })
      ).resolves.toMatchObject({
        reloaded: false,
        reason: "skill_observation_incomplete",
        detail: {
          revision: 1,
          retained: true,
          skillNames: ["safe-skill"],
          candidateDiagnostics: ["skill.invalid_options"]
        }
      })
      expect(app.status().agentContext).toMatchObject({
        revision: 1,
        context: {
          skillNames: ["safe-skill"],
          activationToolRegistered: true
        }
      })

      await expect(
        app.commands.setAgentContextProfile({
          skills: {
            cwd: workspaceRoot,
            projectRoot: workspaceRoot,
            projectSkillDirs: ["custom-skills"],
            trustProject: true,
            registerActivationTool: true
          }
        })
      ).resolves.toMatchObject({
        reloaded: true,
        detail: {
          revision: 2,
          skillNames: ["next-skill"]
        }
      })
      expect(app.status().agentContext).toMatchObject({
        revision: 2,
        context: {
          skillNames: ["next-skill"],
          activationToolRegistered: true
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("treats same-profile instruction file changes as context reloads", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const instructionPath = join(workspaceRoot, "AGENTS.md")
    await writeFileRecursive(instructionPath, "Use first instruction.")
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      agentContextProfile: {
        instructions: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot,
          trustProject: true
        }
      }
    })

    try {
      await expect(app.commands.refreshAgentContextProfile()).resolves.toMatchObject({
        key: WANEX_APP_AGENT_CONTEXT_PROFILE_KEY,
        reloaded: false,
        reason: "unchanged",
        detail: {
          revision: 1,
          instructionSources: 1
        }
      })

      await writeFile(instructionPath, "Use second instruction.", {
        encoding: "utf8",
        flush: true
      })
      await expect(app.commands.refreshAgentContextProfile()).resolves.toMatchObject({
        key: WANEX_APP_AGENT_CONTEXT_PROFILE_KEY,
        reloaded: true,
        detail: {
          revision: 2,
          instructionSources: 1
        }
      })
      expect(app.status().agentContext).toMatchObject({
        configured: true,
        revision: 2,
        context: {
          instructionSources: 1
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("runs and stops the optional context refresh monitor", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const instructionPath = join(workspaceRoot, "AGENTS.md")
    await writeFileRecursive(instructionPath, "Monitor first instruction.")
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      agentContextProfile: {
        instructions: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot,
          trustProject: true
        }
      }
    })

    try {
      await expect(
        app.commands.startAgentContextMonitor({ intervalMs: 100 })
      ).resolves.toMatchObject({
        running: true,
        intervalMs: 100,
        refreshCount: 0
      })
      await writeFile(instructionPath, "Monitor second instruction.", {
        encoding: "utf8",
        flush: true
      })
      await eventually(() => {
        expect(app.status().agentContextMonitor).toMatchObject({
          running: true,
          intervalMs: 100,
          lastResult: {
            key: WANEX_APP_AGENT_CONTEXT_PROFILE_KEY,
            reloaded: true,
            detail: {
              revision: 2,
              instructionSources: 1
            }
          }
        })
        expect(app.status().agentContextMonitor.refreshCount).toBeGreaterThan(0)
      })
      await expect(app.commands.stopAgentContextMonitor()).resolves.toMatchObject({
        running: false,
        intervalMs: 100
      })
    } finally {
      await app.dispose()
    }
  })

  it("stops the optional context monitor during shutdown", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Shutdown monitor.")
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      agentContextProfile: {
        instructions: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot,
          trustProject: true
        }
      }
    })

    await app.commands.startAgentContextMonitor({ intervalMs: 100 })
    await expect(app.commands.shutdown()).resolves.toEqual({
      disposed: true,
      repeated: false
    })
    expect(app.status().agentContextMonitor.running).toBe(false)
  })
})

async function writeFileRecursive(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, { encoding: "utf8", flush: true })
}

function skillMd(options: {
  readonly name: string
  readonly description: string
  readonly body: string
}): string {
  return [
    "---",
    `name: ${JSON.stringify(options.name)}`,
    `description: ${JSON.stringify(options.description)}`,
    "---",
    "",
    options.body
  ].join("\n")
}

async function eventually(assertion: () => void): Promise<void> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 1_000) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await delay(25)
    }
  }
  throw lastError
}
