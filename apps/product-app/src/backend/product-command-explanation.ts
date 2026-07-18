import type {
  ProductAppBackendExtensionCommandExecutor
} from "./product-command-runtime.js"
import type {
  AppCommandContribution,
  AppExtensionDiagnostic,
  AppExtensionResolvedSnapshot
} from "@wanex/extension"
import {
  isProductAppBackendHandlerRefSupported
} from "./product-command-handler-refs.js"
import {
  projectProductAppBackendCommandRegistryDiagnostic,
  projectProductAppBackendCommandRow
} from "./product-command-read-model.js"
import type {
  ProductAppBackendCommandContributionExplanation,
  ProductAppBackendCommandHandlerExplanation,
  ProductAppBackendCommandRegistryDiagnostic,
  ProductAppBackendExplainCommandContributionRequest
} from "./types.js"

export function explainProductAppBackendCommandContribution(
  snapshot: AppExtensionResolvedSnapshot,
  request: ProductAppBackendExplainCommandContributionRequest,
  extensionExecutor?: ProductAppBackendExtensionCommandExecutor
): ProductAppBackendCommandContributionExplanation {
  const commandId = request.commandId
  const contribution = snapshot.byDomain.command.byId.get(commandId)
  if (contribution === undefined) {
    return {
      kind: "missing",
      commandId,
      message: `product command contribution not found: ${commandId}`,
      diagnostics: relatedMissingCommandDiagnostics(snapshot, commandId)
    }
  }

  return {
    kind: "found",
    commandId,
    command: projectProductAppBackendCommandRow(contribution),
    source: sourceExplanation(contribution),
    contribution: {
      id: contribution.id,
      domain: "command",
      priority: contribution.priority ?? 0,
      order: contribution.order ?? 0,
      privileged: contribution.privileged === true,
      aliases: contribution.value.aliases ?? [],
      ...(contribution.provenance.originId === undefined
        ? {}
        : { originId: contribution.provenance.originId }),
      ...(contribution.provenance.originLabel === undefined
        ? {}
        : { originLabel: contribution.provenance.originLabel }),
      ...(contribution.provenance.loadedAt === undefined
        ? {}
        : { loadedAt: contribution.provenance.loadedAt })
    },
    handler: handlerExplanation(
      contribution.value.handlerRef,
      extensionExecutor
    ),
    diagnostics: relatedContributionDiagnostics(snapshot, contribution)
  }
}

function sourceExplanation(contribution: AppCommandContribution) {
  const source = contribution.provenance.source
  return {
    kind: source.kind,
    scope: source.scope,
    id: source.id,
    trust: contribution.provenance.trust,
    ...(source.label === undefined ? {} : { label: source.label }),
    ...(source.path === undefined ? {} : { path: source.path }),
    ...(source.packageName === undefined
      ? {}
      : { packageName: source.packageName }),
    ...(source.version === undefined ? {} : { version: source.version })
  }
}

function handlerExplanation(
  handlerRef: string,
  extensionExecutor?: ProductAppBackendExtensionCommandExecutor
): ProductAppBackendCommandHandlerExplanation {
  const builtIn = isProductAppBackendHandlerRefSupported(handlerRef)
  const extension = extensionExecutor?.supports(handlerRef) === true
  const supported = builtIn || extension
  return {
    handlerRef,
    supported,
    policy: builtIn
      ? "allow_listed"
      : extension
        ? "extension_executor"
        : "unsupported_handler_ref",
    message: builtIn
      ? "handler is allow-listed by the product app backend"
      : extension
        ? "handler is supported by the injected extension executor"
      : "handler is visible for discovery but not executable by the product app backend"
  }
}

function relatedContributionDiagnostics(
  snapshot: AppExtensionResolvedSnapshot,
  contribution: AppCommandContribution
): readonly ProductAppBackendCommandRegistryDiagnostic[] {
  const sourceId = contribution.provenance.source.id
  return dedupeDiagnostics([
    ...snapshot.diagnostics.filter((diagnostic) =>
      diagnostic.contributionId === contribution.id ||
        diagnostic.sourceId === sourceId
    ),
    ...(contribution.diagnostics ?? [])
  ]).map(projectProductAppBackendCommandRegistryDiagnostic)
}

function relatedMissingCommandDiagnostics(
  snapshot: AppExtensionResolvedSnapshot,
  commandId: string
): readonly ProductAppBackendCommandRegistryDiagnostic[] {
  return dedupeDiagnostics(
    snapshot.diagnostics.filter(
      (diagnostic) => diagnostic.contributionId === commandId
    )
  ).map(projectProductAppBackendCommandRegistryDiagnostic)
}

function dedupeDiagnostics(
  diagnostics: readonly AppExtensionDiagnostic[]
): readonly AppExtensionDiagnostic[] {
  const seen = new Set<string>()
  const unique: AppExtensionDiagnostic[] = []
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.severity,
      diagnostic.message,
      diagnostic.contributionId ?? "",
      diagnostic.sourceId ?? ""
    ].join("\u0000")
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(diagnostic)
  }
  return unique
}
