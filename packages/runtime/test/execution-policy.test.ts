import { describe, expect, it } from "vitest"
import type {
  ExecutionCapabilitySnapshot,
  ExecutionPolicySnapshot,
} from "@wanex/protocol"
import { assertExecutionPolicySupported } from "../src/execution/policy.js"

describe("execution policy capability matching", () => {
  it("accepts a policy that is covered by the provider snapshot", () => {
    expect(() =>
      assertExecutionPolicySupported(
        policy({ isolation: "os", network: "denied", pty: true }),
        capabilities({ isolation: "os", network: "os", pty: true }),
      ),
    ).not.toThrow()
  })

  it("requires OS enforcement for OS isolation and network denial", () => {
    expect(() =>
      assertExecutionPolicySupported(
        policy({ isolation: "os" }),
        capabilities({ isolation: "none" }),
      ),
    ).toThrowError("execution capability is unavailable: isolation.os")

    expect(() =>
      assertExecutionPolicySupported(
        policy({ network: "denied" }),
        capabilities({ network: "none" }),
      ),
    ).toThrowError("execution capability is unavailable: network.denied")
  })

  it("requires every requested filesystem effect", () => {
    expect(() =>
      assertExecutionPolicySupported(
        policy({ effects: ["read", "write"] }),
        capabilities({ effects: ["read"] }),
      ),
    ).toThrowError("execution capability is unavailable: filesystem.write")
  })

  it("requires managed process and durable cleanup evidence", () => {
    expect(() =>
      assertExecutionPolicySupported(
        policy({ process: { managed: true } }),
        capabilities({ managed: false }),
      ),
    ).toThrowError("execution capability is unavailable: process.managed")

    expect(() =>
      assertExecutionPolicySupported(
        policy({ process: { cleanup: "durable_supervisor" } }),
        capabilities({ cleanup: "runtime_process_tree" }),
      ),
    ).toThrowError(
      "execution capability is unavailable: process.durable_supervisor",
    )
  })
})

function policy(overrides: {
  readonly isolation?: ExecutionPolicySnapshot["isolation"]
  readonly network?: ExecutionPolicySnapshot["network"]
  readonly pty?: boolean
  readonly effects?: readonly ("read" | "write" | "create" | "remove")[]
  readonly process?: Partial<ExecutionPolicySnapshot["process"]>
} = {}): ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: [{ id: "workspace", effects: overrides.effects ?? ["read"] }],
      maxReadBytes: 1_024,
      maxDirectoryEntries: 100,
    },
    process: {
      oneShot: true,
      managed: false,
      cleanup: "runtime_process_tree",
      environmentVariables: [],
      ...overrides.process,
    },
    network: overrides.network ?? "unrestricted",
    isolation: overrides.isolation ?? "none",
    pty: overrides.pty ?? false,
  }
}

function capabilities(overrides: {
  readonly isolation?: ExecutionCapabilitySnapshot["isolation"]["enforcement"]
  readonly network?: ExecutionCapabilitySnapshot["network"]["enforcement"]
  readonly pty?: boolean
  readonly effects?: readonly ("read" | "write" | "create" | "remove")[]
  readonly managed?: boolean
  readonly cleanup?: ExecutionCapabilitySnapshot["process"]["cleanup"]
} = {}): ExecutionCapabilitySnapshot {
  return {
    revision: 1,
    isolation: { enforcement: overrides.isolation ?? "none" },
    filesystem: {
      enforcement: overrides.isolation === "os" ? "os" : "library_guard",
      effects: overrides.effects ?? ["read", "write", "create", "remove"],
    },
    process: {
      oneShot: true,
      managed: overrides.managed ?? true,
      cleanup: overrides.cleanup ?? "durable_supervisor",
    },
    pty: { supported: overrides.pty ?? false },
    network: { enforcement: overrides.network ?? "none" },
    secretProjection: { supported: false },
    artifactExport: { supported: false },
  }
}
