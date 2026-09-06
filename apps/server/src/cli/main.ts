#!/usr/bin/env node
import { access, readFile } from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseWanexServerProcessConfig } from "./config.js"
import { startWanexServer } from "../start.js"
import type { WanexServerAuthentication } from "../model.js"
import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"

export async function main(
  args: readonly string[],
  environment: NodeJS.ProcessEnv
): Promise<void> {
  const configPath = parseArgs(args)
  const parsed = parseWanexServerProcessConfig(
    JSON.parse(await readFile(configPath, "utf8"))
  )
  const token = requireEnvironment(environment, "WANEX_SERVER_BEARER_TOKEN")
  const serviceBin = environment.WANEX_SYSTEM_SERVICE_BIN?.trim() || undefined
  const packagedArtifacts = await resolvePackagedArtifacts()
  const server = await startWanexServer({
    config: parsed.server,
    tls: {
      key: await readFile(parsed.tls.keyFile),
      cert: await readFile(parsed.tls.certFile)
    },
    ...(serviceBin === undefined ? {} : { serviceBin }),
    ...(packagedArtifacts === undefined ? {} : { artifacts: packagedArtifacts }),
    credentialStore: new EnvironmentSecretStore(environment),
    authentication: bearerAuthentication(token)
  })
  process.stdout.write(`${JSON.stringify({
    kind: "wanex.server.ready",
    endpoint: server.endpoint,
    status: server.readStatus()
  })}\n`)

  await waitForShutdown(server)
}

async function resolvePackagedArtifacts(): Promise<{
  readonly artifactDir: string
  readonly manifest: unknown
} | undefined> {
  const artifactDir = join(dirname(fileURLToPath(import.meta.url)), "native")
  const manifestPath = join(artifactDir, "runtime-artifacts.json")
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    await access(artifactDir)
    return { artifactDir, manifest }
  } catch {
    return undefined
  }
}

function parseArgs(args: readonly string[]): string {
  const normalized = args.filter((arg) => arg !== "--")
  if (normalized.length !== 2 || normalized[0] !== "--config") {
    throw new Error("usage: wanex-server --config /absolute/path/server.json")
  }
  const path = normalized[1]?.trim()
  if (path === undefined || path.length === 0 || !isAbsolute(path)) {
    throw new Error("Wanex Server --config path must be absolute")
  }
  return path
}

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim()
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`)
  }
  return value
}

function bearerAuthentication(token: string): WanexServerAuthentication {
  return {
    async authenticateBearerToken(candidate) {
      return candidate === token
        ? { subjectId: "server-process-subject", expiresAt: Date.now() + 60_000 }
        : null
    }
  }
}

async function waitForShutdown(server: { close(): Promise<void> }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let closed = false
    const close = (): void => {
      if (closed) return
      closed = true
      process.off("SIGINT", close)
      process.off("SIGTERM", close)
      if (typeof process.send === "function") process.off("message", onMessage)
      void server.close().then(() => {
        if (typeof process.disconnect === "function" && process.connected) {
          process.disconnect()
        }
        resolve()
      }, reject)
    }
    const onMessage = (message: unknown): void => {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { kind?: unknown }).kind === "wanex.server.shutdown"
      ) {
        close()
      }
    }
    process.once("SIGINT", close)
    process.once("SIGTERM", close)
    if (typeof process.send === "function") process.on("message", onMessage)
  })
}

class EnvironmentSecretStore implements SecretStorePort {
  readonly scheme = "env"

  constructor(private readonly environment: NodeJS.ProcessEnv) {}

  async put(): Promise<void> {
    throw new Error("Wanex Server process SecretStore is read-only")
  }

  async delete(): Promise<void> {
    throw new Error("Wanex Server process SecretStore is read-only")
  }

  async resolve(ref: string, _context?: SecretResolveContext): Promise<InMemoryResolvedSecret> {
    const prefix = "env://"
    if (!ref.startsWith(prefix)) throw new Error("Server process secret must use env://")
    const name = ref.slice(prefix.length)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) throw new Error("Server process secret name is invalid")
    const value = this.environment[name]
    if (value === undefined || value.length === 0) throw new Error(`Server process secret is unavailable: ${name}`)
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value })
  }
}

if (import.meta.main) {
  await main(process.argv.slice(2), process.env)
}
