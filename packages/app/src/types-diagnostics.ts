import type {
  AppDiagnosticsSnapshot,
  SupportBundle
} from "@wanex/app/diagnostics"
import type { RuntimeHostDiagnosticsInput } from "@wanex/runtime/host"

export interface WanexAppShellDiagnosticsCommands {
  readDiagnostics(
    options?: WanexAppShellDiagnosticsOptions
  ): Promise<AppDiagnosticsSnapshot>
  buildSupportBundle(
    options?: WanexAppShellSupportBundleOptions
  ): Promise<SupportBundle>
}

export interface WanexAppShellDiagnosticsOptions {
  readonly now?: number
  readonly runtimeHost?: RuntimeHostDiagnosticsInput
}

export interface WanexAppShellSupportBundleOptions {
  readonly now?: number
  readonly eventLimit?: number
  readonly jobLimit?: number
  readonly runtimeHost?: RuntimeHostDiagnosticsInput
}
