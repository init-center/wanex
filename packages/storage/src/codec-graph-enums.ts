import type {
  DelegationDependencyKind,
  DelegationGraphState,
  DelegationNodeKind,
  DelegationNodeState
} from "@wanex/protocol"
import { expectString } from "./codec-common.js"

export function expectDelegationGraphState(value: unknown): DelegationGraphState {
  const state = expectString(value, "delegation_graph.state")
  if (
    state !== "open" &&
    state !== "running" &&
    state !== "succeeded" &&
    state !== "failed" &&
    state !== "cancelled"
  ) {
    throw new Error(`invalid delegation graph state: ${state}`)
  }
  return state
}

export function expectDelegationNodeKind(value: unknown): DelegationNodeKind {
  const kind = expectString(value, "delegation_graph_node.kind")
  if (
    kind !== "agent_task" &&
    kind !== "workspace_task" &&
    kind !== "tool_task" &&
    kind !== "aggregation"
  ) {
    throw new Error(`invalid delegation node kind: ${kind}`)
  }
  return kind
}

export function expectDelegationNodeState(value: unknown): DelegationNodeState {
  const state = expectString(value, "delegation_graph_node.state")
  if (
    state !== "pending" &&
    state !== "ready" &&
    state !== "running" &&
    state !== "succeeded" &&
    state !== "failed" &&
    state !== "cancelled" &&
    state !== "skipped"
  ) {
    throw new Error(`invalid delegation node state: ${state}`)
  }
  return state
}

export function expectDelegationDependencyKind(
  value: unknown
): DelegationDependencyKind {
  const kind = expectString(value, "delegation_graph_dependency.kind")
  if (kind !== "after_success" && kind !== "after_terminal") {
    throw new Error(`invalid delegation dependency kind: ${kind}`)
  }
  return kind
}
