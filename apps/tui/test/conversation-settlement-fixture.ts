import type { SettleSessionTurnReceipt } from "@wanex/protocol"
import {
  createStorageHandle,
  type CoreStore,
  type StorageHandle
} from "@wanex/storage"

export interface TuiConversationSettlementFixture {
  readonly storage: {
    readonly kind: "injected"
    readonly handle: Pick<StorageHandle, "core" | "transport">
  }
  readonly settlements: TuiConversationSettlementObserver
  dispose(): Promise<void>
}

export interface TuiConversationSettlementObserver {
  waitForJob(jobId: string): Promise<SettleSessionTurnReceipt>
  waitForSession(sessionId: string): Promise<SettleSessionTurnReceipt>
}

interface SettlementWaiter {
  readonly jobId?: string
  readonly sessionId?: string
  readonly resolve: (receipt: SettleSessionTurnReceipt) => void
}

export function createTuiConversationSettlementFixture(options: {
  readonly storeDir: string
  readonly serviceBin: string
}): TuiConversationSettlementFixture {
  const handle = createStorageHandle({
    kind: "local-system-service",
    mode: "persistent",
    storeDir: options.storeDir,
    serviceBin: options.serviceBin
  })
  const settledByJob = new Map<string, SettleSessionTurnReceipt>()
  const settledBySession = new Map<string, SettleSessionTurnReceipt>()
  const waiters = new Set<SettlementWaiter>()

  const core = new Proxy(handle.core, {
    get(target, property) {
      if (property === "settleSessionTurn") {
        return async (
          request: Parameters<CoreStore["settleSessionTurn"]>[0]
        ) => {
          const receipt = await target.settleSessionTurn(request)
          settledByJob.set(receipt.job.id, receipt)
          settledBySession.set(receipt.turn.sessionId, receipt)
          for (const waiter of waiters) {
            if (!matchesSettlement(waiter, receipt)) {
              continue
            }
            waiters.delete(waiter)
            waiter.resolve(receipt)
          }
          return receipt
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === "function" ? value.bind(target) : value
    }
  })

  return {
    storage: {
      kind: "injected",
      handle: {
        core,
        transport: handle.transport
      }
    },
    settlements: {
      waitForJob(jobId) {
        const normalized = normalizeRequiredId(jobId, "jobId")
        const existing = settledByJob.get(normalized)
        return existing === undefined
          ? waitForSettlement({ jobId: normalized })
          : Promise.resolve(existing)
      },
      waitForSession(sessionId) {
        const normalized = normalizeRequiredId(sessionId, "sessionId")
        const existing = settledBySession.get(normalized)
        return existing === undefined
          ? waitForSettlement({ sessionId: normalized })
          : Promise.resolve(existing)
      }
    },
    dispose: () => handle.dispose()
  }

  function waitForSettlement(
    filter: Pick<SettlementWaiter, "jobId" | "sessionId">
  ): Promise<SettleSessionTurnReceipt> {
    return new Promise((resolve) => {
      waiters.add({ ...filter, resolve })
    })
  }
}

function matchesSettlement(
  waiter: SettlementWaiter,
  receipt: SettleSessionTurnReceipt
): boolean {
  return (
    (waiter.jobId === undefined || receipt.job.id === waiter.jobId) &&
    (waiter.sessionId === undefined ||
      receipt.turn.sessionId === waiter.sessionId)
  )
}

function normalizeRequiredId(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`conversation settlement ${label} must not be empty`)
  }
  return normalized
}
