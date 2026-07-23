import type { JsonValue } from "@wanex/protocol"

export type WorkspaceProgramDecision =
  | {
      readonly status: "allow"
      readonly executable: string
      readonly reason: string
    }
  | {
      readonly status: "deny"
      readonly reason: string
    }

export interface WorkspaceProgramPolicy {
  snapshot(): JsonValue
  authorize(request: {
    readonly program: string
    readonly args: readonly string[]
  }): WorkspaceProgramDecision
}

export class ExactWorkspaceProgramPolicy implements WorkspaceProgramPolicy {
  private readonly programs: ReadonlyMap<string, string>

  constructor(programs: Readonly<Record<string, string>>) {
    const entries = Object.entries(programs)
    if (entries.length === 0) {
      throw new Error("workspace program policy must allow at least one program")
    }
    for (const [alias, executable] of entries) {
      if (
        !/^[A-Za-z0-9_.-]{1,64}$/u.test(alias) ||
        executable.length === 0 ||
        executable.includes("\0")
      ) {
        throw new Error(`invalid workspace allowed program: ${alias}`)
      }
    }
    this.programs = new Map(entries)
  }

  authorize(request: {
    readonly program: string
    readonly args: readonly string[]
  }): WorkspaceProgramDecision {
    const executable = this.programs.get(request.program)
    return executable === undefined
      ? {
          status: "deny",
          reason: `workspace program is not allowed: ${request.program}`
        }
      : {
          status: "allow",
          executable,
          reason: `workspace program alias allowed: ${request.program}`
      }
  }

  snapshot(): JsonValue {
    return {
      kind: "exact",
      programs: Object.fromEntries(
        [...this.programs.entries()].sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0
        )
      )
    }
  }
}
