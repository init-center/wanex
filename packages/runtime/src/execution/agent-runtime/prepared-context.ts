import type {
  SessionTurnExecutionBinding,
  SessionTurnRecord,
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { PreparedSessionTurnContext } from "./types.js"

export interface PreparedSessionTurnContextBinding {
  readonly binding: SessionTurnExecutionBinding
  readonly context: PreparedSessionTurnContext
}

export function settlePreparedSessionTurnContext(
  prepared: PreparedSessionTurnContextBinding,
  turn: Pick<SessionTurnRecord, "id" | "executionBinding">,
  expectedTurnId: string
): void {
  if (
    turn.id === expectedTurnId &&
    turn.executionBinding.digest === prepared.binding.digest
  ) {
    prepared.context.commit()
  } else {
    prepared.context.rollback()
  }
}

export async function reconcilePreparedSessionTurnContext(
  storage: Pick<CoreStore, "getSessionTurn">,
  prepared: PreparedSessionTurnContextBinding,
  turnId: string
): Promise<void> {
  try {
    const turn = await storage.getSessionTurn(turnId)
    if (turn === null) {
      prepared.context.rollback()
      return
    }
    settlePreparedSessionTurnContext(prepared, turn, turnId)
  } catch {
    // Ambiguous persistence retains the live context until Host shutdown.
  }
}
