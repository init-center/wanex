import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { JsonValue } from "@wanex/protocol"
import {
  fakeModelDescriptor,
  type PreparedProviderReplayMessage,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest
} from "@wanex/runtime/provider"
import { AllowAllToolsPolicy } from "@wanex/runtime/tools"
import {
  CodingHostTestScope,
  executionOptions,
  git
} from "./support.js"

let scope: CodingHostTestScope

beforeEach(() => {
  scope = new CodingHostTestScope()
})

afterEach(async () => {
  await scope.dispose()
})

describe("Coding repository context admission", () => {
  it("preserves global/project hierarchy and isolates concurrent repositories", async () => {
    const environment = await scope.createEnvironment()
    const globalConfigDir = await scope.tempDir("wanex-coding-global-context-")
    await writeFile(
      join(globalConfigDir, "AGENTS.md"),
      "GLOBAL_CONTEXT_RULE",
      "utf8"
    )
    const alphaRoot = await repositoryWithContext(
      "ALPHA_CONTEXT_RULE",
      "alpha"
    )
    const betaRoot = await repositoryWithContext("BETA_CONTEXT_RULE", "beta")
    const provider = new CapturingProvider()
    const host = await environment.start(
      executionOptions(provider, {
        workerCount: 2,
        toolPermissionPolicy: new AllowAllToolsPolicy()
      }),
      { globalConfigDir }
    )

    try {
      const [alpha, beta] = await Promise.all([
        host.openRepository({ repositoryPath: alphaRoot }),
        host.openRepository({ repositoryPath: betaRoot })
      ])
      const [alphaTurn, betaTurn] = [
        alpha.startTurn({ idempotencyKey: "context-alpha", content: [{ type: "text", text: "alpha request" }] }),
        beta.startTurn({ idempotencyKey: "context-beta", content: [{ type: "text", text: "beta request" }] })
      ]
      const [alphaReceipt, betaReceipt] = await Promise.all([
        alphaTurn.result,
        betaTurn.result
      ])
      const alphaRequest = provider.requestFor("alpha request")
      const betaRequest = provider.requestFor("beta request")
      const alphaSystem = systemText(alphaRequest)
      const betaSystem = systemText(betaRequest)

      expect(alphaSystem.indexOf("GLOBAL_CONTEXT_RULE")).toBeLessThan(
        alphaSystem.indexOf("ALPHA_CONTEXT_RULE")
      )
      expect(betaSystem.indexOf("GLOBAL_CONTEXT_RULE")).toBeLessThan(
        betaSystem.indexOf("BETA_CONTEXT_RULE")
      )
      expect(alphaSystem).not.toContain("BETA_CONTEXT_RULE")
      expect(betaSystem).not.toContain("ALPHA_CONTEXT_RULE")
      for (const request of [alphaRequest, betaRequest]) {
        const serialized = JSON.stringify(request.messages)
        expect(serialized).not.toContain(alphaRoot)
        expect(serialized).not.toContain(betaRoot)
        expect(serialized).not.toContain(globalConfigDir)
      }

      for (const receipt of [alphaReceipt, betaReceipt]) {
        const turn = (
          await environment.storage.listSessionTurns({
            sessionId: receipt.reference.sessionId
          })
        ).find((candidate) => candidate.id === receipt.reference.turnId)
        expect(turn?.executionBinding.contextEvidence).toMatchObject({
          revision: 1,
          instructions: { state: "available", sourceCount: 2 },
          skills: { state: "available", sourceCount: 0 }
        })
        const durable = JSON.stringify(turn?.executionBinding)
        expect(durable).not.toContain("GLOBAL_CONTEXT_RULE")
        expect(durable).not.toContain("ALPHA_CONTEXT_RULE")
        expect(durable).not.toContain("BETA_CONTEXT_RULE")
        expect(durable).not.toContain(alphaRoot)
        expect(durable).not.toContain(betaRoot)
        expect(durable).not.toContain(globalConfigDir)
      }
    } finally {
      await host.close()
      await environment.dispose()
    }
  }, 30_000)

  it("keeps an admitted instruction snapshot stable and refreshes the next Turn", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await repositoryWithContext(
      "INSTRUCTION_VERSION_ONE",
      "instruction-refresh"
    )
    const provider = new FirstRequestBarrierProvider()
    const host = await environment.start(executionOptions(provider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))

    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const first = repository.startTurn({
        idempotencyKey: "context-instructions-first",
        content: [{ type: "text", text: "first instruction request" }]
      })
      await provider.firstRequestObserved
      await writeFile(
        join(repositoryRoot, "AGENTS.md"),
        "INSTRUCTION_VERSION_TWO",
        "utf8"
      )
      await commit(repositoryRoot, "update instructions")
      provider.releaseFirstRequest()
      const firstReceipt = await first.result

      const second = repository.startTurn({
        idempotencyKey: "context-instructions-second",
        sessionId: firstReceipt.reference.sessionId,
        content: [{ type: "text", text: "second instruction request" }]
      })
      await second.result

      expect(systemText(provider.requests[0]!)).toContain(
        "INSTRUCTION_VERSION_ONE"
      )
      expect(systemText(provider.requests[0]!)).not.toContain(
        "INSTRUCTION_VERSION_TWO"
      )
      expect(systemText(provider.requests[1]!)).toContain(
        "INSTRUCTION_VERSION_TWO"
      )
      expect(systemText(provider.requests[1]!)).not.toContain(
        "INSTRUCTION_VERSION_ONE"
      )
    } finally {
      await host.close()
      await environment.dispose()
    }
  }, 30_000)

  it("keeps Skill bodies lazy and activates the exact admitted worktree snapshot", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    await writeSkill(repositoryRoot, {
      description: "SKILL_DESCRIPTION_ONE",
      body: "SKILL_BODY_ONE"
    })
    await commit(repositoryRoot, "add project skill")
    const provider = new SkillActivationProbeProvider()
    const host = await environment.start(executionOptions(provider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))

    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const first = repository.startTurn({
        idempotencyKey: "context-skill-first",
        content: [{ type: "text", text: "activate first skill" }]
      })
      await provider.firstCatalogObserved
      const firstCatalog = systemText(provider.requests[0]!)
      expect(firstCatalog).toContain("SKILL_DESCRIPTION_ONE")
      expect(firstCatalog).not.toContain("SKILL_BODY_ONE")
      expect(firstCatalog).not.toContain(repositoryRoot)

      await writeSkill(repositoryRoot, {
        description: "SKILL_DESCRIPTION_TWO",
        body: "SKILL_BODY_TWO"
      })
      await commit(repositoryRoot, "update project skill")
      provider.releaseFirstCatalog()
      const firstReceipt = await first.result
      expect(provider.activationResults[0]).toContain("SKILL_BODY_ONE")
      expect(provider.activationResults[0]).not.toContain("SKILL_BODY_TWO")

      const second = repository.startTurn({
        idempotencyKey: "context-skill-second",
        sessionId: firstReceipt.reference.sessionId,
        content: [{ type: "text", text: "activate second skill" }]
      })
      await second.result
      const secondCatalog = systemText(provider.requests[2]!)
      expect(secondCatalog).toContain("SKILL_DESCRIPTION_TWO")
      expect(secondCatalog).not.toContain("SKILL_BODY_TWO")
      expect(provider.activationResults[1]).toContain("SKILL_BODY_TWO")

      const turns = await environment.storage.listSessionTurns({
        sessionId: firstReceipt.reference.sessionId
      })
      for (const turn of turns) {
        const durable = JSON.stringify(turn.executionBinding)
        expect(durable).not.toContain(repositoryRoot)
        expect(durable).not.toContain("SKILL_DESCRIPTION")
        expect(durable).not.toContain("SKILL_BODY")
      }
    } finally {
      await host.close()
      await environment.dispose()
    }
  }, 30_000)

  it("allows a trusted repository without optional context sources", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const provider = new CapturingProvider()
    const host = await environment.start(executionOptions(provider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))

    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const receipt = await repository.startTurn({
        idempotencyKey: "context-none",
        content: [{ type: "text", text: "no optional context" }]
      }).result
      expect(receipt.turnState).toBe("succeeded")
      expect(provider.requestFor("no optional context")).toBeDefined()
      const turn = (
        await environment.storage.listSessionTurns({
          sessionId: receipt.reference.sessionId
        })
      ).find((candidate) => candidate.id === receipt.reference.turnId)
      expect(turn?.executionBinding.contextEvidence).toMatchObject({
        revision: 1,
        instructions: { state: "available", sourceCount: 0 },
        skills: { state: "available", sourceCount: 0 }
      })
    } finally {
      await host.close()
      await environment.dispose()
    }
  }, 30_000)
})

class CapturingProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "coding-context-capture"
  readonly model = fakeModelDescriptor("coding-context-capture")
  readonly requests: ProviderRequest[] = []

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.requests.push(request)
    yield { type: "text_delta", partId: "context_done", delta: "done" }
    yield { type: "finish", reason: "stop" }
  }

  requestFor(text: string): ProviderRequest {
    const request = this.requests.find((candidate) => userText(candidate).includes(text))
    if (request === undefined) throw new Error(`Provider request not found: ${text}`)
    return request
  }

  buildReplayMessages(messages: readonly PreparedProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

class FirstRequestBarrierProvider extends CapturingProvider {
  readonly firstRequestObserved: Promise<void>
  readonly #observeFirst: () => void
  readonly #firstRelease: Promise<void>
  readonly #releaseFirst: () => void

  constructor() {
    super()
    let observeFirst!: () => void
    let releaseFirst!: () => void
    this.firstRequestObserved = new Promise((resolve) => {
      observeFirst = resolve
    })
    this.#firstRelease = new Promise((resolve) => {
      releaseFirst = resolve
    })
    this.#observeFirst = observeFirst
    this.#releaseFirst = releaseFirst
  }

  releaseFirstRequest(): void {
    this.#releaseFirst()
  }

  override async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const index = this.requests.length
    this.requests.push(request)
    if (index === 0) {
      this.#observeFirst()
      await this.#firstRelease
    }
    yield { type: "text_delta", partId: `context_done_${index}`, delta: "done" }
    yield { type: "finish", reason: "stop" }
  }
}

class SkillActivationProbeProvider extends CapturingProvider {
  readonly activationResults: string[] = []
  readonly firstCatalogObserved: Promise<void>
  readonly #observeFirst: () => void
  readonly #firstRelease: Promise<void>
  readonly #releaseFirst: () => void

  constructor() {
    super()
    let observeFirst!: () => void
    let releaseFirst!: () => void
    this.firstCatalogObserved = new Promise((resolve) => {
      observeFirst = resolve
    })
    this.#firstRelease = new Promise((resolve) => {
      releaseFirst = resolve
    })
    this.#observeFirst = observeFirst
    this.#releaseFirst = releaseFirst
  }

  releaseFirstCatalog(): void {
    this.#releaseFirst()
  }

  override async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const index = this.requests.length
    this.requests.push(request)
    if (index === 0) {
      this.#observeFirst()
      await this.#firstRelease
    }
    if (index % 2 === 0) {
      const toolCallId = `activate_skill_${index}`
      yield { type: "tool_call_start", index: 0, toolCallId }
      yield {
        type: "tool_call_delta",
        toolCallId,
        toolNameDelta: "activate_skill",
        inputJsonDelta: JSON.stringify({ name: "review" })
      }
      yield { type: "tool_call_end", toolCallId }
      yield { type: "finish", reason: "tool_calls" }
      return
    }
    this.activationResults.push(JSON.stringify(request.messages))
    yield { type: "text_delta", partId: `skill_done_${index}`, delta: "done" }
    yield { type: "finish", reason: "stop" }
  }
}

async function repositoryWithContext(rule: string, label: string): Promise<string> {
  const repositoryRoot = await scope.createRepository()
  await writeFile(join(repositoryRoot, "AGENTS.md"), rule, "utf8")
  await commit(repositoryRoot, `add ${label} instructions`)
  return repositoryRoot
}

async function writeSkill(
  repositoryRoot: string,
  options: { readonly description: string; readonly body: string }
): Promise<void> {
  const directory = join(repositoryRoot, ".agents", "skills", "review")
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, "SKILL.md"),
    [
      "---",
      'name: "review"',
      `description: ${JSON.stringify(options.description)}`,
      "---",
      "",
      options.body
    ].join("\n"),
    "utf8"
  )
}

async function commit(repositoryRoot: string, message: string): Promise<void> {
  await git(repositoryRoot, ["add", "--all"])
  await git(repositoryRoot, ["commit", "-m", message])
}

function systemText(request: ProviderRequest): string {
  return textFromMessages(request.messages.filter((message) => message.role === "system"))
}

function userText(request: ProviderRequest): string {
  return textFromMessages(request.messages.filter((message) => message.role === "user"))
}

function textFromMessages(messages: readonly PreparedProviderReplayMessage[]): string {
  return messages
    .flatMap((message) => message.content)
    .filter((part): part is Extract<typeof part, { readonly type: "text" }> =>
      part.type === "text"
    )
    .map((part) => part.text)
    .join("\n")
}
