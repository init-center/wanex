import { createHash } from "node:crypto"
import type { StartCodingTurnRequest } from "../types.js"

export function codingStartDigest(request: StartCodingTurnRequest): string {
  const semanticRequest = {
    agentId: request.agentId ?? null,
    content: request.content,
    maxOutputTokens: request.maxOutputTokens ?? null,
    maxSteps: request.maxSteps ?? null,
    modelEndpointId: request.modelEndpointId ?? null,
    proposalTitle: request.proposalTitle ?? null,
    sessionId: request.sessionId ?? null,
    title: request.title ?? null,
  }
  return createHash("sha256")
    .update(canonicalJson(semanticRequest), "utf8")
    .digest("hex")
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`
}
