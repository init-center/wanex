import {
  resolveAppExtensionContributions
} from "@wanex/extension"
import {
  backendBuiltinCommandContributions
} from "./contributions.js"
import {
  executeBackendCommand
} from "./executor.js"
import {
  explainBackendCommandContribution
} from "./explanation.js"
import {
  previewBackendCommandInvocation
} from "./preview.js"
import {
  projectBackendCommandRegistryReadModel
} from "./read-model.js"
import type {
  CreateBackendCommandRegistryOptions
} from "./runtime.js"
import type {
  BackendCommandRegistryCommands
} from "../model/index.js"

export {
  BACKEND_HANDLER_REFS
} from "./handlers.js"
export type {
  BackendHandlerRef
} from "./handlers.js"
export {
  backendBuiltinCommandContributions
} from "./contributions.js"
export type {
  CreateBackendCommandRegistryOptions,
  BackendCommandRegistryRuntimeCommands,
  BackendExtensionCommandExecutionRequest,
  BackendExtensionCommandExecutor,
  BackendExtensionCommandPreviewResult
} from "./runtime.js"

export function createBackendCommandRegistry(
  options: CreateBackendCommandRegistryOptions
): BackendCommandRegistryCommands {
  const builtins = backendBuiltinCommandContributions()
  type CapturedCatalog = {
    readonly revision: string | undefined
    readonly snapshot: ReturnType<typeof resolveAppExtensionContributions>
  }
  let cached: CapturedCatalog | undefined

  const capture = (): CapturedCatalog => {
    const generation = options.extensionCatalog?.current()
    const current = cached
    if (current !== undefined && current.revision === generation?.revision) {
      return current
    }
    const next: CapturedCatalog = {
      revision: generation?.revision,
      snapshot: resolveAppExtensionContributions([
        ...builtins,
        ...(generation?.snapshot.contributions ?? [])
      ])
    }
    cached = next
    return next
  }

  return {
    readProductCommands() {
      const generation = capture()
      return projectBackendCommandRegistryReadModel(
        generation.snapshot,
        generation.revision
      )
    },
    explainProductCommandContribution(request) {
      const generation = capture()
      return explainBackendCommandContribution(
        generation.snapshot,
        request,
        options.extensionCommandExecutor
      )
    },
    previewProductCommandInvocation(request) {
      const generation = capture()
      return previewBackendCommandInvocation(
        generation.snapshot,
        request,
        options.extensionCommandExecutor
      )
    },
    async executeProductCommand(request) {
      const generation = capture()
      return await executeBackendCommand(options, generation.snapshot, request)
    }
  }
}
