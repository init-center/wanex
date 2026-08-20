import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import type { JsonValue } from "@wanex/protocol"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { parseCommand } from "../src/args.js"

const execFileAsync = promisify(execFile)
const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const cliEntry = join(import.meta.dirname, "../src/index.ts")
const tsxBin = join(import.meta.dirname, "../../../node_modules/tsx/dist/cli.mjs")
const expectedSchemaVersion = 18
const CLI_EXEC_TIMEOUT_MS = 30_000
const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/cli", () => {
  it("initializes a store through the system-service process", async () => {
    const storeDir = await createStoreDir()
    const result = await runCli(["init"], storeDir)

    expect(result.ok).toBe(true)
    const value = expectRecord(result.value)
    expect(value.command).toBe("init")
    expect(value.storePath).toBe(join(storeDir, "state.db"))
    expect(value.schemaVersion).toBe(expectedSchemaVersion)
    expect(value.runtime).toMatchObject({
      store: {
        kind: "local-system-service",
        storeDir
      },
      serviceBinary: {
        path: serviceBin,
        exists: true
      }
    })
  })

  it("uses the default local profile under the configured store root", async () => {
    const storeRoot = await createStoreDir()
    const result = await runCliWithEnv(["init"], {
      WANEX_STORE_ROOT: storeRoot
    })

    expect(result.ok).toBe(true)
    const value = expectRecord(result.value)
    expect(value.command).toBe("init")
    expect(value.storePath).toBe(join(storeRoot, "profiles/default/state.db"))
    expect(value.schemaVersion).toBe(expectedSchemaVersion)
    expect(value.runtime).toMatchObject({
      store: {
        kind: "local-profile",
        rootDir: storeRoot,
        profileId: "default",
        storeDir: join(storeRoot, "profiles/default")
      },
      serviceBinary: {
        path: serviceBin,
        exists: true
      }
    })
  })

  it("reports runtime doctor metadata without repository toolchain state", async () => {
    const storeRoot = await createStoreDir()
    const result = await runCliWithEnv(["doctor", "--store-profile", "work"], {
      WANEX_STORE_ROOT: storeRoot
    })
    const value = expectRecord(result.value)
    const runtime = expectRecord(value.runtime)

    expect(value.command).toBe("doctor")
    expect(value.storePath).toBe(join(storeRoot, "profiles/work/state.db"))
    expect(runtime.store).toMatchObject({
      kind: "local-profile",
      rootDir: storeRoot,
      profileId: "work",
      storeDir: join(storeRoot, "profiles/work")
    })
    expect(runtime.serviceBinary).toMatchObject({
      path: serviceBin,
      exists: true
    })
    expect(JSON.stringify(value)).not.toContain("corepack")
    expect(JSON.stringify(value)).not.toContain("pnpm")
  })

  it("runs with an explicit fake model endpoint and persists the reply", async () => {
    const storeDir = await createStoreDir()
    const result = await runCli(["run", "hello", "wanex"], storeDir)

    expect(result.ok).toBe(true)
    const value = expectRecord(result.value)
    expect(value.command).toBe("run")
    expect(value.status).toBe("completed")
    expect(typeof value.jobId).toBe("string")
    expect(value.assistantText).toBe("Fake response from wanex-cli-test-model")
    expect(typeof value.sessionId).toBe("string")
    expect(Array.isArray(value.messages)).toBe(true)
  })

  it("runs side queries against session context without persisting them", async () => {
    const storeDir = await createStoreDir()
    await runCli(
      ["run", "durable context", "--session", "ses_cli_side_query"],
      storeDir
    )
    const storage = createTestStore(storeDir)
    const [inputsBefore, messagesBefore, jobsBefore] = await Promise.all([
      storage.listSessionInputs({ sessionId: "ses_cli_side_query" }),
      storage.listSessionMessages({ sessionId: "ses_cli_side_query" }),
      storage.listJobs({ kind: "session.turn", limit: 20 })
    ])

    const result = await runCli(
      [
        "side-query",
        "quick",
        "aside",
        "--session",
        "ses_cli_side_query",
        "--max-output-tokens",
        "24"
      ],
      storeDir
    )
    const value = expectRecord(result.value)
    const telemetry = expectRecord(value.telemetry)

    expect(value.command).toBe("side-query")
    expect(value.sessionId).toBe("ses_cli_side_query")
    expect(value.persisted).toBe(false)
    expect(value.outputText).toBe("Fake response from wanex-cli-test-model")
    expect(telemetry.replayMessageCount).toBe(2)
    expect(telemetry.outputPartCount).toBe(1)
    await expect(
      storage.listSessionInputs({ sessionId: "ses_cli_side_query" })
    ).resolves.toEqual(inputsBefore)
    await expect(
      storage.listSessionMessages({ sessionId: "ses_cli_side_query" })
    ).resolves.toEqual(messagesBefore)
    await expect(storage.listJobs({ kind: "session.turn", limit: 20 })).resolves.toEqual(
      jobsBefore
    )
  })

  it("stores endpoint credential refs and omits them from CLI output", async () => {
    const storeDir = await createStoreDir()
    const set = await runCli(
      [
        "model-endpoint",
        "set",
        "deepseek",
        "--protocol",
        "openai-chat-completions",
        "--provider-id",
        "deepseek",
        "--model",
        "deepseek-chat",
        "--input-modalities",
        "text,image",
        "--output-modalities",
        "text",
        "--base-url",
        "https://api.deepseek.com/v1",
        "--secret-ref",
        "env://DEEPSEEK_API_KEY"
      ],
      storeDir
    )
    const get = await runCli(["model-endpoint", "get", "deepseek"], storeDir)

    expect(expectRecord(set.value).modelEndpoint).toMatchObject({
      credentialConfigured: true
    })
    expect(expectRecord(get.value).modelEndpoint).toMatchObject({
      id: "deepseek",
      connection: expect.objectContaining({ providerId: "deepseek" }),
      protocol: { id: "openai-chat-completions" },
      model: expect.objectContaining({
        id: "deepseek-chat",
        inputModalities: ["text", "image"],
        outputModalities: ["text"]
      }),
      credentialConfigured: true
    })
    expect(JSON.stringify(set.value)).not.toContain("secretRef")
    expect(JSON.stringify(get.value)).not.toContain("secretRef")
  })

  it("isolates model endpoints by local store profile", async () => {
    const storeRoot = await createStoreDir()
    const set = await runCliWithEnv(
      [
        "model-endpoint",
        "set",
        "deepseek",
        "--store-profile",
        "work",
        "--protocol",
        "openai-chat-completions",
        "--provider-id",
        "deepseek",
        "--model",
        "deepseek-chat",
        "--base-url",
        "https://api.deepseek.com/v1",
        "--secret-ref",
        "env://DEEPSEEK_API_KEY"
      ],
      {
        WANEX_STORE_ROOT: storeRoot
      }
    )
    const personal = await runCliWithEnv(
      ["model-endpoint", "get", "deepseek", "--store-profile", "personal"],
      {
        WANEX_STORE_ROOT: storeRoot
      }
    )
    const work = await runCliWithEnv(
      ["model-endpoint", "get", "deepseek", "--store-profile", "work"],
      {
        WANEX_STORE_ROOT: storeRoot
      }
    )

    expect(expectRecord(set.value).modelEndpoint).toMatchObject({
      credentialConfigured: true
    })
    expect(expectRecord(personal.value).modelEndpoint).toBeNull()
    expect(expectRecord(work.value).modelEndpoint).toMatchObject({
      id: "deepseek",
      credentialConfigured: true
    })
  })

  it("runs with a configured fake model endpoint", async () => {
    const storeDir = await createStoreDir()
    await runCli(
      [
        "model-endpoint",
        "set",
        "local",
        "--protocol",
        "fake",
        "--provider-id",
        "fake",
        "--model",
        "fake-profile"
      ],
      storeDir
    )

    const result = await runCli(
      ["run", "hello", "--model-endpoint", "local"],
      storeDir
    )
    const value = expectRecord(result.value)

    expect(value.modelEndpointId).toBe("local")
    expect(typeof value.jobId).toBe("string")
    expect(value.assistantText).toBe("Fake response from fake-profile")
  })

  it("runs with explicit trusted instruction and skill context", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const cwd = join(workspaceRoot, "apps/demo")
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Prefer CLI tests.")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/write-tests/SKILL.md"),
      skillMd({
        name: "write-tests",
        description: "Write focused tests.",
        body: "FULL SKILL BODY SHOULD NOT PRINT"
      })
    )

    const result = await runCli(
      [
        "run",
        "context",
        "turn",
        "--instructions-cwd",
        cwd,
        "--instructions-project-root",
        workspaceRoot,
        "--trust-project-instructions",
        "--skills-cwd",
        cwd,
        "--skills-project-root",
        workspaceRoot,
        "--trust-project-skills",
        "--activate-skill-tool"
      ],
      storeDir
    )
    const value = expectRecord(result.value)
    const context = expectRecord(value.context)
    const instructions = expectRecord(context.instructions)
    const skills = expectRecord(context.skills)

    expect(value.assistantText).toBe("Fake response from wanex-cli-test-model")
    expect(instructions.status).toBe("available")
    expect(instructions.sources).toEqual([
      expect.objectContaining({
        scope: "project",
        path: join(workspaceRoot, "AGENTS.md"),
        target: "AGENTS.md"
      })
    ])
    expect(skills.complete).toBe(true)
    expect(skills.activationToolRegistered).toBe(true)
    expect(skills.sources).toEqual([
      expect.objectContaining({
        scope: "project",
        name: "write-tests",
        description: "Write focused tests.",
        path: join(
          workspaceRoot,
          ".agents/skills/write-tests/SKILL.md"
        )
      })
    ])
    expect(JSON.stringify(value)).not.toContain("FULL SKILL BODY SHOULD NOT PRINT")
  })

  it("reports untrusted project context without loading it", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const cwd = join(workspaceRoot, "apps/demo")
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Do not load.")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/project-skill/SKILL.md"),
      skillMd({
        name: "project-skill",
        description: "Project skill.",
        body: "Do not load."
      })
    )

    const result = await runCli(
      [
        "run",
        "untrusted",
        "--instructions-cwd",
        cwd,
        "--instructions-project-root",
        workspaceRoot,
        "--skills-cwd",
        cwd,
        "--skills-project-root",
        workspaceRoot
      ],
      storeDir
    )
    const context = expectRecord(expectRecord(result.value).context)
    const instructions = expectRecord(context.instructions)
    const skills = expectRecord(context.skills)

    expect(instructions.sources).toEqual([])
    expect(instructions.diagnostics).toEqual([
      expect.objectContaining({
        code: "instruction.project_untrusted",
        path: join(workspaceRoot, "AGENTS.md")
      })
    ])
    expect(skills.sources).toEqual([])
    expect(skills.diagnostics).toEqual([
      expect.objectContaining({
        code: "skill.project_untrusted",
        path: join(workspaceRoot, ".agents/skills")
      })
    ])
  })

  it("queries emitted session events", async () => {
    const storeDir = await createStoreDir()
    await runCli(
      ["run", "events", "--session", "ses_cli_events"],
      storeDir
    )

    const result = await runCli(
      ["events", "--session", "ses_cli_events", "--limit", "20"],
      storeDir
    )
    const value = expectRecord(result.value)
    const events = value.events

    expect(Array.isArray(events)).toBe(true)
    if (!Array.isArray(events)) {
      throw new Error("expected events array")
    }
    expect(events.map((event) => expectRecord(event).type)).toContain(
      "session.turn.succeeded"
    )
    expect(events.map((event) => expectRecord(event).type)).toContain(
      "session.turn.submitted"
    )
  })

  it("submits explicit memory maintenance sweep jobs without running workers", async () => {
    const storeDir = await createStoreDir()
    const providerId = "cli-memory-fake"
    await configureFakeProvider(
      storeDir,
      providerId,
      "memory-token ".repeat(900)
    )
    await runCli(
      [
        "run",
        "memory ".repeat(900),
        "--session",
        "ses_cli_memory_sweep",
        "--model-endpoint",
        providerId
      ],
      storeDir
    )
    await runCli(
      ["run", "second turn", "--session", "ses_cli_memory_sweep", "--model-endpoint", providerId],
      storeDir
    )
    await runCli(
      ["run", "third turn", "--session", "ses_cli_memory_sweep", "--model-endpoint", providerId],
      storeDir
    )

    const result = await runCli(
      [
        "memory",
        "sweep",
        "--minimum-token-savings",
        "1",
        "--idempotency-prefix",
        "cli-memory-sweep"
      ],
      storeDir
    )
    const value = expectRecord(result.value)
    const submittedJobs = value.submittedJobs

    expect(value.command).toBe("memory-sweep")
    expect(value.scannedSessionIds).toEqual(["ses_cli_memory_sweep"])
    expect(Array.isArray(submittedJobs)).toBe(true)
    if (!Array.isArray(submittedJobs)) {
      throw new Error("expected submittedJobs array")
    }
    expect(submittedJobs).toEqual([
      expect.objectContaining({
        kind: "memory.compaction",
        state: "ready",
        sessionId: "ses_cli_memory_sweep",
        sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        policyDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        idempotencyKey: expect.stringMatching(
          /^cli-memory-sweep:ses_cli_memory_sweep:[a-f0-9]{64}:[a-f0-9]{64}$/
        )
      })
    ])

    const repeated = await runCli(
      [
        "memory",
        "sweep",
        "--minimum-token-savings",
        "1",
        "--idempotency-prefix",
        "cli-memory-sweep"
      ],
      storeDir
    )
    const repeatedJobs = expectRecord(repeated.value).submittedJobs
    expect(repeatedJobs).toEqual(submittedJobs)
  })

  it("projects diagnostics through the app facade without running workers", async () => {
    const storeDir = await createStoreDir()
    const providerId = "cli-diagnostics-fake"
    await configureFakeProvider(
      storeDir,
      providerId,
      "diagnostics-token ".repeat(900)
    )
    await runCli(
      [
        "run",
        "diagnostics ".repeat(900),
        "--session",
        "ses_cli_diagnostics",
        "--model-endpoint",
        providerId
      ],
      storeDir
    )
    await runCli(
      ["run", "second turn", "--session", "ses_cli_diagnostics", "--model-endpoint", providerId],
      storeDir
    )
    await runCli(
      ["run", "third turn", "--session", "ses_cli_diagnostics", "--model-endpoint", providerId],
      storeDir
    )
    await runCli(
      [
        "memory",
        "sweep",
        "--minimum-token-savings",
        "1",
        "--idempotency-prefix",
        "cli-diagnostics-memory"
      ],
      storeDir
    )

    const result = await runCli(
      [
        "diagnostics",
        "--memory-maintenance",
        "--stale-after-ms",
        "1",
        "--limit",
        "20"
      ],
      storeDir
    )
    const value = expectRecord(result.value)
    const diagnostics = value.diagnostics
    const activity = value.activity

    expect(value.command).toBe("diagnostics")
    expect(typeof value.generatedAt).toBe("number")
    expect(Array.isArray(diagnostics)).toBe(true)
    expect(Array.isArray(activity)).toBe(true)
    if (!Array.isArray(diagnostics) || !Array.isArray(activity)) {
      throw new Error("expected diagnostics and activity arrays")
    }
    expect(diagnostics.map((item) => expectRecord(item).code)).toEqual(
      expect.arrayContaining([
        "memory.compaction.ready",
        "memory.maintenance.backlog.ready",
        "memory.maintenance.session.no_active_epoch"
      ])
    )
    expect(activity.map((item) => expectRecord(item).source)).toContain("memory")
  })

  it("collects a redacted support bundle through the CLI", async () => {
    const storeDir = await createStoreDir()
    await runCli(
      [
        "model-endpoint",
        "set",
        "support",
        "--protocol",
        "openai-chat-completions",
        "--provider-id",
        "deepseek",
        "--model",
        "deepseek-chat",
        "--base-url",
        "https://api.deepseek.com/v1",
        "--secret-ref",
        "env://SUPPORT_API_KEY"
      ],
      storeDir
    )
    await runCli(
      ["run", "support bundle", "--session", "ses_cli_support_bundle"],
      storeDir
    )

    const result = await runCli(
      [
        "support-bundle",
        "--model-endpoint",
        "support",
        "--session",
        "ses_cli_support_bundle",
        "--event-limit",
        "10",
        "--job-limit",
        "10",
        "--memory-maintenance"
      ],
      storeDir
    )
    const value = expectRecord(result.value)
    const modelEndpoints = value.modelEndpoints
    const serialized = JSON.stringify(value)

    expect(value.command).toBe("support-bundle")
    expect(serialized).not.toContain("SUPPORT_API_KEY")
    expect(Array.isArray(modelEndpoints)).toBe(true)
    if (!Array.isArray(modelEndpoints)) {
      throw new Error("expected model endpoints array")
    }
    expect(modelEndpoints).toEqual([
      expect.objectContaining({
        id: "support",
        found: true,
        endpoint: expect.objectContaining({
          credentialConfigured: true
        })
      })
    ])
    expect(serialized).not.toContain("secretRef")
    expect(expectRecord(value.doctor).schemaVersion).toBe(expectedSchemaVersion)
    expect(Array.isArray(value.events)).toBe(true)
  })

  it("reuses an explicit session id across runs", async () => {
    const storeDir = await createStoreDir()
    const first = await runCli(
      ["run", "first", "--session", "ses_cli_reuse"],
      storeDir
    )
    const second = await runCli(
      ["run", "second", "--session", "ses_cli_reuse"],
      storeDir
    )

    expect(expectRecord(first.value).sessionId).toBe("ses_cli_reuse")
    const secondValue = expectRecord(second.value)
    expect(secondValue.sessionId).toBe("ses_cli_reuse")
    expect(secondValue.assistantText).toBe("Fake response from wanex-cli-test-model")
  })

  it("returns a structured error for invalid usage", async () => {
    const storeDir = await createStoreDir()
    await expect(runCli(["run"], storeDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("run requires text")
    })
  })

  it("requires an explicit model endpoint for execution commands", async () => {
    const storeDir = await createStoreDir()
    await expect(
      runCliWithEnv(["run", "provider required"], {
        WANEX_STORE_DIR: storeDir
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("run requires --model-endpoint")
    })
  })

  it("rejects combining exact store override with local profile options", async () => {
    const storeDir = await createStoreDir()
    await expect(
      runCliWithEnv(["init", "--store", storeDir, "--store-profile", "work"], {})
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "--store cannot be combined with --store-profile or --store-root"
      )
    })
  })

  it("parses run timeout guard options", () => {
    const parsed = parseCommand(["run", "hello", "--model-endpoint", "local", "--timeout-ms", "250"], {
      HOME: "/tmp/home"
    })

    expect(parsed).toMatchObject({
      name: "run",
      text: "hello",
      timeoutMs: 250
    })
    expect(() =>
      parseCommand(["run", "hello", "--model-endpoint", "local", "--timeout-ms", "0"], {
        HOME: "/tmp/home"
      })
    ).toThrow("--timeout-ms must be a positive integer")
  })

  it("parses explicit run context options", () => {
    const parsed = parseCommand(
      [
        "run",
        "hello",
        "--model-endpoint",
        "local",
        "--max-steps",
        "4",
        "--instructions-cwd",
        "/repo/app",
        "--instructions-project-root",
        "/repo",
        "--instructions-global-dir",
        "/home/user/.wanex",
        "--trust-project-instructions",
        "--skills-cwd",
        "/repo/app",
        "--skills-project-root",
        "/repo",
        "--skills-global-dir",
        "/home/user/.wanex/skills,/opt/wanex/skills",
        "--trust-project-skills",
        "--activate-skill-tool",
        "--skill-activation-max-indexed-files",
        "5",
        "--skill-activation-supporting-dirs",
        "references,examples"
      ],
      {
        HOME: "/tmp/home"
      }
    )

    expect(parsed).toMatchObject({
      name: "run",
      text: "hello",
      maxSteps: 4,
      context: {
        instructions: {
          cwd: resolve("/repo/app"),
          projectRoot: resolve("/repo"),
          globalConfigDir: resolve("/home/user/.wanex"),
          trust: { projectInstructions: "trusted" }
        },
        skills: {
          cwd: resolve("/repo/app"),
          projectRoot: resolve("/repo"),
          globalSkillDirs: [
            resolve("/home/user/.wanex/skills"),
            resolve("/opt/wanex/skills")
          ],
          trust: { projectSkills: "trusted" },
          registerActivationTool: true,
          activationTool: {
            maxIndexedFiles: 5,
            supportingDirectories: ["references", "examples"]
          }
        }
      }
    })
    expect(() =>
      parseCommand(["run", "hello", "--trust-project-instructions"], {
        HOME: "/tmp/home"
      })
    ).toThrow("--instructions-cwd is required when instruction options are used")
    expect(() =>
      parseCommand(
        ["run", "hello", "--skills-cwd", "/repo", "--skill-activation-max-indexed-files", "5"],
        { HOME: "/tmp/home" }
      )
    ).toThrow("skill activation options require --activate-skill-tool")
  })

  it("parses local profile store options", () => {
    const parsed = parseCommand(["doctor", "--store-profile", "work"], {
      HOME: "/tmp/home"
    })

    expect(parsed).toMatchObject({
      name: "doctor",
      options: {
        store: {
          kind: "local-profile",
          rootDir: join(resolve("/tmp/home"), ".wanex"),
          profileId: "work"
        }
      }
    })
  })

  it("parses memory sweep options", () => {
    const parsed = parseCommand(
      [
        "memory",
        "sweep",
        "--principal",
        "maintainer",
        "--session-limit",
        "5",
        "--minimum-token-savings",
        "10",
        "--idempotency-prefix",
        "cli-sweep"
      ],
      {
        HOME: "/tmp/home"
      }
    )

    expect(parsed).toMatchObject({
      name: "memory-sweep",
      principalId: "maintainer",
      sessionLimit: 5,
      minimumTokenSavings: 10,
      idempotencyKeyPrefix: "cli-sweep"
    })
    expect(() =>
      parseCommand(["memory", "sweep", "--session-limit", "0"], {
        HOME: "/tmp/home"
      })
    ).toThrow("--session-limit must be a positive integer")
  })

  it("parses diagnostics options", () => {
    const parsed = parseCommand(
      [
        "diagnostics",
        "--include-config-reloads",
        "--memory-maintenance",
        "--stale-after-ms",
        "1000",
        "--session-limit",
        "3",
        "--limit",
        "7",
        "--plugin-limit",
        "2"
      ],
      {
        HOME: "/tmp/home"
      }
    )

    expect(parsed).toMatchObject({
      name: "diagnostics",
      includeConfigReloads: true,
      memoryMaintenance: true,
      staleAfterMs: 1000,
      sessionLimit: 3,
      jobLimit: 7,
      pluginLimit: 2
    })
    expect(() =>
      parseCommand(["diagnostics", "--stale-after-ms", "0"], {
        HOME: "/tmp/home"
      })
    ).toThrow("--stale-after-ms must be a positive integer")
  })

  it("parses support-bundle options", () => {
    const parsed = parseCommand(
      [
        "support-bundle",
        "--model-endpoint",
        "local,deepseek",
        "--session",
        "ses_support",
        "--event-limit",
        "3",
        "--job-limit",
        "4",
        "--plugin-limit",
        "5",
        "--memory-maintenance",
        "--session-limit",
        "6"
      ],
      {
        HOME: "/tmp/home"
      }
    )

    expect(parsed).toMatchObject({
      name: "support-bundle",
      modelEndpointIds: ["local", "deepseek"],
      sessionId: "ses_support",
      eventLimit: 3,
      jobLimit: 4,
      pluginLimit: 5,
      memoryMaintenance: true,
      sessionLimit: 6
    })
    expect(() =>
      parseCommand(["support-bundle", "--event-limit", "0"], {
        HOME: "/tmp/home"
      })
    ).toThrow("--event-limit must be a positive integer")
  })

  it("parses side-query options", () => {
    const parsed = parseCommand(
      [
        "side-query",
        "hello",
        "side",
        "--session",
        "ses_side",
        "--model-endpoint",
        "local",
        "--timeout-ms",
        "250",
        "--max-output-tokens",
        "32"
      ],
      {
        HOME: "/tmp/home"
      }
    )

    expect(parsed).toMatchObject({
      name: "side-query",
      text: "hello side",
      sessionId: "ses_side",
      modelEndpointId: "local",
      timeoutMs: 250,
      maxOutputTokens: 32
    })
    expect(() =>
      parseCommand(["side-query", "hello", "--max-output-tokens", "0"], {
        HOME: "/tmp/home"
      })
    ).toThrow("--max-output-tokens must be a positive integer")
  })
})

async function createStoreDir(): Promise<string> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-cli-"))
  tempDirs.push(storeDir)
  return storeDir
}

async function runCli(
  args: readonly string[],
  storeDir: string
): Promise<Record<string, JsonValue>> {
  const command = args[0]
  const needsModelEndpoint =
    (command === "run" || command === "side-query") &&
    !args.includes("--model-endpoint")
  if (needsModelEndpoint) {
    await runCliWithEnv(
      [
        "model-endpoint",
        "set",
        "cli-test-fake",
        "--protocol",
        "fake",
        "--provider-id",
        "fake",
        "--model",
        "wanex-cli-test-model"
      ],
      { WANEX_STORE_DIR: storeDir }
    )
  }
  return await runCliWithEnv(
    needsModelEndpoint
      ? [...args, "--model-endpoint", "cli-test-fake"]
      : args,
    {
      WANEX_STORE_DIR: storeDir
    }
  )
}

async function configureFakeProvider(
  storeDir: string,
  id: string,
  modelId: string
): Promise<void> {
  await runCliWithEnv(
    [
      "model-endpoint",
      "set",
      id,
      "--protocol",
      "fake",
      "--provider-id",
      "fake",
      "--model",
      modelId,
      "--model-context-window-tokens",
      "12000",
      "--model-max-input-tokens",
      "12000",
      "--model-max-output-tokens",
      "500"
    ],
    { WANEX_STORE_DIR: storeDir }
  )
}

function createTestStore(storeDir: string): StorageTestStore {
  return createStorageTestStore({ kind: "local-system-service", mode: "oneshot",
    storeDir,
    serviceBin
  })
}

async function runCliWithEnv(
  args: readonly string[],
  env: NodeJS.ProcessEnv
): Promise<Record<string, JsonValue>> {
  const { stdout } = await execFileAsync(process.execPath, [tsxBin, cliEntry, ...args], {
    timeout: CLI_EXEC_TIMEOUT_MS,
    env: {
      ...process.env,
      WANEX_STORE_DIR: undefined,
      WANEX_STORE_PROFILE: undefined,
      WANEX_STORE_ROOT: undefined,
      ...env,
      WANEX_SYSTEM_SERVICE_BIN: serviceBin
    }
  })
  const parsed: unknown = JSON.parse(stdout)
  return expectRecord(parsed)
}

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

function expectRecord(value: unknown): Record<string, JsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected object")
  }
  return value as Record<string, JsonValue>
}
