import {
  agentContextProfileFromJson,
  agentContextProfileToJson,
  agentContextProfileToPrepareOptions,
  prepareAgentContext,
  type AgentContextProfile,
  type PreparedAgentContext
} from "@wanex/runtime/context"
import type {
  WanexAppShellConfigReloadHandlerResult,
  WanexAppShellConfigReloadSubscription
} from "./config-reload.js"
import { preparedWanexAppShellAgentContextFingerprint } from "./context-fingerprint.js"
import type { WanexAppShellRuntime } from "./runtime.js"
import type {
  WanexAppShellAgentContextProfileReloadResult,
  WanexAppShellAgentContextProfileSetResult,
  WanexAppShellAgentContextStatus,
  WanexAppShellAgentContextSummary
} from "./types-context.js"

export const WANEX_APP_SHELL_AGENT_CONTEXT_PROFILE_KEY =
  "agent.context.profile.default" as const

const agentContextSubscriptionId = "app-shell-agent-context-profile"

export interface WanexAppShellAgentContextProfileManager {
  current(): PreparedAgentContext | undefined
  status(): WanexAppShellAgentContextStatus
  setProfile(
    profile: AgentContextProfile
  ): Promise<WanexAppShellAgentContextProfileSetResult>
  refresh(): Promise<WanexAppShellAgentContextProfileReloadResult>
}

export async function createWanexAppShellAgentContextProfileManager(
  options: {
    readonly app: WanexAppShellRuntime
    readonly initialProfile?: AgentContextProfile
  }
): Promise<WanexAppShellAgentContextProfileManager> {
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
      preparedWanexAppShellAgentContextFingerprint(currentPrepared)
    await options.app.config.put(
      WANEX_APP_SHELL_AGENT_CONTEXT_PROFILE_KEY,
      agentContextProfileToJson(options.initialProfile)
    )
    revision = 1
  }

  const reload = async (): Promise<WanexAppShellConfigReloadHandlerResult> => {
    const value = await options.app.config.require(
      WANEX_APP_SHELL_AGENT_CONTEXT_PROFILE_KEY
    )
    const nextProfile = agentContextProfileFromJson(value)
    const nextPrepared = await prepareProfile(nextProfile)
    const nextFingerprint =
      preparedWanexAppShellAgentContextFingerprint(nextPrepared)
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
      key: WANEX_APP_SHELL_AGENT_CONTEXT_PROFILE_KEY,
      reloaded,
      ...(reloaded ? {} : { reason: "unchanged" }),
      detail
    }
  }

  const refresh = async (): Promise<WanexAppShellAgentContextProfileReloadResult> =>
    normalizeRefreshResult(
      await options.app.refreshConfigKey(WANEX_APP_SHELL_AGENT_CONTEXT_PROFILE_KEY)
    )

  const subscription: WanexAppShellConfigReloadSubscription = {
    id: agentContextSubscriptionId,
    matcher: {
      kind: "exact",
      key: WANEX_APP_SHELL_AGENT_CONTEXT_PROFILE_KEY
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
          : { context: summarizeWanexAppShellPreparedAgentContext(currentPrepared) })
      }
    },
    async setProfile(profile) {
      await options.app.config.put(
        WANEX_APP_SHELL_AGENT_CONTEXT_PROFILE_KEY,
        agentContextProfileToJson(profile)
      )
      return await refresh()
    },
    async refresh() {
      return await refresh()
    }
  }
}

export function summarizeWanexAppShellPreparedAgentContext(
  prepared: PreparedAgentContext
): WanexAppShellAgentContextSummary {
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
  result: Awaited<ReturnType<WanexAppShellRuntime["refreshConfigKey"]>>
): Promise<WanexAppShellAgentContextProfileReloadResult> {
  const reload = result.reloads.find(
    (item) =>
      item.subscriptionId === agentContextSubscriptionId &&
      item.key === WANEX_APP_SHELL_AGENT_CONTEXT_PROFILE_KEY
  )
  const error = result.errors.find(
    (item) =>
      item.subscriptionId === agentContextSubscriptionId &&
      item.key === WANEX_APP_SHELL_AGENT_CONTEXT_PROFILE_KEY
  )
  return {
    key: WANEX_APP_SHELL_AGENT_CONTEXT_PROFILE_KEY,
    reloaded: reload?.reloaded ?? false,
    ...(reload?.reason === undefined ? {} : { reason: reload.reason }),
    ...(reload?.detail === undefined ? {} : { detail: reload.detail }),
    ...(error === undefined ? {} : { error: error.error })
  }
}

function statusDetail(options: {
  readonly revision: number
  readonly prepared: PreparedAgentContext
}): NonNullable<WanexAppShellConfigReloadHandlerResult["detail"]> {
  return {
    revision: options.revision,
    ...summarizeWanexAppShellPreparedAgentContext(options.prepared)
  }
}
