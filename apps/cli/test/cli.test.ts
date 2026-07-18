import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import type { JsonValue } from "@wanex/protocol"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { parseCommand } from "../src/args.js"

const execFileAsync = promisify(execFile)
const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)
const cliEntry = join(import.meta.dirname, "../src/index.ts")
const tsxBin = join(import.meta.dirname, "../../../node_modules/tsx/dist/cli.mjs")
const expectedSchemaVersion = 8
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

  it("runs one fake-provider agent turn and persists the reply", async () => {
    const storeDir = await createStoreDir()
    const result = await runCli(["run", "hello", "wanex"], storeDir)

    expect(result.ok).toBe(true)
    const value = expectRecord(result.value)
    expect(value.command).toBe("run")
    expect(value.status).toBe("completed")
    expect(typeof value.jobId).toBe("string")
    expect(value.assistantText).toBe("Fake response: hello wanex")
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
      storage.listJobs({ kind: "session.run", limit: 20 })
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
    expect(value.outputText).toBe("Fake side response: quick aside")
    expect(telemetry.replayMessageCount).toBe(2)
    expect(telemetry.outputPartCount).toBe(1)
    await expect(
      storage.listSessionInputs({ sessionId: "ses_cli_side_query" })
    ).resolves.toEqual(inputsBefore)
    await expect(
      storage.listSessionMessages({ sessionId: "ses_cli_side_query" })
    ).resolves.toEqual(messagesBefore)
    await expect(storage.listJobs({ kind: "session.run", limit: 20 })).resolves.toEqual(
      jobsBefore
    )
  })

  it("stores provider profiles and redacts api keys in CLI output", async () => {
    const storeDir = await createStoreDir()
    const set = await runCli(
      [
        "provider",
        "set",
        "deepseek",
        "--kind",
        "openai-compatible",
        "--provider-id",
        "deepseek",
        "--model",
        "deepseek-chat",
        "--base-url",
        "https://api.deepseek.com/v1",
        "--api-key",
        "secret-key"
      ],
      storeDir
    )
    const get = await runCli(["provider", "get", "deepseek"], storeDir)

    expect(expectRecord(set.value).profile).toMatchObject({
      apiKey: "***"
    })
    expect(expectRecord(get.value).profile).toMatchObject({
      id: "deepseek",
      kind: "openai-compatible",
      providerId: "deepseek",
      modelId: "deepseek-chat",
      apiKey: "***"
    })
  })

  it("isolates provider profiles by local store profile", async () => {
    const storeRoot = await createStoreDir()
    const set = await runCliWithEnv(
      [
        "provider",
        "set",
        "deepseek",
        "--store-profile",
        "work",
        "--kind",
        "openai-compatible",
        "--provider-id",
        "deepseek",
        "--model",
        "deepseek-chat",
        "--api-key",
        "secret-key"
      ],
      {
        WANEX_STORE_ROOT: storeRoot
      }
    )
    const personal = await runCliWithEnv(
      ["provider", "get", "deepseek", "--store-profile", "personal"],
      {
        WANEX_STORE_ROOT: storeRoot
      }
    )
    const work = await runCliWithEnv(
      ["provider", "get", "deepseek", "--store-profile", "work"],
      {
        WANEX_STORE_ROOT: storeRoot
      }
    )

    expect(expectRecord(set.value).profile).toMatchObject({
      apiKey: "***"
    })
    expect(expectRecord(personal.value).profile).toBeNull()
    expect(expectRecord(work.value).profile).toMatchObject({
      id: "deepseek",
      apiKey: "***"
    })
  })

  it("runs with a configured fake provider profile", async () => {
    const storeDir = await createStoreDir()
    await runCli(
      [
        "provider",
        "set",
        "local",
        "--kind",
        "fake",
        "--provider-id",
        "fake",
        "--model",
        "fake-profile"
      ],
      storeDir
    )

    const result = await runCli(
      ["run", "hello", "--provider", "local"],
      storeDir
    )
    const value = expectRecord(result.value)

    expect(value.providerId).toBe("local")
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

    expect(value.assistantText).toBe("Fake response: context turn")
    expect(instructions.status).toBe("available")
    expect(instructions.sources).toEqual([
      expect.objectContaining({
        scope: "project",
        path: join(workspaceRoot, "AGENTS.md"),
        target: "AGENTS.md"
      })
    ])
    expect(skills.status).toBe("available")
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
      "session.run.completed"
    )
    expect(events.map((event) => expectRecord(event).type)).toContain(
      "session.run.submitted"
    )
  })

  it("submits explicit memory maintenance sweep jobs without running workers", async () => {
    const storeDir = await createStoreDir()
    await runCli(
      [
        "run",
        "memory ".repeat(900),
        "--session",
        "ses_cli_memory_sweep"
      ],
      storeDir
    )
    await runCli(
      ["run", "second turn", "--session", "ses_cli_memory_sweep"],
      storeDir
    )
    await runCli(
      ["run", "third turn", "--session", "ses_cli_memory_sweep"],
      storeDir
    )

    const result = await runCli(
      [
        "memory",
        "sweep",
        "--waterline-tokens",
        "1",
        "--minimum-token-savings",
        "1",
        "--policy-version",
        "cli-memory-v1",
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
        policyVersion: "cli-memory-v1",
        idempotencyKey: "cli-memory-sweep:ses_cli_memory_sweep:cli-memory-v1"
      })
    ])

    const repeated = await runCli(
      [
        "memory",
        "sweep",
        "--waterline-tokens",
        "1",
        "--minimum-token-savings",
        "1",
        "--policy-version",
        "cli-memory-v1",
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
    await runCli(
      [
        "run",
        "diagnostics ".repeat(900),
        "--session",
        "ses_cli_diagnostics"
      ],
      storeDir
    )
    await runCli(
      ["run", "second turn", "--session", "ses_cli_diagnostics"],
      storeDir
    )
    await runCli(
      ["run", "third turn", "--session", "ses_cli_diagnostics"],
      storeDir
    )
    await runCli(
      [
        "memory",
        "sweep",
        "--waterline-tokens",
        "1",
        "--minimum-token-savings",
        "1",
        "--policy-version",
        "cli-diagnostics-memory",
        "--idempotency-prefix",
        "cli-diagnostics-memory"
      ],
      storeDir
    )

    const result = await runCli(
      [
        "diagnostics",
        "--memory-maintenance",
        "--policy-version",
        "cli-diagnostics-memory",
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
        "provider",
        "set",
        "support",
        "--kind",
        "openai-compatible",
        "--provider-id",
        "deepseek",
        "--model",
        "deepseek-chat",
        "--api-key",
        "support-secret"
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
        "--provider-profile",
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
    const providers = value.providers
    const serialized = JSON.stringify(value)

    expect(value.command).toBe("support-bundle")
    expect(serialized).not.toContain("support-secret")
    expect(Array.isArray(providers)).toBe(true)
    if (!Array.isArray(providers)) {
      throw new Error("expected providers array")
    }
    expect(providers).toEqual([
      expect.objectContaining({
        id: "support",
        found: true,
        profile: expect.objectContaining({
          apiKey: "***"
        })
      })
    ])
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
    expect(secondValue.assistantText).toContain("Fake response: first")
    expect(secondValue.assistantText).toContain("Fake response: second")
  })

  it("returns a structured error for invalid usage", async () => {
    const storeDir = await createStoreDir()
    await expect(runCli(["run"], storeDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("run requires text")
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
    const parsed = parseCommand(["run", "hello", "--timeout-ms", "250"], {
      HOME: "/tmp/home"
    })

    expect(parsed).toMatchObject({
      name: "run",
      text: "hello",
      timeoutMs: 250
    })
    expect(() =>
      parseCommand(["run", "hello", "--timeout-ms", "0"], {
        HOME: "/tmp/home"
      })
    ).toThrow("--timeout-ms must be a positive integer")
  })

  it("parses explicit run context options", () => {
    const parsed = parseCommand(
      [
        "run",
        "hello",
        "--to-completion",
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
      mode: "to_completion",
      maxSteps: 4,
      context: {
        instructions: {
          cwd: "/repo/app",
          projectRoot: "/repo",
          globalConfigDir: "/home/user/.wanex",
          trust: { projectInstructions: "trusted" }
        },
        skills: {
          cwd: "/repo/app",
          projectRoot: "/repo",
          globalSkillDirs: [
            "/home/user/.wanex/skills",
            "/opt/wanex/skills"
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
      parseCommand(["run", "hello", "--max-steps", "4"], {
        HOME: "/tmp/home"
      })
    ).toThrow("--max-steps requires --to-completion")
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
          rootDir: "/tmp/home/.wanex",
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
        "--waterline-tokens",
        "100",
        "--minimum-token-savings",
        "10",
        "--policy-version",
        "cli-policy",
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
      waterlineTokens: 100,
      minimumTokenSavings: 10,
      policyVersion: "cli-policy",
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
        "--policy-version",
        "diag-policy",
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
      policyVersion: "diag-policy",
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
        "--provider-profile",
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
        "--policy-version",
        "support-policy",
        "--session-limit",
        "6"
      ],
      {
        HOME: "/tmp/home"
      }
    )

    expect(parsed).toMatchObject({
      name: "support-bundle",
      providerProfileIds: ["local", "deepseek"],
      sessionId: "ses_support",
      eventLimit: 3,
      jobLimit: 4,
      pluginLimit: 5,
      memoryMaintenance: true,
      policyVersion: "support-policy",
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
        "--provider",
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
      providerId: "local",
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
  return await runCliWithEnv(args, {
    WANEX_STORE_DIR: storeDir
  })
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
