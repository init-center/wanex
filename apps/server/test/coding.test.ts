import { execFile } from "node:child_process"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import { startWanexServerInternal } from "../src/start.js"
import type { WanexServer } from "../src/model.js"
import {
  createTestCertificate,
  type TestCertificate
} from "./support/tls.js"

const execFileAsync = promisify(execFile)
const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const certificates: TestCertificate[] = []
const servers: WanexServer[] = []

afterEach(async () => {
  while (servers.length > 0) await servers.pop()?.close()
  while (certificates.length > 0) await certificates.pop()?.close()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Wanex Server Coding composition", () => {
  it("opens configured repositories over the borrowed Store without exposing paths", async () => {
    const dataRoot = await createTempDir("wanex-server-coding-data-")
    const repositoryPath = await createRepository()
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    const server = await startWanexServerInternal({
      config: {
        dataRoot,
        profileId: "coding",
        listener: { hostname: "127.0.0.1", port: 0 },
        coding: {
          execution: { kind: "native" },
          projects: [{ repositoryPath }]
        }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore: new MemorySecretStore(),
      modelEndpoints: {
        endpoints: [fakeEndpoint()],
        activeEndpointId: "server-coding-model"
      }
    })
    servers.push(server)

    expect(server.readStatus()).toMatchObject({
      state: "open",
      assistant: "ready",
      coding: "ready",
      listener: "ready"
    })
    const projects = await server.codingHost!.application.listProjects()
    expect(projects).toEqual([
      expect.objectContaining({
        projectId: expect.stringMatching(/^repo_[a-f0-9]{40}$/),
        name: basename(repositoryPath),
        state: "ready"
      })
    ])
    const publicState = JSON.stringify({
      status: server.readStatus(),
      projects
    })
    expect(publicState).not.toContain(repositoryPath)
    expect(publicState).not.toContain(dataRoot)

    await server.close()
    servers.pop()
    expect(server.readStatus()).toMatchObject({
      state: "closed",
      coding: "closed"
    })
  })

  it("rejects configured paths that resolve to one canonical repository", async () => {
    const dataRoot = await createTempDir("wanex-server-coding-duplicate-data-")
    const repositoryPath = await createRepository()
    const nestedPath = join(repositoryPath, "nested")
    await mkdir(nestedPath)
    const certificate = await createTestCertificate()
    certificates.push(certificate)

    await expect(startWanexServerInternal({
      config: {
        dataRoot,
        listener: { hostname: "127.0.0.1", port: 0 },
        coding: {
          execution: { kind: "native" },
          projects: [
            { repositoryPath },
            { repositoryPath: nestedPath }
          ]
        }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore: new MemorySecretStore(),
      modelEndpoints: {
        endpoints: [fakeEndpoint()],
        activeEndpointId: "server-coding-model"
      }
    })).rejects.toThrow(
      "Server coding projects resolve to the same canonical repository"
    )
  })
})

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function createRepository(): Promise<string> {
  const repositoryPath = await createTempDir("wanex-server-coding-repository-")
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath])
  await writeFile(join(repositoryPath, "README.md"), "# Server Coding Test\n")
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"])
  await execFileAsync("git", [
    "-c",
    "user.name=Wanex Test",
    "-c",
    "user.email=wanex@example.test",
    "-C",
    repositoryPath,
    "commit",
    "-m",
    "initial"
  ])
  return repositoryPath
}

function fakeEndpoint() {
  return {
    id: "server-coding-model",
    connection: { id: "server-coding-model", providerId: "fake" },
    protocol: { id: "fake" as const },
    model: {
      id: "server-coding-model",
      operations: ["conversation" as const],
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      features: ["tool_calling" as const],
      catalog: {
        source: "custom" as const,
        catalogId: "wanex.server.coding.test",
        revision: "1"
      }
    }
  }
}

class TestAuthentication {
  async authenticateBearerToken(token: string) {
    return token === "server-coding-token"
      ? { subjectId: "server-coding-subject", expiresAt: Date.now() + 60_000 }
      : null
  }
}

class MemorySecretStore implements SecretStorePort {
  readonly scheme = "test-secret"
  readonly #values = new Map<string, string>()

  async put(request: { readonly ref: string; readonly value: string }): Promise<void> {
    this.#values.set(request.ref, request.value)
  }

  async delete(ref: string): Promise<void> {
    this.#values.delete(ref)
  }

  async resolve(
    ref: string,
    _context?: SecretResolveContext
  ): Promise<InMemoryResolvedSecret> {
    const value = this.#values.get(ref)
    if (value === undefined) throw new Error("test secret is not configured")
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value })
  }
}
