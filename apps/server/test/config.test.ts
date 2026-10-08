import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { parseWanexServerConfig } from "../src/index.js"

describe("Wanex Server config", () => {
  it("normalizes one exact local profile", () => {
    const dataRoot = resolve("target/server-config-test")
    const config = parseWanexServerConfig({
      dataRoot,
      profileId: "work-host",
      hostId: "workstation:primary",
      listener: { hostname: "127.0.0.1", port: 9443 }
    })

    expect(config).toEqual({
      dataRoot,
      profileId: "work-host",
      hostId: "workstation:primary",
      listener: { hostname: "127.0.0.1", port: 9443 }
    })
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.listener)).toBe(true)
  })

  it("uses canonical profile, host, and port defaults", () => {
    const dataRoot = resolve("target/server-config-default-test")
    expect(parseWanexServerConfig({
      dataRoot,
      listener: { hostname: "localhost" }
    })).toEqual({
      dataRoot,
      profileId: "default",
      hostId: "wanex-server:default",
      listener: { hostname: "localhost", port: 8443 }
    })
  })

  it("accepts only Host-local absolute isolation directory configuration", () => {
    const base = { dataRoot: resolve("target/server-config-workspace"), listener: { hostname: "localhost" } }
    const worktreeDirectory = resolve("target/server-worktrees")
    expect(parseWanexServerConfig({ ...base, workspace: { worktreeDirectory } }).workspace).toMatchObject({ worktreeDirectory })
    for (const path of ["relative", "invalid\0path"]) {
      expect(() => parseWanexServerConfig({ ...base, workspace: { worktreeDirectory: path } })).toThrow()
    }
  })

  it.each([
    [null, "Server config must be an object"],
    [{ dataRoot: "relative" }, "Server dataRoot must be absolute"],
    [
      {
        dataRoot: resolve("target/server-config-invalid"),
        profileId: "../other",
        listener: { hostname: "localhost" }
      },
      "local store profile id must start"
    ],
    [
      {
        dataRoot: resolve("target/server-config-reserved"),
        profileId: "CON",
        listener: { hostname: "localhost" }
      },
      "local store profile id is reserved"
    ],
    [
      { dataRoot: resolve("target/server-config-extra"), endpoint: "ignored" },
      "Server config field is not allowed: endpoint"
    ],
    [
      { dataRoot: resolve("target/server-config-listener-missing") },
      "Server listener must be an object"
    ],
    [
      {
        dataRoot: resolve("target/server-config-host-id"),
        hostId: "not a host",
        listener: { hostname: "localhost" }
      },
      "Server hostId must be a valid opaque identifier"
    ],
    [
      {
        dataRoot: resolve("target/server-config-hostname"),
        listener: { hostname: " https://example.test " }
      },
      "Server listener hostname is invalid"
    ],
    [
      {
        dataRoot: resolve("target/server-config-port"),
        listener: { hostname: "localhost", port: 65_536 }
      },
      "Server listener port must be between 0 and 65535"
    ],
    [
      {
        dataRoot: resolve("target/server-config-listener-extra"),
        listener: { hostname: "localhost", kind: "http" }
      },
      "Server listener field is not allowed: kind"
    ]
  ])("rejects invalid config %#", (value, message) => {
    expect(() => parseWanexServerConfig(value)).toThrow(message)
  })
})
