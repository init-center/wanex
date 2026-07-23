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

export interface ProductAppBackendReadModelCommands
  extends WanexAppReadModelCommands,
    WanexAppExecutionReferenceCommands {}

export type ProductAppBackendReadExecutionReferenceRequest =
  WanexAppReadExecutionReferenceRequest
export type ProductAppBackendExecutionReferenceReadResult =
  WanexAppExecutionReferenceReadResult

export type ProductAppBackendReadSessionInputProvenanceRequest =
  Parameters<WanexAppReadModelCommands["readSessionInputProvenance"]>[0]
export type ProductAppBackendReadSessionTranscriptRequest =
  Parameters<WanexAppReadModelCommands["readSessionTranscript"]>[0]
export type ProductAppBackendReadRecentSessionsRequest =
  WanexAppReadRecentSessionsRequest
export type ProductAppBackendRecentSessionsReadModel =
  WanexAppRecentSessionsReadModel
export type ProductAppBackendRecentSessionRow =
  WanexAppRecentSessionRow
export type ProductAppBackendSessionInputProvenanceKind =
  WanexAppSessionInputProvenanceKind
export type ProductAppBackendSessionInputProvenanceReadModel =
  WanexAppSessionInputProvenanceReadModel
export type ProductAppBackendSessionInputProvenanceRow =
  WanexAppSessionInputProvenanceRow
export type ProductAppBackendSessionTranscriptReadModel =
  WanexAppSessionTranscriptReadModel
export type ProductAppBackendSessionTranscriptRow =
  WanexAppSessionTranscriptRow
export type ProductAppBackendSessionTranscriptRowKind =
  WanexAppSessionTranscriptRowKind
export type ProductAppBackendSessionTranscriptRole =
  WanexAppSessionTranscriptRole
export type ProductAppBackendSessionTranscriptPart =
  WanexAppSessionTranscriptPart
