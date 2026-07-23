import type {
  AppDiagnosticsSnapshot,
  SupportBundle
} from "./diagnostics/index.js"
import type { RuntimeHostDiagnosticsInput } from "@wanex/runtime/host"

export interface WanexAppDiagnosticsCommands {
  readDiagnostics(
    options?: WanexAppDiagnosticsOptions
  ): Promise<AppDiagnosticsSnapshot>
  buildSupportBundle(
    options?: WanexAppSupportBundleOptions
  ): Promise<SupportBundle>
}

export interface WanexAppDiagnosticsOptions {
  readonly now?: number
  readonly runtimeHost?: RuntimeHostDiagnosticsInput
}

export interface WanexAppSupportBundleOptions {
  readonly now?: number
  readonly eventLimit?: number
  readonly jobLimit?: number
  readonly runtimeHost?: RuntimeHostDiagnosticsInput
}
