import type { BackendCommandPortRequest } from "@wanex/assistant/backend";
import type {
  ArchiveSessionRequest,
  ExecuteCommandRequest,
  HomeOptions,
  Layout,
  Mode,
  OpenWorkbenchRequest,
  PreviewCommandInvocationRequest,
  ReadExecutionReferenceRequest,
  ReadSessionTranscriptRequest,
  RenameSessionRequest,
  RendererPreferences,
  RestoreSessionRequest,
  UpdatePreferencesRequest,
} from "../../model.js";
import type { SurfaceCommandRequest, SurfaceError } from "../model.js";
import {
  normalizeSurfaceValidationError,
  optionalDensity,
  optionalNumberField,
  optionalPositiveIntegerField,
  optionalStringField,
  optionalTheme,
  parseRecord,
  parseRequiredPositiveIntegerField,
  parseRequiredStringField,
  parseSurfaceSessionStateRequest,
  parseString,
  SurfaceValidationError,
} from "./common.js";

export function parseSurfaceRequest(
  input: unknown,
):
  | { readonly ok: true; readonly request: SurfaceCommandRequest }
  | { readonly ok: false; readonly error: SurfaceError } {
  try {
    const record = parseRecord(input, "surface request");
    const command = parseString(record.command, "surface request.command");
    const requestIdValue = record.requestId;
    const requestId =
      requestIdValue === undefined
        ? undefined
        : parseString(requestIdValue, "surface request.requestId");
    if (requestId !== undefined && Buffer.byteLength(requestId, "utf8") > 256) {
      throw new SurfaceValidationError(
        "surface request.requestId exceeds 256 bytes",
      );
    }
    return {
      ok: true,
      request: {
        command,
        ...(record.input === undefined ? {} : { input: record.input }),
        ...(requestId === undefined ? {} : { requestId }),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: normalizeSurfaceValidationError(error),
    };
  }
}

export function parseSurfaceHomeOptions(
  input: unknown,
): HomeOptions | undefined {
  if (input === undefined) return undefined;
  const record = parseRecord(input, "readHome input");
  if (!("overview" in record)) return {};
  const overviewRecord = parseRecord(record.overview, "readHome input.overview");
  const overview: NonNullable<HomeOptions["overview"]> = {
    ...optionalNumberField(overviewRecord, "now", "readHome input.overview"),
    ...optionalPositiveIntegerField(
      overviewRecord,
      "recentSessionLimit",
      "readHome input.overview",
    ),
  };
  return { overview };
}

export function parseSurfaceLayout(input: unknown): Layout {
  const layout = parseRequiredStringField(input, "layout", "setLayout input");
  if (layout === "single" || layout === "split" || layout === "diagnostics") {
    return layout;
  }
  throw new SurfaceValidationError("setLayout input.layout is not supported");
}

export function parseSurfaceSessionSelector(input: unknown): {
  readonly sessionId: string;
} {
  return {
    sessionId: parseRequiredStringField(
      input,
      "sessionId",
      "selectSession input",
    ),
  };
}

export function parseSurfaceRenameSessionRequest(
  input: unknown,
): RenameSessionRequest {
  const record = parseRecord(input, "renameSession input");
  return {
    sessionId: parseString(record.sessionId, "renameSession input.sessionId"),
    title: parseString(record.title, "renameSession input.title"),
    expectedRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRevision",
      "renameSession input",
    ),
  };
}

export function parseSurfaceArchiveSessionRequest(
  input: unknown,
): ArchiveSessionRequest {
  return parseSurfaceSessionStateRequest(input, "archiveSession");
}

export function parseSurfaceRestoreSessionRequest(
  input: unknown,
): RestoreSessionRequest {
  return parseSurfaceSessionStateRequest(input, "restoreSession");
}

export function parseSurfaceMode(input: unknown): Mode {
  const mode = parseRequiredStringField(input, "mode", "setMode input");
  if (mode === "chat" || mode === "workbench" || mode === "diagnostics") {
    return mode;
  }
  throw new SurfaceValidationError("setMode input.mode is not supported");
}

export function parseSurfacePreferencesPatch(
  input: unknown,
): UpdatePreferencesRequest {
  const record = parseRecord(input, "updatePreferences input");
  const preferences = parseRecord(
    record.preferences,
    "updatePreferences input.preferences",
  );
  const patch: Partial<RendererPreferences> = {
    ...optionalTheme(preferences),
    ...optionalDensity(preferences),
  };
  return { preferences: patch };
}

export function parseSurfaceModelEndpointSelector(input: unknown): {
  readonly endpointId: string;
} {
  return {
    endpointId: parseRequiredStringField(
      input,
      "endpointId",
      "setActiveModelEndpoint input",
    ),
  };
}

export function parseSurfaceAssistantCommandRequest(
  input: unknown,
): BackendCommandPortRequest {
  const record = parseRecord(input, "dispatchAssistantCommand input");
  const command = parseString(
    record.command,
    "dispatchAssistantCommand input.command",
  );
  return {
    command,
    ...(record.input === undefined ? {} : { input: record.input }),
  };
}

export function parseSurfaceCommandInvocationPreviewRequest(
  input: unknown,
): PreviewCommandInvocationRequest {
  const record = parseRecord(input, "previewAssistantCommandInvocation input");
  return {
    commandId: parseString(
      record.commandId,
      "previewAssistantCommandInvocation input.commandId",
    ),
    ...(record.input === undefined ? {} : { input: record.input }),
  };
}

export function parseSurfaceCommandExecutionRequest(
  input: unknown,
): ExecuteCommandRequest {
  const record = parseRecord(input, "executeAssistantCommand input");
  return {
    commandId: parseString(
      record.commandId,
      "executeAssistantCommand input.commandId",
    ),
    ...(record.input === undefined ? {} : { input: record.input }),
  };
}

export function parseSurfaceExecutionReferenceRequest(
  input: unknown,
): ReadExecutionReferenceRequest {
  const record = parseRecord(input, "readExecutionReference input");
  return {
    kind: parseString(record.kind, "readExecutionReference input.kind"),
    id: parseString(record.id, "readExecutionReference input.id"),
  };
}

export function parseSurfaceJsonBody(input: unknown): string {
  if (typeof input === "string") return input;
  return parseRequiredStringField(
    input,
    "body",
    "dispatchAssistantCommandJson input",
  );
}

export function parseSurfaceOpenWorkbenchRequest(
  input: unknown,
): OpenWorkbenchRequest | undefined {
  if (input === undefined) return undefined;
  const record = parseRecord(input, "openWorkbench input");
  return {
    ...optionalStringField(record, "sessionId", "openWorkbench input"),
  };
}

export function parseSurfaceReadSessionTranscriptRequest(
  input: unknown,
): ReadSessionTranscriptRequest | undefined {
  if (input === undefined) return undefined;
  const record = parseRecord(input, "readSessionTranscript input");
  return {
    ...optionalStringField(record, "sessionId", "readSessionTranscript input"),
    ...optionalStringField(record, "cursor", "readSessionTranscript input"),
    ...optionalPositiveIntegerField(
      record,
      "limit",
      "readSessionTranscript input",
    ),
  };
}
