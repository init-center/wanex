import {
  agentContextProfileFromJson,
  agentContextProfileToJson,
  agentContextProfileToPrepareOptions,
  prepareAgentContext,
  type AgentContextProfile,
  type PreparedAgentContext
} from "@wanex/runtime/context"
import type {
  WanexAppConfigReloadHandlerResult,
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

  const reload = async (): Promise<WanexAppConfigReloadHandlerResult> => {
    const value = await options.app.config.require(
      WANEX_APP_AGENT_CONTEXT_PROFILE_KEY
    )
    const nextProfile = agentContextProfileFromJson(value)
    const nextPrepared = await prepareProfile(nextProfile)
    const nextFingerprint =
      preparedWanexAppAgentContextFingerprint(nextPrepared)
    const reloaded =
      currentProfile === undefined ||
      JSON.stringify(agentContextProfileToJson(currentProfile)) !==
        JSON.stringify(agentContextProfileToJson(nextProfile)) ||
      currentFingerprint !== nextFingerprint
    currentProfile = nextProfile
    currentPrepared = nextPrepared
    currentFingerprint = nextFingerprint
    if (reloaded) {
      revision += 1
    }
    const detail = statusDetail({
      revision,
      prepared: currentPrepared
    })
    return {
      key: WANEX_APP_AGENT_CONTEXT_PROFILE_KEY,
      reloaded,
      ...(reloaded ? {} : { reason: "unchanged" }),
      detail
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
    reload
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
      prepared.skillSnapshot?.sources.map((source) => source.name) ?? [],
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
}): NonNullable<WanexAppConfigReloadHandlerResult["detail"]> {
  return {
    revision: options.revision,
    ...summarizeWanexAppPreparedAgentContext(options.prepared)
  }
}
