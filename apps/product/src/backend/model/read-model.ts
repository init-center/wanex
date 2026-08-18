import type {
  WanexAppExecutionReferenceCommands,
  WanexAppExecutionReferenceReadResult,
  WanexAppReadExecutionReferenceRequest,
  WanexAppReadRecentSessionsRequest,
  WanexAppReadModelCommands,
  WanexAppRecentSessionRow,
  WanexAppRecentSessionsReadModel,
  WanexAppSessionInputProvenanceKind,
  WanexAppSessionInputProvenanceReadModel,
  WanexAppSessionInputProvenanceRow,
  WanexAppSessionTranscriptPart,
  WanexAppSessionTranscriptReadModel,
  WanexAppSessionTranscriptRole,
  WanexAppSessionTranscriptRow,
  WanexAppSessionTranscriptRowKind
} from "@wanex/app"

export interface BackendReadModelCommands
  extends WanexAppReadModelCommands,
    WanexAppExecutionReferenceCommands {}

export type BackendReadExecutionReferenceRequest =
  WanexAppReadExecutionReferenceRequest
export type BackendExecutionReferenceReadResult =
  WanexAppExecutionReferenceReadResult

export type BackendReadSessionInputProvenanceRequest =
  Parameters<WanexAppReadModelCommands["readSessionInputProvenance"]>[0]
export type BackendReadSessionTranscriptRequest =
  Parameters<WanexAppReadModelCommands["readSessionTranscript"]>[0]
export type BackendReadRecentSessionsRequest =
  WanexAppReadRecentSessionsRequest
export type BackendRecentSessionsReadModel =
  WanexAppRecentSessionsReadModel
export type BackendRecentSessionRow =
  WanexAppRecentSessionRow
export type BackendSessionInputProvenanceKind =
  WanexAppSessionInputProvenanceKind
export type BackendSessionInputProvenanceReadModel =
  WanexAppSessionInputProvenanceReadModel
export type BackendSessionInputProvenanceRow =
  WanexAppSessionInputProvenanceRow
export type BackendSessionTranscriptReadModel =
  WanexAppSessionTranscriptReadModel
export type BackendSessionTranscriptRow =
  WanexAppSessionTranscriptRow
export type BackendSessionTranscriptRowKind =
  WanexAppSessionTranscriptRowKind
export type BackendSessionTranscriptRole =
  WanexAppSessionTranscriptRole
export type BackendSessionTranscriptPart =
  WanexAppSessionTranscriptPart
