import type {
  ConnectorCredentialState,
  ConnectorRegistrationState,
  ConnectorSessionState
} from "@wanex/protocol"
import { expectString } from "./codec-common.js"

export function expectConnectorRegistrationState(
  value: unknown
): ConnectorRegistrationState {
  const state = expectString(value, "connector_registration.state")
  if (state !== "active" && state !== "disabled") {
    throw new Error(`invalid connector registration state: ${state}`)
  }
  return state
}

export function expectConnectorCredentialState(value: unknown): ConnectorCredentialState {
  const state = expectString(value, "connector_credential.state")
  if (state !== "active" && state !== "revoked") {
    throw new Error(`invalid connector credential state: ${state}`)
  }
  return state
}

export function expectConnectorSessionState(value: unknown): ConnectorSessionState {
  const state = expectString(value, "connector_session.state")
  if (
    state !== "connecting" &&
    state !== "connected" &&
    state !== "disconnected" &&
    state !== "expired" &&
    state !== "failed"
  ) {
    throw new Error(`invalid connector session state: ${state}`)
  }
  return state
}
