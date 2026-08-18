import type { AppCommandInputSchema } from "./command-input-schema-types.js"

export interface AppInstructionContributionValue {
  readonly text: string
  readonly scope?: "global" | "project" | "session" | "agent"
  readonly target?: string
  readonly hash?: string
}

export interface AppSkillContributionValue {
  readonly name: string
  readonly description: string
  readonly sourceHash?: string
  readonly bodyHash?: string
  readonly byteLength?: number
  readonly source:
    | {
        readonly kind: "embedded"
        readonly body: string
      }
    | {
        readonly kind: "directory"
        readonly directory: string
        readonly entryPath: string
      }
    | {
        readonly kind: "remote"
        readonly url: string
        readonly digest?: string
      }
  readonly allowedTools?: readonly string[]
  readonly metadata?: Readonly<Record<string, string>>
}

export interface AppCommandContributionValue {
  readonly name: string
  readonly title: string
  readonly description?: string
  readonly aliases?: readonly string[]
  readonly category?: string
  readonly paletteVisibility: AppCommandPaletteVisibility
  readonly handlerRef: string
  readonly inputSchema?: AppCommandInputSchema
}

export type AppCommandPaletteVisibility = "visible" | "hidden"

export interface AppAgentContributionValue {
  readonly name: string
  readonly title?: string
  readonly description?: string
  readonly modelEndpointId?: string
  readonly modelId?: string
  readonly instructionRefs?: readonly string[]
  readonly skillRefs?: readonly string[]
  readonly toolRefs?: readonly string[]
}

export interface AppToolContributionValue {
  readonly name: string
  readonly description?: string
  readonly handlerRef: string
  readonly inputSchema?: unknown
  readonly permission?: "read" | "write" | "network" | "external"
}

export interface AppProviderCatalogContributionValue {
  readonly providerId: string
  readonly models?: readonly Readonly<{
    id: string
    displayName?: string
    modalities?: readonly string[]
    defaultReasoningMode?: string
  }>[]
  readonly defaults?: Readonly<{
    modelId?: string
    profileId?: string
  }>
}

export interface AppLifecycleHookContributionValue {
  readonly event:
    | "app.start"
    | "app.stop"
    | "session.start"
    | "session.stop"
    | "agent.before_run"
    | "agent.after_run"
  readonly handlerRef: string
}
