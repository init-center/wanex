import type {
  ConversationAttachmentsReadModel,
  ConversationHistoryReadModel,
  ConversationOperationReadModel,
  HomeReadModel,
  TeamConversationPageReadModel
} from "@wanex/assistant"
import type { TuiFullScreenClient } from "./types.js"
import {
  sessionIdFromSelection,
  teamConversationIdFromSelection
} from "../selection.js"

export interface TuiFullScreenCanonicalRead {
  readonly home: HomeReadModel
  readonly operation:
    | ConversationOperationReadModel
    | undefined
  readonly transcript: ConversationHistoryReadModel | undefined
  readonly attachments: ConversationAttachmentsReadModel | undefined
  readonly team: TeamConversationPageReadModel | undefined
}

export async function readTuiFullScreenCanonical(options: {
  readonly client: Pick<
    TuiFullScreenClient,
    | "readHome"
    | "readTrackedConversationOperation"
    | "readSessionTranscript"
    | "readConversationAttachments"
    | "readTeamConversation"
  >
}): Promise<TuiFullScreenCanonicalRead> {
  const homeEnvelope = await options.client.readHome()
  const home = expectSurfaceValue(homeEnvelope, "readHome")

  const sessionId = sessionIdFromSelection(home.state.selection)
  const conversationId = teamConversationIdFromSelection(home.state.selection)
  if (conversationId !== undefined) {
    const teamEnvelope = await options.client.readTeamConversation({
      conversationId
    })
    const teamResult = expectSurfaceValue(teamEnvelope, "readTeamConversation")
    return {
      home,
      operation: undefined,
      transcript: undefined,
      attachments: undefined,
      team:
        teamResult.kind === "assistant.team-conversation.found"
          ? teamResult.page
          : undefined
    }
  }

  const [operationEnvelope, transcriptEnvelope, attachmentsEnvelope] =
    await Promise.all([
      sessionId === undefined
        ? undefined
        : options.client.readTrackedConversationOperation({ sessionId }),
      sessionId === undefined
        ? undefined
        : options.client.readSessionTranscript({ sessionId }),
      sessionId === undefined
        ? options.client.readConversationAttachments()
        : options.client.readConversationAttachments({ sessionId })
    ])
  const operationResult =
    operationEnvelope === undefined
      ? undefined
      : expectSurfaceValue(
          operationEnvelope,
          "readTrackedConversationOperation"
        )
  const transcriptResult =
    transcriptEnvelope === undefined
      ? undefined
      : expectSurfaceValue(transcriptEnvelope, "readSessionTranscript")
  const attachments =
    attachmentsEnvelope === undefined
      ? undefined
      : expectSurfaceValue(attachmentsEnvelope, "readConversationAttachments")
  return {
    home,
    operation:
      operationResult?.kind === "assistant.conversation-operation.found"
        ? operationResult.operation
        : undefined,
    transcript:
      transcriptResult?.kind === "assistant.session-transcript.found"
        ? transcriptResult.transcript
        : undefined,
    attachments,
    team: undefined
  }
}

function expectSurfaceValue<T>(
  result:
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: { readonly message: string } },
  command: string
): T {
  if (!result.ok) throw new Error(`${command} failed: ${result.error.message}`)
  return result.value
}
