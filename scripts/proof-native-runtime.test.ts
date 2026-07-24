import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  measureNativeRuntimeSample,
  parseNativeRuntimeProofArgs,
  summarizeNativeRuntimeSamples,
  type NativeRuntimeProofSample
} from "./proof-native-runtime.js"

describe("native Runtime proof", () => {
  it("parses only the explicit proof arguments", () => {
    expect(parseNativeRuntimeProofArgs([])).toEqual({})
    expect(parseNativeRuntimeProofArgs([
      "--",
      "--artifact-dir",
      "target/custom-native"
    ])).toEqual({
      artifactDir: resolve("target/custom-native")
    })
    expect(() => parseNativeRuntimeProofArgs(["--samples", "5"]))
      .toThrow("unknown native Runtime proof argument")
    expect(() => parseNativeRuntimeProofArgs(["--unknown"]))
      .toThrow("unknown native Runtime proof argument")
  })

  it("reports deterministic median and maximum samples", () => {
    const samples = [sample(0, 30), sample(1, 10), sample(2, 20)]
    expect(summarizeNativeRuntimeSamples(samples)).toMatchObject({
      coldImport: {
        medianMs: 20,
        maximumMs: 30,
        samplesMs: [10, 20, 30]
      },
      createDispose: {
        medianMs: 46,
        maximumMs: 66,
        samplesMs: [26, 46, 66]
      },
      wallTime: {
        medianMs: 120,
        maximumMs: 130,
        samplesMs: [110, 120, 130]
      }
    })
    expect(() => summarizeNativeRuntimeSamples([])).toThrow("requires samples")
    expect(() => summarizeNativeRuntimeSamples([
      sample(1, 10)
    ])).toThrow("sample 0 has an invalid index")
    expect(() => summarizeNativeRuntimeSamples([
      { ...sample(0, 10), temperature: "warm" as "cold" }
    ])).toThrow("sample 0 must be cold")
  })

  it("excludes the process audit from sample wall time without weakening it", async () => {
    let clock = 100
    let audited = false
    const measured = await measureNativeRuntimeSample(
      async () => {
        clock = 140
        return "completed"
      },
      async () => {
        audited = true
        clock = 10_000
      },
      () => clock
    )

    expect(measured).toEqual({
      sample: "completed",
      wallTimeMs: 40
    })
    expect(audited).toBe(true)

    await expect(measureNativeRuntimeSample(
      async () => "completed",
      async () => {
        throw new Error("owned process remains")
      }
    )).rejects.toThrow("owned process remains")
  })
})

function sample(index: number, value: number): NativeRuntimeProofSample {
  return {
    index,
    temperature: "cold",
    targetId: "darwin-arm64",
    state: "succeeded",
    assistantText: "complete",
    messageCount: 2,
    wallTimeMs: value + 100,
    timingsMs: {
      coldImport: value,
      artifactVerification: value + 1,
      create: value + 2,
      turn: value + 3,
      dispose: value + 4,
      total: value + 5
    }
  }
}
