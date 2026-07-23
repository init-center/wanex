import { inspect } from "node:util"
import { describe, expect, it } from "vitest"
import {
  EnvSecretProvider,
  InMemoryResolvedSecret,
  SecretResolver,
  StaticSecretProvider,
  envNameFromRef,
  schemeFromRef
} from "../src/secrets/index.js"

describe("Runtime secrets", () => {
  it("routes secret refs by URI scheme", async () => {
    const resolver = new SecretResolver([
      new StaticSecretProvider({
        values: {
          "static://telegram/bot": "secret-token"
        }
      })
    ])

    const secret = await resolver.resolve("static://telegram/bot", {
      connectorId: "connector.telegram",
      credentialId: "conncred_telegram"
    })

    expect(secret.ref).toBe("static://telegram/bot")
    expect(secret.provider).toBe("static")
    expect(secret.reveal()).toBe("secret-token")
  })

  it("fails closed for unknown or malformed schemes", async () => {
    const resolver = new SecretResolver()

    await expect(resolver.resolve("vault://secret/path")).rejects.toThrow(
      /no secret provider/
    )
    expect(() => schemeFromRef("missing-scheme")).toThrow(/URI scheme/)
    expect(() => new SecretResolver().register({
      scheme: "",
      resolve() {
        throw new Error("unused")
      }
    })).toThrow(/invalid secret provider scheme/)
  })

  it("resolves env refs without reading process env in tests", async () => {
    const resolver = new SecretResolver([
      new EnvSecretProvider({
        TELEGRAM_BOT_TOKEN: "env-secret"
      })
    ])

    await expect(resolver.resolve("env://TELEGRAM_BOT_TOKEN")).resolves.toMatchObject({
      ref: "env://TELEGRAM_BOT_TOKEN",
      provider: "env"
    })
    const secret = await resolver.resolve("env:TELEGRAM_BOT_TOKEN")
    expect(secret.reveal()).toBe("env-secret")
    expect(envNameFromRef("env:///TELEGRAM_BOT_TOKEN")).toBe(
      "TELEGRAM_BOT_TOKEN"
    )
  })

  it("prevents accidental serialization and inspection leaks", () => {
    const secret = new InMemoryResolvedSecret({
      ref: "static://safe",
      provider: "static",
      value: "never-print-me"
    })

    expect(() => JSON.stringify({ secret })).toThrow(/cannot be JSON serialized/)
    expect(String(secret)).not.toContain("never-print-me")
    expect(inspect(secret)).not.toContain("never-print-me")
    expect(String(secret)).toContain("static://safe")
  })

  it("requires explicit reveal and supports disposal", () => {
    const secret = new InMemoryResolvedSecret({
      ref: "static://dispose",
      provider: "static",
      value: "short-lived"
    })

    expect(secret.disposed).toBe(false)
    expect(secret.reveal()).toBe("short-lived")
    secret.dispose()
    expect(secret.disposed).toBe(true)
    expect(() => secret.reveal()).toThrow(/disposed/)
  })
})
