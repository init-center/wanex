import { describe, expect, it } from "vitest"
import {
  createServerDistributionProofReceipt,
  parseArgs
} from "./prove-server-distribution.mjs"

describe("Server distribution proof", () => {
  it("parses target selection and resolves the output path", () => {
    expect(parseArgs([
      "--",
      "--target",
      "win32-x64",
      "--output",
      "target/proof.json"
    ])).toEqual({
      targetId: "win32-x64",
      outputPath: expect.stringMatching(/target[\\/]proof\.json$/)
    })
  })

  it("defaults target selection to the current host", () => {
    expect(parseArgs([])).toEqual({
      targetId: `${process.platform}-${process.arch}`
    })
  })

  it("rejects unknown and incomplete arguments", () => {
    expect(() => parseArgs(["--unknown"])).toThrow(
      "unknown Server distribution proof argument"
    )
    expect(() => parseArgs(["--target"])).toThrow(
      "--target requires a value"
    )
    expect(() => parseArgs(["--output"])).toThrow(
      "--output requires a value"
    )
  })

  it("creates a complete receipt from proven facts only", () => {
    const receipt = createServerDistributionProofReceipt({
      targetId: "darwin-arm64",
      artifact: { bytes: 1234, files: ["server.mjs", "native/service"] },
      ready: { status: { state: "open", listener: "ready" } },
      shutdownExitCode: 0,
      totalMs: 2100
    })

    expect(receipt).toEqual({
      kind: "wanex.server-distribution.proof-receipt",
      ok: true,
      targetId: "darwin-arm64",
      artifact: { bytes: 1234, fileCount: 2 },
      server: {
        status: { state: "open", listener: "ready" },
        invalidBearerRejected: true,
        handshakeAccepted: true,
        codingProjectListAccepted: true,
        shutdownExitCode: 0
      },
      timingsMs: { total: 2100 },
      noCredentialsRetained: true,
      noOwnedProcessAfterRun: true
    })
  })

  it("rejects incomplete artifact, readiness, timing, and shutdown evidence", () => {
    const base = {
      targetId: "darwin-arm64",
      artifact: { bytes: 1234, files: ["server.mjs"] },
      ready: { status: { state: "open", listener: "ready" } },
      shutdownExitCode: 0,
      totalMs: 1
    }
    expect(() => createServerDistributionProofReceipt({
      ...base,
      artifact: { bytes: 1234 }
    })).toThrow("artifact is invalid")
    expect(() => createServerDistributionProofReceipt({
      ...base,
      ready: undefined
    })).toThrow("readiness is invalid")
    expect(() => createServerDistributionProofReceipt({
      ...base,
      totalMs: -1
    })).toThrow("timing is invalid")
    expect(() => createServerDistributionProofReceipt({
      ...base,
      shutdownExitCode: 1
    })).toThrow("shutdown is invalid")
  })
})
