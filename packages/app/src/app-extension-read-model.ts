import type {
  AppAgentContribution,
  AppCommandContribution,
  AppExtensionContribution,
  AppExtensionDiagnostic,
  AppExtensionResolvedSnapshot,
  AppLifecycleHookContribution,
  AppProviderCatalogContribution,
  AppToolContribution
} from "@wanex/extension"
import type {
  WanexAppShellAgentContributionRow,
  WanexAppShellCommandContributionRow,
  WanexAppShellExtensionContributionRow,
  WanexAppShellExtensionDiagnosticRow,
  WanexAppShellExtensionDomainCounts,
  WanexAppShellExtensionReadModel,
  WanexAppShellExtensionStatus,
  WanexAppShellLifecycleHookContributionRow,
  WanexAppShellProviderCatalogContributionRow,
  WanexAppShellToolContributionRow
} from "./types-extension.js"

export function projectWanexAppShellExtensionReadModel(
  snapshot: AppExtensionResolvedSnapshot | undefined
): WanexAppShellExtensionReadModel {
  const contributions = snapshot?.contributions ?? []
  return {
    configured: snapshot !== undefined,
    counts: domainCounts(snapshot),
    contributions: contributions.map(projectContributionRow),
    commands:
      snapshot?.byDomain.command.all.map(projectCommandContributionRow) ?? [],
    agents: snapshot?.byDomain.agent.all.map(projectAgentContributionRow) ?? [],
    tools: snapshot?.byDomain.tool.all.map(projectToolContributionRow) ?? [],
    providerCatalog:
      snapshot?.byDomain.provider_catalog.all.map(
        projectProviderCatalogContributionRow
      ) ?? [],
    lifecycleHooks:
      snapshot?.byDomain.lifecycle_hook.all.map(
        projectLifecycleHookContributionRow
      ) ?? [],
    diagnostics: snapshot?.diagnostics.map(projectDiagnosticRow) ?? []
  }
}

export function extensionStatus(
  snapshot: AppExtensionResolvedSnapshot | undefined
): WanexAppShellExtensionStatus {
  return {
    configured: snapshot !== undefined,
    contributionCount: snapshot?.contributions.length ?? 0,
    diagnosticCount: snapshot?.diagnostics.length ?? 0,
    byDomain: domainCounts(snapshot)
  }
}

function domainCounts(
  snapshot: AppExtensionResolvedSnapshot | undefined
): WanexAppShellExtensionDomainCounts {
  return {
    instruction: snapshot?.byDomain.instruction.all.length ?? 0,
    skill: snapshot?.byDomain.skill.all.length ?? 0,
    command: snapshot?.byDomain.command.all.length ?? 0,
    agent: snapshot?.byDomain.agent.all.length ?? 0,
    tool: snapshot?.byDomain.tool.all.length ?? 0,
    providerCatalog: snapshot?.byDomain.provider_catalog.all.length ?? 0,
    lifecycleHook: snapshot?.byDomain.lifecycle_hook.all.length ?? 0
  }
}

function projectContributionRow(
  contribution: AppExtensionContribution
): WanexAppShellExtensionContributionRow {
  return {
    id: contribution.id,
    domain: contribution.domain,
    sourceKind: contribution.provenance.source.kind,
    sourceScope: contribution.provenance.source.scope,
    sourceId: contribution.provenance.source.id,
    trust: contribution.provenance.trust,
    priority: contribution.priority ?? 0,
    order: contribution.order ?? 0,
    privileged: contribution.privileged === true,
    label: contributionLabel(contribution),
    diagnosticCodes: contribution.diagnostics?.map((item) => item.code) ?? []
  }
}

function projectCommandContributionRow(
  contribution: AppCommandContribution
): WanexAppShellCommandContributionRow {
  return {
    ...projectContributionRow(contribution),
    domain: "command",
    name: contribution.value.name,
    title: contribution.value.title,
    aliases: contribution.value.aliases ?? [],
    ...(contribution.value.category === undefined
      ? {}
      : { category: contribution.value.category }),
    handlerRef: contribution.value.handlerRef
  }
}

function projectAgentContributionRow(
  contribution: AppAgentContribution
): WanexAppShellAgentContributionRow {
  return {
    ...projectContributionRow(contribution),
    domain: "agent",
    name: contribution.value.name,
    ...(contribution.value.title === undefined
      ? {}
      : { title: contribution.value.title }),
    ...(contribution.value.providerProfileId === undefined
      ? {}
      : { providerProfileId: contribution.value.providerProfileId }),
    ...(contribution.value.modelId === undefined
      ? {}
      : { modelId: contribution.value.modelId }),
    instructionRefs: contribution.value.instructionRefs ?? [],
    skillRefs: contribution.value.skillRefs ?? [],
    toolRefs: contribution.value.toolRefs ?? []
  }
}

function projectToolContributionRow(
  contribution: AppToolContribution
): WanexAppShellToolContributionRow {
  return {
    ...projectContributionRow(contribution),
    domain: "tool",
    name: contribution.value.name,
    ...(contribution.value.permission === undefined
      ? {}
      : { permission: contribution.value.permission }),
    handlerRef: contribution.value.handlerRef
  }
}

function projectProviderCatalogContributionRow(
  contribution: AppProviderCatalogContribution
): WanexAppShellProviderCatalogContributionRow {
  return {
    ...projectContributionRow(contribution),
    domain: "provider_catalog",
    providerId: contribution.value.providerId,
    modelIds: contribution.value.models?.map((model) => model.id) ?? [],
    ...(contribution.value.defaults?.modelId === undefined
      ? {}
      : { defaultModelId: contribution.value.defaults.modelId }),
    ...(contribution.value.defaults?.profileId === undefined
      ? {}
      : { defaultProfileId: contribution.value.defaults.profileId })
  }
}

function projectLifecycleHookContributionRow(
  contribution: AppLifecycleHookContribution
): WanexAppShellLifecycleHookContributionRow {
  return {
    ...projectContributionRow(contribution),
    domain: "lifecycle_hook",
    event: contribution.value.event,
    handlerRef: contribution.value.handlerRef
  }
}

function projectDiagnosticRow(
  diagnostic: AppExtensionDiagnostic
): WanexAppShellExtensionDiagnosticRow {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.contributionId === undefined
      ? {}
      : { contributionId: diagnostic.contributionId }),
    ...(diagnostic.domain === undefined ? {} : { domain: diagnostic.domain }),
    ...(diagnostic.sourceId === undefined ? {} : { sourceId: diagnostic.sourceId })
  }
}

function contributionLabel(contribution: AppExtensionContribution): string {
  switch (contribution.domain) {
    case "command":
      return contribution.value.title
    case "agent":
      return contribution.value.title ?? contribution.value.name
    case "skill":
      return contribution.value.name
    case "tool":
      return contribution.value.name
    case "provider_catalog":
      return contribution.value.providerId
    case "lifecycle_hook":
      return contribution.value.event
    case "instruction":
      return contribution.value.target ?? contribution.id
  }
}
