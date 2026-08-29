import {
  projectLocalCliStartupSummary,
  type LocalCliJsonStartupSummary
} from "./summary.js"
import type {
  LocalCliOptions
} from "./options.js"
import type {
  AssistantWebApp
} from "../model.js"
import type { ModelEndpointReadModel } from "@wanex/assistant"
import { normalizeLocalModelEndpoint } from "../provider/endpoints.js"

export interface LocalCliProviderSetupInput {
  readonly app: AssistantWebApp
  readonly options: LocalCliOptions
}

export interface LocalCliProviderSetupResult {
  readonly kind: "assistant-host.cli.provider-setup-result"
  readonly ok: boolean
  readonly configuredEndpoints: readonly ModelEndpointReadModel[]
  readonly startup: LocalCliJsonStartupSummary
}

export async function runLocalCliProviderSetup(
  input: LocalCliProviderSetupInput
): Promise<LocalCliProviderSetupResult> {
  const configuredEndpoints: ModelEndpointReadModel[] = []
  for (const endpoint of input.options.modelEndpoints.endpoints) {
    configuredEndpoints.push(
      await input.app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: normalizeLocalModelEndpoint(endpoint),
        makeActive: input.options.modelEndpoints.activeEndpointId === endpoint.id
      })
    )
  }
  const snapshot = await input.app.readSnapshot()
  return {
    kind: "assistant-host.cli.provider-setup-result",
    ok: configuredEndpoints.length > 0 && snapshot.web.view.settings.profile.readiness.canRun,
    configuredEndpoints,
    startup: projectLocalCliStartupSummary({
      options: input.options,
      snapshot
    })
  }
}

export function formatLocalCliProviderSetupResult(
  result: LocalCliProviderSetupResult
): string {
  return JSON.stringify(result)
}
