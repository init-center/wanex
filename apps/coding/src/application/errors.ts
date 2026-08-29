export type CodingApplicationErrorCode =
  | "application_closed"
  | "project_unavailable"
  | "turn_unavailable"
  | "invalid_request"

export class CodingApplicationError extends Error {
  readonly code: CodingApplicationErrorCode

  constructor(code: CodingApplicationErrorCode, message: string) {
    super(message)
    this.name = "CodingApplicationError"
    this.code = code
  }
}
