import {
  agentContextProfileFromJson,
  agentContextProfileToJson,
  agentContextProfileToPrepareOptions,
  prepareAgentContext,
  type AgentContextProfile,
  type PreparedAgentContext
} from "@wanex/runtime/context"
import type {
  WanexAppConfigReloadCandidateResult,
  WanexAppConfigReloadSubscription
} from "./config-reload.js"
import { preparedWanexAppAgentContextFingerprint } from "./context-fingerprint.js"
import type { WanexAppRuntime } from "./runtime.js"
import type {
  WanexAppAgentContextProfileReloadResult,
  WanexAppAgentContextProfileSetResult,
  WanexAppAgentContextStatus,
  WanexAppAgentContextSummary
} from "./types-context.js"

export const WANEX_APP_AGENT_CONTEXT_PROFILE_KEY =
  "agent.context.profile.default" as const

const agentContextSubscriptionId = "wanex-app-agent-context-profile"

export interface WanexAppAgentContextProfileManager {
  current(): PreparedAgentContext | undefined
  status(): WanexAppAgentContextStatus
  setProfile(
    profile: AgentContextProfile
  ): Promise<WanexAppAgentContextProfileSetResult>
  refresh(): Promise<WanexAppAgentContextProfileReloadResult>
}

export async function createWanexAppAgentContextProfileManager(
  options: {
    readonly app: WanexAppRuntime
    readonly initialProfile?: AgentContextProfile
  }
): Promise<WanexAppAgentContextProfileManager> {
  let currentProfile: AgentContextProfile | undefined
  let currentPrepared: PreparedAgentContext | undefined
  let currentFingerprint: string | undefined
  let revision = 0

  const prepareProfile = async (
    profile: AgentContextProfile
  ): Promise<PreparedAgentContext> =>
    await prepareAgentContext(agentContextProfileToPrepareOptions(profile))

  if (options.initialProfile !== undefined) {
    currentProfile = options.initialProfile
    currentPrepared = await prepareProfile(options.initialProfile)
    currentFingerprint =
      preparedWanexAppAgentContextFingerprint(currentPrepared)
    await options.app.config.put(
      WANEX_APP_AGENT_CONTEXT_PROFILE_KEY,
      agentContextProfileToJson(options.initialProfile)
    )
    revision = 1
  }

  const prepare: WanexAppConfigReloadSubscription["prepare"] = async () => {
    const value = await options.app.config.require(
      WANEX_APP_AGENT_CONTEXT_PROFILE_KEY
    )
    const nextProfile = agentContextProfileFromJson(value)
    const nextPrepared = await prepareProfile(nextProfile)
    if (nextPrepared.skillSnapshot?.complete === false) {
      return {
        kind: "rejected",
        result: {
          reloaded: false,
          reason: "skill_observation_incomplete",
          detail: incompleteSkillObservationDetail({
            revision,
            current: currentPrepared,
            candidate: nextPrepared
          })
        }
      }
    }
    const nextFingerprint =
      preparedWanexAppAgentContextFingerprint(nextPrepared)
    const reloaded =
      currentProfile === undefined ||
      JSON.stringify(agentContextProfileToJson(currentProfile)) !==
        JSON.stringify(agentContextProfileToJson(nextProfile)) ||
      currentFingerprint !== nextFingerprint
    const previous = {
      profile: currentProfile,
      prepared: currentPrepared,
      fingerprint: currentFingerprint,
      revision
    }
    const nextRevision = reloaded ? revision + 1 : revision
    const detail = statusDetail({
      revision: nextRevision,
      prepared: nextPrepared
    })
    return {
      kind: "ready",
      result: {
        reloaded,
        ...(reloaded ? {} : { reason: "unchanged" }),
        detail
      },
      commit() {
        currentProfile = nextProfile
        currentPrepared = nextPrepared
        currentFingerprint = nextFingerprint
        revision = nextRevision
      },
      rollback() {
        currentProfile = previous.profile
        currentPrepared = previous.prepared
        currentFingerprint = previous.fingerprint
        revision = previous.revision
      }
    }
  }

  const refresh = async (): Promise<WanexAppAgentContextProfileReloadResult> =>
    normalizeRefreshResult(
      await options.app.refreshConfigKey(WANEX_APP_AGENT_CONTEXT_PROFILE_KEY)
    )

  const subscription: WanexAppConfigReloadSubscription = {
    id: agentContextSubscriptionId,
    matcher: {
      kind: "exact",
      key: WANEX_APP_AGENT_CONTEXT_PROFILE_KEY
    },
    prepare
  }
  options.app.registerConfigReload(subscription)

  return {
    current() {
      return currentPrepared
    },
    status() {
      return {
        configured: currentProfile !== undefined,
        revision,
        ...(currentPrepared === undefined
          ? {}
          : { context: summarizeWanexAppPreparedAgentContext(currentPrepared) })
      }
    },
    async setProfile(profile) {
      await options.app.config.put(
        WANEX_APP_AGENT_CONTEXT_PROFILE_KEY,
        agentContextProfileToJson(profile)
      )
      return await refresh()
    },
    async refresh() {
      return await refresh()
    }
  }
}

export function summarizeWanexAppPreparedAgentContext(
  prepared: PreparedAgentContext
): WanexAppAgentContextSummary {
  return {
    instructionSources: prepared.instructionSnapshot?.sources.length ?? 0,
    skillNames:
      prepared.skillSnapshot?.complete === true
        ? prepared.skillSnapshot.sources.map((source) => source.name)
        : [],
    diagnostics: [
      ...(prepared.instructionSnapshot?.diagnostics.map(
        (diagnostic) => diagnostic.code
      ) ?? []),
      ...(prepared.skillSnapshot?.diagnostics.map(
        (diagnostic) => diagnostic.code
      ) ?? [])
    ],
    activationToolRegistered: prepared.tools !== undefined
  }
}

function incompleteSkillObservationDetail(options: {
  readonly revision: number
  readonly current: PreparedAgentContext | undefined
  readonly candidate: PreparedAgentContext
}): NonNullable<WanexAppConfigReloadCandidateResult["detail"]> {
  const retained =
    options.current === undefined
      ? {
          instructionSources: 0,
          skillNames: [],
          diagnostics: [],
          activationToolRegistered: false
        }
      : summarizeWanexAppPreparedAgentContext(options.current)
  return {
    revision: options.revision,
    retained: options.current !== undefined,
    ...retained,
    candidateDiagnostics:
      options.candidate.skillSnapshot?.diagnostics.map(
        (diagnostic) => diagnostic.code
      ) ?? []
  }
}

async function normalizeRefreshResult(
  result: Awaited<ReturnType<WanexAppRuntime["refreshConfigKey"]>>
): Promise<WanexAppAgentContextProfileReloadResult> {
  const reload = result.reloads.find(
    (item) =>
      item.subscriptionId === agentContextSubscriptionId &&
      item.key === WANEX_APP_AGENT_CONTEXT_PROFILE_KEY
  )
  const error = result.errors.find(
    (item) =>
      item.subscriptionId === agentContextSubscriptionId &&
      item.key === WANEX_APP_AGENT_CONTEXT_PROFILE_KEY
  )
  return {
    key: WANEX_APP_AGENT_CONTEXT_PROFILE_KEY,
    reloaded: reload?.reloaded ?? false,
    ...(reload?.reason === undefined ? {} : { reason: reload.reason }),
    ...(reload?.detail === undefined ? {} : { detail: reload.detail }),
    ...(error === undefined ? {} : { error: error.error })
  }
}

function statusDetail(options: {
  readonly revision: number
  readonly prepared: PreparedAgentContext
}): NonNullable<WanexAppConfigReloadCandidateResult["detail"]> {
  return {
    revision: options.revision,
    ...summarizeWanexAppPreparedAgentContext(options.prepared)
  }
}
