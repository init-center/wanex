import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  SettleSessionTurnReceipt
} from "@wanex/protocol"
import {
  createStorageHandle,
  type CoreStore,
  type StorageHandle
} from "@wanex/storage"
import type { ConversationPresentationPart } from "@wanex/product"

export interface ConversationSettlementFixture {
  readonly storeDir: string
  readonly storage: {
    readonly kind: "injected"
    readonly handle: Pick<StorageHandle, "core" | "transport">
  }
  readonly settlements: ConversationSettlementObserver
  dispose(): Promise<void>
}

export interface ConversationSettlementObserver {
  readonly storage: CoreStore
  waitForJob(jobId: string): Promise<SettleSessionTurnReceipt>
  waitForNext(
    filter?: ConversationSettlementFilter
  ): Promise<SettleSessionTurnReceipt>
}

export interface ConversationSettlementFilter {
  readonly sessionId?: string
  readonly jobId?: string
}

export function productConversationRowText(row: {
  readonly parts: readonly ConversationPresentationPart[]
}): string {
  return row.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
}

export function productConversationRowResources(row: {
  readonly parts: readonly ConversationPresentationPart[]
}) {
  return row.parts.filter(
    (part): part is Extract<
      ConversationPresentationPart,
      { readonly type: "resource" }
    > => part.type === "resource"
  )
}

interface SettlementWaiter {
  readonly filter: ConversationSettlementFilter
  readonly resolve: (receipt: SettleSessionTurnReceipt) => void
}

export async function createConversationSettlementFixture(options: {
  readonly serviceBin: string
  readonly prefix: string
}): Promise<ConversationSettlementFixture> {
  const storeDir = await mkdtemp(join(tmpdir(), options.prefix))
  const handle = createStorageHandle({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin: options.serviceBin
  })

  try {
    await handle.core.doctor()
  } catch (error) {
    await handle.dispose()
    await rm(storeDir, { recursive: true, force: true })
    throw error
  }

  const settlements = observeConversationSettlementStorage(handle.core)
  let disposed = false
  return {
    storeDir,
    storage: {
      kind: "injected",
      handle: {
        core: settlements.storage,
        transport: handle.transport
      }
    },
    settlements,
    async dispose() {
      if (disposed) {
        return
      }
      disposed = true
      await handle.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
}

export function observeConversationSettlementStorage(
  storage: CoreStore
): ConversationSettlementObserver {
  const settled: SettleSessionTurnReceipt[] = []
  const waiters = new Set<SettlementWaiter>()

  const observed = new Proxy(storage, {
    get(target, property) {
      if (property === "settleSessionTurn") {
        return async (
          request: Parameters<CoreStore["settleSessionTurn"]>[0]
        ) => {
          const receipt = await target.settleSessionTurn(request)
          settled.push(receipt)
          for (const waiter of waiters) {
            if (!matchesSettlement(receipt, waiter.filter)) {
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
    storage: observed,
    waitForJob(jobId) {
      const normalized = normalizeRequiredId(jobId, "jobId")
      const existing = settled.find(
        (receipt) => receipt.job.id === normalized
      )
      return existing === undefined
        ? waitForNext({ jobId: normalized })
        : Promise.resolve(existing)
    },
    waitForNext
  }

  function waitForNext(
    filter: ConversationSettlementFilter = {}
  ): Promise<SettleSessionTurnReceipt> {
    const normalized = normalizeFilter(filter)
    return new Promise((resolve) => {
      waiters.add({ filter: normalized, resolve })
    })
  }
}

function matchesSettlement(
  receipt: SettleSessionTurnReceipt,
  filter: ConversationSettlementFilter
): boolean {
  return (
    (filter.sessionId === undefined ||
      receipt.turn.sessionId === filter.sessionId) &&
    (filter.jobId === undefined || receipt.job.id === filter.jobId)
  )
}

function normalizeFilter(
  filter: ConversationSettlementFilter
): ConversationSettlementFilter {
  return {
    ...(filter.sessionId === undefined
      ? {}
      : {
          sessionId: normalizeRequiredId(filter.sessionId, "sessionId")
        }),
    ...(filter.jobId === undefined
      ? {}
      : { jobId: normalizeRequiredId(filter.jobId, "jobId") })
  }
}

function normalizeRequiredId(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`conversation settlement ${label} must not be empty`)
  }
  return normalized
}
