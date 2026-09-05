import { join } from "node:path"
import type { AssistantHost } from "@wanex/assistant-host"
import {
  startCodingApplication,
  type CodingApplicationHost
} from "@wanex/coding/host"
import type { SecretResolverPort } from "@wanex/runtime/secrets"
import {
  createToolRuntimeBinding,
  type ToolPermissionDecision,
  type ToolPermissionPolicy,
  type ToolPermissionRequest
} from "@wanex/runtime/tools"
import type { StorageHandle } from "@wanex/storage"
import { ExactWorkspaceProgramPolicy } from "@wanex/workspace/tools"
import type { WanexServerCodingConfig } from "./config.js"

const SERVER_CODING_DATA_DIRECTORY = "coding"

export async function startWanexServerCoding(options: {
  readonly profileStoreDir: string
  readonly storage: Pick<StorageHandle, "core" | "transport">
  readonly serviceBin: string
  readonly config: WanexServerCodingConfig
  readonly secretResolver: SecretResolverPort
  readonly modelEndpoints: AssistantHost["modelEndpoints"]
}): Promise<CodingApplicationHost> {
  const host = await startCodingApplication({
    dataDir: join(options.profileStoreDir, SERVER_CODING_DATA_DIRECTORY),
    storage: {
      kind: "injected",
      handle: options.storage
    },
    artifacts: { explicitPath: options.serviceBin },
    execution: {
      toolPermissionPolicy: new ServerCodingToolPermissionPolicy(),
      programPolicy: new ExactWorkspaceProgramPolicy({
        git: "git",
        node: process.execPath
      }),
      secretResolver: options.secretResolver,
      workerCount: 2,
      resolveModelEndpointId: async () =>
        (await options.modelEndpoints.readActiveModelEndpoint())?.id
    }
  })

  try {
    const openedProjectIds = new Set<string>()
    for (const project of options.config.projects) {
      const opened = await host.openProject({
        repositoryPath: project.repositoryPath
      })
      if (openedProjectIds.has(opened.projectId)) {
        throw new Error(
          "Server coding projects resolve to the same canonical repository"
        )
      }
      openedProjectIds.add(opened.projectId)
    }
    return host
  } catch (error) {
    await host.close().catch(() => {})
    throw error
  }
}

class ServerCodingToolPermissionPolicy implements ToolPermissionPolicy {
  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.server.coding.tool-policy",
      implementationRevision: "1",
      configuration: {
        readOnly: "allow",
        mutating: "approval_required",
        external: "deny"
      }
    })
  }

  async authorize(
    request: ToolPermissionRequest
  ): Promise<ToolPermissionDecision> {
    if (request.descriptor.risk === "read_only") {
      return { status: "allow", reason: "server_coding_read_only_tool" }
    }
    if (request.descriptor.risk === "mutating") {
      return {
        status: "approval_required",
        reason: "server_coding_mutation_requires_review",
        presentation: { summary: `Review ${request.descriptor.name}` }
      }
    }
    return { status: "deny", reason: "server_coding_external_tool_denied" }
  }
}
