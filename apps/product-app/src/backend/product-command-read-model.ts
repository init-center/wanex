import type {
  AppExtensionDiagnostic,
  AppExtensionResolvedSnapshot
} from "@wanex/extension"
import { parseAppCommandInputSchema } from "@wanex/extension"
import type {
  ProductAppBackendCommandRegistryDiagnostic,
  ProductAppBackendCommandRegistryReadModel
} from "./types.js"

export function projectProductAppBackendCommandRegistryReadModel(
  snapshot: AppExtensionResolvedSnapshot
): ProductAppBackendCommandRegistryReadModel {
  return {
    commands: snapshot.byDomain.command.all.map(projectProductAppBackendCommandRow),
    diagnostics: snapshot.diagnostics.map(projectDiagnostic)
  }
}

function projectDiagnostic(
  diagnostic: AppExtensionDiagnostic
): ProductAppBackendCommandRegistryDiagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.contributionId === undefined
      ? {}
      : { contributionId: diagnostic.contributionId }),
    ...(diagnostic.domain === undefined ? {} : { domain: diagnostic.domain }),
    ...(diagnostic.sourceId === undefined
      ? {}
      : { sourceId: diagnostic.sourceId })
  }
}

export function projectProductAppBackendCommandRow(
  contribution: AppExtensionResolvedSnapshot["byDomain"]["command"]["all"][number]
): ProductAppBackendCommandRegistryReadModel["commands"][number] {
  return {
    id: contribution.id,
    name: contribution.value.name,
    title: contribution.value.title,
    handlerRef: contribution.value.handlerRef,
    sourceKind: contribution.provenance.source.kind,
    sourceScope: contribution.provenance.source.scope,
    sourceId: contribution.provenance.source.id,
    trust: contribution.provenance.trust,
    ...(contribution.value.category === undefined
      ? {}
      : { category: contribution.value.category }),
    ...(contribution.value.inputSchema === undefined
      ? {}
      : { inputSchema: cloneInputSchema(contribution.value.inputSchema) })
  }
}

function cloneInputSchema(
  schema: NonNullable<
    AppExtensionResolvedSnapshot["byDomain"]["command"]["all"][number]["value"]["inputSchema"]
  >
) {
  const parsed = parseAppCommandInputSchema(schema)
  if (!parsed.ok) {
    throw new Error("resolved command input schema is invalid")
  }
  return parsed.value
}

export { projectDiagnostic as projectProductAppBackendCommandRegistryDiagnostic }
