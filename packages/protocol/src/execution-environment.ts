export type ExecutionFileEffect = "read" | "write" | "create" | "remove"

export interface ExecutionFileSystemPolicy {
  readonly roots: readonly {
    readonly id: string
    readonly effects: readonly ExecutionFileEffect[]
  }[]
  readonly maxReadBytes: number
  readonly maxDirectoryEntries: number
}

export interface ExecutionProcessPolicy {
  readonly oneShot: boolean
  readonly managed: boolean
  readonly cleanup: "runtime_process_tree" | "durable_supervisor"
  readonly environmentVariables: readonly string[]
}

export interface ExecutionPolicySnapshot {
  readonly revision: 1
  readonly filesystem: ExecutionFileSystemPolicy
  readonly process: ExecutionProcessPolicy
  readonly network: "unrestricted" | "denied"
  readonly isolation: "none" | "os"
  readonly pty: boolean
}

export interface ExecutionCapabilitySnapshot {
  readonly revision: 1
  readonly isolation: { readonly enforcement: "none" | "os" }
  readonly filesystem: {
    readonly enforcement: "library_guard" | "os"
    readonly effects: readonly ExecutionFileEffect[]
  }
  readonly process: {
    readonly oneShot: true
    readonly managed: boolean
    readonly cleanup: "runtime_process_tree" | "durable_supervisor"
  }
  readonly pty: { readonly supported: boolean }
  readonly network: { readonly enforcement: "none" | "os" }
  readonly secretProjection: { readonly supported: boolean }
  readonly artifactExport: { readonly supported: boolean }
}

export interface ExecutionEnvironmentDescriptor {
  readonly revision: 1
  readonly environmentId: string
  readonly providerId: string
  readonly providerRevision: string
  readonly kind: string
}

export interface ExecutionEnvironmentBinding {
  readonly revision: 1
  readonly environmentId: string
  readonly providerId: string
  readonly providerRevision: string
  readonly capabilities: ExecutionCapabilitySnapshot
  readonly capabilityDigest: string
  readonly policy: ExecutionPolicySnapshot
  readonly policyDigest: string
}
