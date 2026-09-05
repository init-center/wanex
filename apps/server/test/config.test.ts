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

  it("normalizes one strict trusted Coding catalog", () => {
    const dataRoot = resolve("target/server-config-coding-test")
    const repositoryPath = resolve("target/server-config-coding-repository")
    const config = parseWanexServerConfig({
      dataRoot,
      listener: { hostname: "localhost" },
      coding: {
        execution: { kind: "native" },
        projects: [{ repositoryPath }]
      }
    })

    expect(config.coding).toEqual({
      execution: { kind: "native" },
      projects: [{ repositoryPath }]
    })
    expect(Object.isFrozen(config.coding)).toBe(true)
    expect(Object.isFrozen(config.coding!.execution)).toBe(true)
    expect(Object.isFrozen(config.coding!.projects)).toBe(true)
    expect(Object.isFrozen(config.coding!.projects[0])).toBe(true)
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
        dataRoot: resolve("target/server-config-coding-empty"),
        listener: { hostname: "localhost" },
        coding: { execution: { kind: "native" }, projects: [] }
      },
      "Server coding projects must contain 1 to 32 entries"
    ],
    [
      {
        dataRoot: resolve("target/server-config-coding-relative"),
        listener: { hostname: "localhost" },
        coding: {
          execution: { kind: "native" },
          projects: [{ repositoryPath: "relative-project" }]
        }
      },
      "Server coding project 0 repositoryPath must be absolute"
    ],
    [
      {
        dataRoot: resolve("target/server-config-coding-execution"),
        listener: { hostname: "localhost" },
        coding: {
          execution: { kind: "container" },
          projects: [{ repositoryPath: resolve("target/project") }]
        }
      },
      "Server coding execution kind must be native"
    ],
    [
      {
        dataRoot: resolve("target/server-config-coding-duplicate"),
        listener: { hostname: "localhost" },
        coding: {
          execution: { kind: "native" },
          projects: [
            { repositoryPath: resolve("target/project") },
            { repositoryPath: resolve("target/project") }
          ]
        }
      },
      "Server coding project repositoryPath is duplicated"
    ],
    [
      {
        dataRoot: resolve("target/server-config-coding-extra"),
        listener: { hostname: "localhost" },
        coding: {
          execution: { kind: "native" },
          projects: [{ repositoryPath: resolve("target/project") }],
          unsafePath: resolve("target/other")
        }
      },
      "Server coding field is not allowed: unsafePath"
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
