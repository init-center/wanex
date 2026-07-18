import type {
  ConnectorAdapterPackagingValidationIssue,
  ConnectorAdapterPackagingValidationIssueCode
} from "./packaging-types.js"

export function connectorPackagingIssue(
  code: ConnectorAdapterPackagingValidationIssueCode,
  message: string,
  dependency?: string
): ConnectorAdapterPackagingValidationIssue {
  return {
    code,
    message,
    ...(dependency === undefined ? {} : { dependency })
  }
}
