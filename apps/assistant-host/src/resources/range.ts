import { LocalResourceDeliveryError } from "./model.js"

export interface LocalResourceByteRange {
  readonly start: number
  readonly end: number
}

export function parseLocalResourceRange(
  value: string | undefined,
  totalSizeBytes: number
): LocalResourceByteRange | undefined {
  if (value === undefined) return undefined
  const match = /^bytes=(.+)$/i.exec(value.trim())
  if (match === null || match[1] === undefined || match[1].includes(",")) {
    throw invalidRange(totalSizeBytes)
  }
  const specification = match[1].trim()
  const separator = specification.indexOf("-")
  if (separator < 0 || specification.indexOf("-", separator + 1) >= 0) {
    throw invalidRange(totalSizeBytes)
  }

  const startText = specification.slice(0, separator).trim()
  const endText = specification.slice(separator + 1).trim()
  if (startText.length === 0) {
    const suffixLength = parseSafeInteger(endText, totalSizeBytes)
    if (suffixLength <= 0) throw invalidRange(totalSizeBytes)
    return {
      start: Math.max(0, totalSizeBytes - suffixLength),
      end: totalSizeBytes - 1
    }
  }

  const start = parseSafeInteger(startText, totalSizeBytes)
  if (start >= totalSizeBytes) throw invalidRange(totalSizeBytes)
  if (endText.length === 0) {
    return { start, end: totalSizeBytes - 1 }
  }
  const requestedEnd = parseSafeInteger(endText, totalSizeBytes)
  if (requestedEnd < start) throw invalidRange(totalSizeBytes)
  return {
    start,
    end: Math.min(requestedEnd, totalSizeBytes - 1)
  }
}

function parseSafeInteger(value: string, totalSizeBytes: number): number {
  if (!/^\d+$/.test(value)) throw invalidRange(totalSizeBytes)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw invalidRange(totalSizeBytes)
  return parsed
}

function invalidRange(totalSizeBytes: number): LocalResourceDeliveryError {
  return new LocalResourceDeliveryError(
    416,
    "resource_range_not_satisfiable",
    "resource Range must contain exactly one satisfiable byte range",
    totalSizeBytes
  )
}
