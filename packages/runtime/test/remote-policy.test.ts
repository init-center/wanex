import { describe, expect, it } from "vitest"
import {
  authorizeRemoteHostDomain,
  authorizeRemoteHostRequest,
  normalizeRemoteHostRequestLimits
} from "../src/host/index.js"

const baseRequest = {
  subject: { subjectId: "subject_1", expiresAt: 2_000 },
  grant: {
    subjectId: "subject_1",
    hostId: "host_1",
    domains: ["assistant", "coding"] as const,
    expiresAt: 1_500
  },
  host: {
    hostId: "host_1",
    instanceId: "instance_1",
    connectionKind: "remote_tls" as const,
    executionLocation: "remote" as const
  },
  clientId: "client_1",
  requestedDomains: ["assistant"] as const,
  nowMs: 1_000
}

describe("remote Host authorization policy", () => {
  it("allows a server-resolved subject and returns the intersection context", () => {
    expect(authorizeRemoteHostRequest(baseRequest)).toEqual({
      outcome: "allowed",
      context: {
        subjectId: "subject_1",
        hostId: "host_1",
        clientId: "client_1",
        grantedDomains: ["assistant"],
        expiresAt: 1_500
      }
    })
  })

  it("rejects expired subject credentials before using a grant", () => {
    expect(
      authorizeRemoteHostRequest({
        ...baseRequest,
        subject: { ...baseRequest.subject, expiresAt: 1_000 }
      })
    ).toEqual({ outcome: "denied", code: "unauthenticated", retryable: false })
  })

  it("rejects expired grants", () => {
    expect(
      authorizeRemoteHostRequest({
        ...baseRequest,
        grant: { ...baseRequest.grant, expiresAt: 1_000 }
      })
    ).toEqual({ outcome: "denied", code: "unauthorized", retryable: false })
  })

  it("rejects a grant belonging to another subject", () => {
    expect(
      authorizeRemoteHostRequest({
        ...baseRequest,
        grant: { ...baseRequest.grant, subjectId: "subject_2" }
      })
    ).toEqual({ outcome: "denied", code: "unauthorized", retryable: false })
  })

  it("rejects a grant for another host", () => {
    expect(
      authorizeRemoteHostRequest({
        ...baseRequest,
        grant: { ...baseRequest.grant, hostId: "host_2" }
      })
    ).toEqual({ outcome: "denied", code: "unauthorized", retryable: false })
  })

  it("rejects domains outside the server-resolved grant", () => {
    expect(
      authorizeRemoteHostRequest({
        ...baseRequest,
        requestedDomains: ["coding"]
      })
    ).toEqual({ outcome: "allowed", context: expect.objectContaining({ grantedDomains: ["coding"] }) })
    expect(
      authorizeRemoteHostRequest({
        ...baseRequest,
        grant: { ...baseRequest.grant, domains: ["assistant"] },
        requestedDomains: ["coding"]
      })
    ).toEqual({ outcome: "denied", code: "unauthorized", retryable: false })
  })

  it("does not authorize local transports through the remote policy", () => {
    expect(
      authorizeRemoteHostRequest({
        ...baseRequest,
        host: { ...baseRequest.host, connectionKind: "local_ipc" }
      })
    ).toEqual({ outcome: "denied", code: "unauthorized", retryable: false })
  })

  it("rejects malformed identifiers and duplicate domain grants", () => {
    expect(
      authorizeRemoteHostRequest({
        ...baseRequest,
        clientId: "client with spaces"
      })
    ).toEqual({ outcome: "denied", code: "unauthorized", retryable: false })
    expect(
      authorizeRemoteHostRequest({
        ...baseRequest,
        grant: { ...baseRequest.grant, domains: ["assistant", "assistant"] }
      })
    ).toEqual({ outcome: "denied", code: "unauthorized", retryable: false })
  })

  it("rechecks expiry and domain scope for every established connection request", () => {
    const decision = authorizeRemoteHostRequest(baseRequest)
    if (decision.outcome !== "allowed") throw new Error("fixture was denied")
    expect(authorizeRemoteHostDomain(decision.context, "assistant", 1_200)).toEqual({
      outcome: "allowed",
      context: decision.context
    })
    expect(authorizeRemoteHostDomain(decision.context, "coding", 1_200)).toEqual({
      outcome: "denied",
      code: "unauthorized",
      retryable: false
    })
    expect(authorizeRemoteHostDomain(decision.context, "assistant", 1_500)).toEqual({
      outcome: "denied",
      code: "unauthenticated",
      retryable: false
    })
  })
})

describe("remote Host request limits", () => {
  it("provides bounded defaults", () => {
    expect(normalizeRemoteHostRequestLimits()).toEqual({
      maxBodyBytes: 4 * 1024 * 1024,
      maxResponseBytes: 4 * 1024 * 1024,
      maxSessions: 128,
      maxInFlightRequests: 32,
      maxEventSubscribers: 1,
      requestTimeoutMs: 30_000
    })
  })

  it("accepts bounded overrides and rejects unbounded values", () => {
    expect(
      normalizeRemoteHostRequestLimits({
        maxBodyBytes: 1024,
        maxResponseBytes: 2048,
        maxSessions: 4,
        maxInFlightRequests: 8,
        maxEventSubscribers: 2,
        requestTimeoutMs: 5_000
      })
    ).toEqual({
      maxBodyBytes: 1024,
      maxResponseBytes: 2048,
      maxSessions: 4,
      maxInFlightRequests: 8,
      maxEventSubscribers: 2,
      requestTimeoutMs: 5_000
    })
    expect(() =>
      normalizeRemoteHostRequestLimits({ maxBodyBytes: 16 * 1024 * 1024 + 1 })
    ).toThrow()
    expect(() =>
      normalizeRemoteHostRequestLimits({ requestTimeoutMs: 120_001 })
    ).toThrow()
  })
})
