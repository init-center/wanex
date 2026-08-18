import type {
  AppExtensionDiagnostic,
  AppExtensionResolvedSnapshot
} from "@wanex/extension"
import { parseAppCommandInputSchema } from "@wanex/extension"
import type {
  BackendCommandRegistryDiagnostic,
  BackendCommandRegistryReadModel
} from "../model/index.js"

export function projectBackendCommandRegistryReadModel(
  snapshot: AppExtensionResolvedSnapshot,
  extensionRevision?: string
): BackendCommandRegistryReadModel {
  return {
    ...(extensionRevision === undefined ? {} : { extensionRevision }),
    commands: snapshot.byDomain.command.all.map(projectBackendCommandRow),
    diagnostics: snapshot.diagnostics.map(projectDiagnostic)
  }
}

function projectDiagnostic(
  diagnostic: AppExtensionDiagnostic
): BackendCommandRegistryDiagnostic {
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

export function projectBackendCommandRow(
  contribution: AppExtensionResolvedSnapshot["byDomain"]["command"]["all"][number]
): BackendCommandRegistryReadModel["commands"][number] {
  return {
    id: contribution.id,
    name: contribution.value.name,
    title: contribution.value.title,
    handlerRef: contribution.value.handlerRef,
    sourceKind: contribution.provenance.source.kind,
    sourceScope: contribution.provenance.source.scope,
    sourceId: contribution.provenance.source.id,
    trust: contribution.provenance.trust,
    paletteVisibility: contribution.value.paletteVisibility,
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

export { projectDiagnostic as projectBackendCommandRegistryDiagnostic }
