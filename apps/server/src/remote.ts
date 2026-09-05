import {
  createAssistantAgentHostEndpoint,
  type AssistantHost
} from "@wanex/assistant-host"
import {
  createCodingAgentHostEndpoint,
  type CodingApplicationHost
} from "@wanex/coding/host"
import {
  createRemoteAgentHostHttpHandler,
  type RemoteAgentHostHandshakeContext,
  type RemoteAgentHostHttpHandler,
  type RemoteAgentHostResolvedHost,
  type RemoteHostRequestLimits
} from "@wanex/runtime/host"
import type { WanexServerAuthentication } from "./model.js"

export function createWanexServerRemoteHandler(options: {
  readonly authentication: WanexServerAuthentication
  readonly assistantHost: AssistantHost
  readonly codingHost?: CodingApplicationHost
  readonly host: RemoteAgentHostResolvedHost["host"]
  readonly limits?: Partial<RemoteHostRequestLimits>
}): RemoteAgentHostHttpHandler {
  return createRemoteAgentHostHttpHandler({
    authenticateBearerToken: async (token) =>
      await options.authentication.authenticateBearerToken(token),
    resolveHost: (subject, context) => {
      const domain = exactRequestedDomain(context)
      if (domain === undefined) return null
      const grant = {
        subjectId: subject.subjectId,
        hostId: options.host.hostId,
        domains: [domain],
        expiresAt: subject.expiresAt
      } as const

      if (domain === "assistant") {
        return {
          host: options.host,
          grant,
          createEndpoint: (accessToken: string) =>
            createAssistantAgentHostEndpoint({
              surface: options.assistantHost.surface,
              commands: options.assistantHost.shell,
              host: options.host,
              accessToken
            })
        }
      }

      const codingHost = options.codingHost
      if (codingHost === undefined) return null
      return {
        host: options.host,
        grant,
        createEndpoint: (accessToken: string) =>
          createCodingAgentHostEndpoint({
            application: codingHost.application,
            host: options.host,
            accessToken
          })
      }
    },
    ...(options.limits === undefined ? {} : { limits: options.limits })
  })
}

function exactRequestedDomain(
  context: RemoteAgentHostHandshakeContext
): RemoteAgentHostHandshakeContext["requestedDomains"][number] | undefined {
  return context.requestedDomains.length === 1
    ? context.requestedDomains[0]
    : undefined
}
