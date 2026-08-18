import type { StartGoalRequest } from "@wanex/product/surface"

export type TuiLineCommand =
  | {
      readonly kind: "command"
      readonly name: "help" | "commands" | "overview" | "refresh" | "quit"
    }
  | { readonly kind: "command"; readonly name: "ask"; readonly text: string }
  | { readonly kind: "command"; readonly name: "steer"; readonly text: string }
  | { readonly kind: "command"; readonly name: "btw"; readonly question: string }
  | { readonly kind: "command"; readonly name: "btw-cancel" | "btw-dismiss" }
  | { readonly kind: "command"; readonly name: "plan"; readonly text: string }
  | {
      readonly kind: "command"
      readonly name:
        | "plan-show"
        | "plan-cancel"
        | "plan-dismiss"
        | "plan-approve"
        | "plan-execute"
    }
  | {
      readonly kind: "command"
      readonly name: "plan-reject" | "plan-withdraw"
      readonly reason?: string
    }
  | { readonly kind: "command"; readonly name: "goal" }
  | {
      readonly kind: "command"
      readonly name: "goal-start"
      readonly input: StartGoalRequest
    }
  | {
      readonly kind: "command"
      readonly name: "goal-pause" | "goal-resume"
      readonly reason?: string
    }
  | {
      readonly kind: "command"
      readonly name: "goal-cancel"
      readonly reason: string
    }
  | { readonly kind: "command"; readonly name: "attach"; readonly path: string }
  | {
      readonly kind: "command"
      readonly name: "select"
      readonly sessionId: string
    }
  | {
      readonly kind: "command"
      readonly name: "model"
      readonly endpointId: string
    }
  | {
      readonly kind: "command"
      readonly name: "workbench"
      readonly sessionId?: string
    }
  | {
      readonly kind: "command"
      readonly name: "operation" | "regenerate"
      readonly sessionId?: string
    }
  | { readonly kind: "command"; readonly name: "cancel"; readonly reason?: string }
  | {
      readonly kind: "command"
      readonly name: "approval-approve" | "approval-deny"
      readonly approvalId: string
      readonly reason: string
    }
  | {
      readonly kind: "command"
      readonly name: "preview" | "execute"
      readonly commandId: string
      readonly input?: unknown
    }
  | { readonly kind: "command"; readonly name: "events"; readonly limit?: number }
  | { readonly kind: "command"; readonly name: "execution"; readonly jobId: string }
  | { readonly kind: "error"; readonly message: string }
