import {
  resolveAppExtensionContributions
} from "@wanex/extension"
import {
  productAppBackendBuiltinCommandContributions
} from "./product-command-contributions.js"
import {
  executeProductAppBackendCommand
} from "./product-command-executor.js"
import {
  explainProductAppBackendCommandContribution
} from "./product-command-explanation.js"
import {
  previewProductAppBackendCommandInvocation
} from "./product-command-preview.js"
import {
  projectProductAppBackendCommandRegistryReadModel
} from "./product-command-read-model.js"
import type {
  CreateProductAppBackendCommandRegistryOptions
} from "./product-command-runtime.js"
import type {
  ProductAppBackendCommandRegistryCommands
} from "./types.js"

export {
  PRODUCT_APP_BACKEND_HANDLER_REFS
} from "./product-command-handler-refs.js"
export type {
  ProductAppBackendHandlerRef
} from "./product-command-handler-refs.js"
export {
  productAppBackendBuiltinCommandContributions
} from "./product-command-contributions.js"
export type {
  CreateProductAppBackendCommandRegistryOptions,
  ProductAppBackendCommandRegistryRuntimeCommands,
  ProductAppBackendExtensionCommandExecutionRequest,
  ProductAppBackendExtensionCommandExecutor,
  ProductAppBackendExtensionCommandPreviewResult
} from "./product-command-runtime.js"

export function createProductAppBackendCommandRegistry(
  options: CreateProductAppBackendCommandRegistryOptions
): ProductAppBackendCommandRegistryCommands {
  const snapshot = resolveAppExtensionContributions([
    ...productAppBackendBuiltinCommandContributions(),
    ...(options.extensionSnapshot?.contributions ?? [])
  ])

  return {
    readProductCommands() {
      return projectProductAppBackendCommandRegistryReadModel(snapshot)
    },
    explainProductCommandContribution(request) {
      return explainProductAppBackendCommandContribution(
        snapshot,
        request,
        options.extensionCommandExecutor
      )
    },
    previewProductCommandInvocation(request) {
      return previewProductAppBackendCommandInvocation(
        snapshot,
        request,
        options.extensionCommandExecutor
      )
    },
    async executeProductCommand(request) {
      return await executeProductAppBackendCommand(options, snapshot, request)
    }
  }
}
