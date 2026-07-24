import type { NativeRuntimeProofSample } from "./proof-native-runtime.js"

export const NATIVE_RELEASE_SAMPLE_COUNT: 5

export interface NativeRuntimeMetricSummary {
  readonly medianMs: number
  readonly maximumMs: number
  readonly samplesMs: readonly number[]
}

export type NativeRuntimeProofSummary = Readonly<Record<
  | "coldImport"
  | "artifactVerification"
  | "create"
  | "createDispose"
  | "turn"
  | "dispose"
  | "total"
  | "wallTime",
  NativeRuntimeMetricSummary
>>

export function summarizeNativeRuntimeSamples(
  samples: readonly NativeRuntimeProofSample[]
): NativeRuntimeProofSummary
