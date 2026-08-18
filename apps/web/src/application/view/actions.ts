import type { ActionDescriptor, ModelEndpointRow, ViewModel } from "../model.js"
import { encodeSessionReference } from "../sessions/projection.js"

const BASE_ACTIONS: readonly ActionDescriptor[] = [
  {
    id: "refresh",
    label: "Refresh",
    mutatesState: false,
    fields: []
  },
  {
    id: "start-new-conversation",
    label: "New chat",
    mutatesState: true,
    fields: []
  },
  {
    id: "set-layout",
    label: "Set layout",
    mutatesState: true,
    fields: [
      {
        name: "layout",
        label: "Layout",
        required: true,
        kind: "select",
        options: [
          { value: "single", label: "Single" },
          { value: "split", label: "Split" },
          { value: "diagnostics", label: "Diagnostics" }
        ]
      }
    ]
  },
  {
    id: "set-mode",
    label: "Set mode",
    mutatesState: true,
    fields: [
      {
        name: "mode",
        label: "Mode",
        required: true,
        kind: "select",
        options: [
          { value: "chat", label: "Chat" },
          { value: "workbench", label: "Workbench" },
          { value: "diagnostics", label: "Diagnostics" }
        ]
      }
    ]
  },
  {
    id: "update-preferences",
    label: "Update preferences",
    mutatesState: true,
    fields: [
      {
        name: "theme",
        label: "Theme",
        required: false,
        kind: "select",
        options: [
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" }
        ]
      },
      {
        name: "density",
        label: "Density",
        required: false,
        kind: "select",
        options: [
          { value: "comfortable", label: "Comfortable" },
          { value: "compact", label: "Compact" }
        ]
      }
    ]
  },
  {
    id: "submit-conversation",
    label: "Send message",
    mutatesState: true,
    fields: [
      {
        name: "text",
        label: "Message",
        required: false,
        kind: "textarea"
      }
    ]
  },
  {
    id: "queue-guided-follow-up",
    label: "Queue after current",
    mutatesState: true,
    fields: [
      {
        name: "operationId",
        label: "Operation",
        required: true,
        kind: "text"
      },
      {
        name: "text",
        label: "Message",
        required: true,
        kind: "textarea"
      }
    ]
  },
  {
    id: "steer-current-response",
    label: "Guide current",
    mutatesState: false,
    fields: [
      {
        name: "operationId",
        label: "Operation",
        required: true,
        kind: "text"
      },
      {
        name: "text",
        label: "Guidance",
        required: true,
        kind: "textarea"
      }
    ]
  },
  {
    id: "start-side-query",
    label: "Ask side question",
    mutatesState: false,
    fields: [
      {
        name: "question",
        label: "Question",
        required: true,
        kind: "textarea"
      }
    ]
  },
  {
    id: "cancel-side-query",
    label: "Cancel side question",
    mutatesState: false,
    fields: [
      {
        name: "queryId",
        label: "Query",
        required: true,
        kind: "text"
      }
    ]
  },
  {
    id: "dismiss-side-query",
    label: "Dismiss side question",
    mutatesState: false,
    fields: [
      {
        name: "queryId",
        label: "Query",
        required: true,
        kind: "text"
      }
    ]
  },
  {
    id: "start-plan-generation",
    label: "Generate Plan",
    mutatesState: false,
    fields: [
      {
        name: "text",
        label: "Planning request",
        required: true,
        kind: "textarea"
      }
    ]
  },
  {
    id: "cancel-plan-generation",
    label: "Cancel Plan generation",
    mutatesState: false,
    fields: [
      {
        name: "operationId",
        label: "Generation",
        required: true,
        kind: "text"
      }
    ]
  },
  {
    id: "dismiss-plan-generation",
    label: "Dismiss Plan generation",
    mutatesState: false,
    fields: [
      {
        name: "operationId",
        label: "Generation",
        required: true,
        kind: "text"
      }
    ]
  },
  {
    id: "revise-plan-proposal",
    label: "Revise Plan",
    mutatesState: false,
    fields: []
  },
  {
    id: "decide-plan-proposal",
    label: "Decide Plan",
    mutatesState: false,
    fields: []
  },
  {
    id: "execute-plan-proposal",
    label: "Execute Plan",
    mutatesState: true,
    fields: []
  },
  {
    id: "start-goal",
    label: "Start Goal",
    mutatesState: false,
    fields: []
  },
  {
    id: "pause-goal",
    label: "Pause Goal",
    mutatesState: false,
    fields: []
  },
  {
    id: "resume-goal",
    label: "Resume Goal",
    mutatesState: false,
    fields: []
  },
  {
    id: "cancel-goal",
    label: "Cancel Goal",
    mutatesState: false,
    fields: []
  },
  {
    id: "remove-conversation-attachment",
    label: "Remove attachment",
    mutatesState: true,
    fields: [
      {
        name: "resourceId",
        label: "Resource",
        required: true,
        kind: "text"
      }
    ]
  },
  {
    id: "refresh-conversation",
    label: "Refresh conversation",
    mutatesState: false,
    fields: []
  },
  {
    id: "cancel-conversation",
    label: "Cancel response",
    mutatesState: false,
    fields: []
  },
  {
    id: "regenerate-conversation",
    label: "Regenerate response",
    mutatesState: true,
    fields: []
  },
  {
    id: "open-workbench",
    label: "Open canonical transcript",
    mutatesState: true,
    fields: []
  }
]

export function buildActions(request: {
  readonly recentSessions: readonly ViewModel["recentSessions"][number][]
  readonly archivedSessions: readonly ViewModel["archivedSessions"][number][]
  readonly modelEndpoints: readonly ModelEndpointRow[]
  readonly commandPalette: ViewModel["commandPalette"]
}): readonly ActionDescriptor[] {
  return [
    BASE_ACTIONS[0] as ActionDescriptor,
    sessionSelectAction(request.recentSessions),
    ...sessionLifecycleActions(
      request.recentSessions,
      request.archivedSessions
    ),
    modelEndpointSelectAction(request.modelEndpoints),
    commandPreviewAction(request.commandPalette),
    commandExecutionAction(request.commandPalette),
    ...BASE_ACTIONS.slice(1)
  ]
}

function sessionLifecycleActions(
  active: readonly ViewModel["recentSessions"][number][],
  archived: readonly ViewModel["archivedSessions"][number][]
): readonly ActionDescriptor[] {
  const all = [...active, ...archived]
  const actions: ActionDescriptor[] = []
  if (all.length > 0) {
    actions.push({
      id: "rename-session",
      label: "Rename chat",
      mutatesState: true,
      fields: [
        sessionReferenceField(all),
        { name: "title", label: "Title", required: true, kind: "text" }
      ]
    })
  }
  if (active.length > 0) {
    actions.push({
      id: "archive-session",
      label: "Archive chat",
      mutatesState: true,
      fields: [sessionReferenceField(active)]
    })
  }
  if (archived.length > 0) {
    actions.push({
      id: "restore-session",
      label: "Restore chat",
      mutatesState: true,
      fields: [sessionReferenceField(archived)]
    })
  }
  return actions
}

function sessionReferenceField(
  sessions: readonly ViewModel["recentSessions"][number][]
): ActionDescriptor["fields"][number] {
  return {
    name: "sessionRef",
    label: "Chat",
    required: true,
    kind: "select",
    options: sessions.map((session) => ({
      value: encodeSessionReference(session),
      label: session.label
    }))
  }
}

function commandPreviewAction(
  palette: ViewModel["commandPalette"]
): ActionDescriptor {
  return {
    id: "preview-command",
    label: "Preview command",
    mutatesState: false,
    fields: commandInvocationFields(palette.rows),
    commandInput: {
      paletteState: palette.state,
      commands: palette.rows
    }
  }
}

function commandExecutionAction(
  palette: ViewModel["commandPalette"]
): ActionDescriptor {
  return {
    id: "execute-command",
    label: "Execute command",
    mutatesState: true,
    fields: commandInvocationFields(palette.rows),
    commandInput: {
      paletteState: palette.state,
      commands: palette.rows
    }
  }
}

function commandInvocationFields(
  commands: readonly ViewModel["commandPalette"]["rows"][number][]
): readonly ActionDescriptor["fields"][number][] {
  return [
    {
      name: "commandId",
      label: "Command",
      required: true,
      kind: commands.length === 0 ? "text" : "select",
      ...(commands.length === 0
        ? {}
        : {
            options: commands.map((command) => ({
              value: command.id,
              label: `${command.title} (${command.id})`
            }))
          })
    }
  ]
}

function sessionSelectAction(
  recentSessions: readonly ViewModel["recentSessions"][number][]
): ActionDescriptor {
  const options = recentSessions.map((session) => ({
    value: session.sessionId,
    label: session.label
  }))
  return {
    id: "select-session",
    label: "Select session",
    mutatesState: true,
    fields: [
      {
        name: "sessionId",
        label: "Session",
        required: true,
        kind: options.length === 0 ? "text" : "select",
        ...(options.length === 0 ? {} : { options })
      }
    ]
  }
}

function modelEndpointSelectAction(
  endpoints: readonly ModelEndpointRow[]
): ActionDescriptor {
  return {
    id: "set-active-model-endpoint",
    label: "Set active provider",
    mutatesState: true,
    fields: [
      {
        name: "endpointId",
        label: "Provider",
        required: true,
        kind: endpoints.length === 0 ? "text" : "select",
        ...(endpoints.length === 0
          ? {}
          : {
              options: endpoints.map((endpoint) => ({
                value: endpoint.id,
                label: modelEndpointLabel(endpoint)
              }))
            })
      }
    ]
  }
}

function modelEndpointLabel(
  endpoint: ModelEndpointRow
): string {
  return `${endpoint.id} (${endpoint.model.id})${endpoint.active ? " active" : ""}`
}
