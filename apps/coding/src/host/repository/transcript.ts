import type { SessionMessageRecord } from "@wanex/protocol";
import type { CoreStore } from "@wanex/storage";
import { sessionBelongsToCodingRepository } from "../session-scope.js";
import type {
  CodingTranscriptWindow,
  ReadCodingTranscriptRequest,
} from "../types.js";

const MAX_HOST_TRANSCRIPT_WINDOW = 101;

export async function readCodingTranscript(request: {
  readonly storage: CoreStore;
  readonly repositoryId: string;
  readonly page: ReadCodingTranscriptRequest;
}): Promise<CodingTranscriptWindow | null> {
  assertLimit(request.page.limit);
  const session = await request.storage.getSession(request.page.sessionId);
  if (
    session === null ||
    !sessionBelongsToCodingRepository(session, request.repositoryId)
  ) {
    return null;
  }
  const records = await request.storage.listSessionMessages({
    sessionId: request.page.sessionId,
    ...(request.page.beforeSequence === undefined
      ? {}
      : { beforeSequence: request.page.beforeSequence }),
    limit: request.page.limit,
  });
  return projectWindow(records, request.page.limit);
}

function projectWindow(
  records: readonly SessionMessageRecord[],
  requestedLimit: number,
): CodingTranscriptWindow {
  const hasMore = records.length === requestedLimit;
  return {
    messages: records,
    hasMore,
    ...(hasMore && records[0] !== undefined
      ? { continuation: records[0].sequence }
      : {}),
  };
}

function assertLimit(limit: number): void {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_HOST_TRANSCRIPT_WINDOW
  ) {
    throw new Error(
      `Coding Host transcript limit must be between 1 and ${MAX_HOST_TRANSCRIPT_WINDOW}`,
    );
  }
}
