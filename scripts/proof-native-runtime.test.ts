import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  parseNativeRuntimeProofArgs,
  summarizeNativeRuntimeSamples,
  type NativeRuntimeProofSample
} from "./proof-native-runtime.js"

describe("native Runtime proof", () => {
  it("parses only the explicit proof arguments", () => {
    expect(parseNativeRuntimeProofArgs([])).toEqual({ samples: 1 })
    expect(parseNativeRuntimeProofArgs([
      "--",
      "--samples",
      "3",
      "--artifact-dir",
      "target/custom-native"
    ])).toEqual({
      samples: 3,
      artifactDir: resolve("target/custom-native")
    })
    expect(() => parseNativeRuntimeProofArgs(["--samples", "0"]))
      .toThrow("positive integer")
    expect(() => parseNativeRuntimeProofArgs(["--unknown"]))
      .toThrow("unknown native Runtime proof argument")
  })

  it("reports deterministic median and p95 samples", () => {
    const samples = [sample(30), sample(10), sample(20)]
    expect(summarizeNativeRuntimeSamples(samples)).toMatchObject({
      coldImport: {
        medianMs: 20,
        p95Ms: 30,
        samplesMs: [10, 20, 30]
      },
      createDispose: {
        medianMs: 46,
        p95Ms: 66,
        samplesMs: [26, 46, 66]
      },
      wallTime: {
        medianMs: 120,
        p95Ms: 130,
        samplesMs: [110, 120, 130]
      }
    })
    expect(() => summarizeNativeRuntimeSamples([])).toThrow("requires samples")
  })
})

function sample(value: number): NativeRuntimeProofSample {
  return {
    index: value,
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
