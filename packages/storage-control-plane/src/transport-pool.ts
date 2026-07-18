import type { StorageWireTransport } from "@wanex/storage"
import type { RemoteStorageAuthenticatedSubject } from "./remote-storage.js"

export interface StorageWireTransportPoolOptions<
  TSubject extends RemoteStorageAuthenticatedSubject = RemoteStorageAuthenticatedSubject
> {
  readonly keyForSubject?: (subject: TSubject) => string
  readonly createTransport: (
    subject: TSubject
  ) => StorageWireTransport | Promise<StorageWireTransport>
}

export interface StorageWireTransportPool<
  TSubject extends RemoteStorageAuthenticatedSubject = RemoteStorageAuthenticatedSubject
> {
  resolveStorageWireTransport(subject: TSubject): Promise<StorageWireTransport>
  close(): Promise<void>
}

export function createStorageWireTransportPool<
  TSubject extends RemoteStorageAuthenticatedSubject = RemoteStorageAuthenticatedSubject
>(
  options: StorageWireTransportPoolOptions<TSubject>
): StorageWireTransportPool<TSubject> {
  const transports = new Map<string, Promise<StorageWireTransport>>()

  const resolveStorageWireTransport = async (
    subject: TSubject
  ): Promise<StorageWireTransport> => {
    const key = normalizeTransportPoolKey(
      options.keyForSubject?.(subject) ?? subject.subjectId
    )
    const existing = transports.get(key)
    if (existing !== undefined) {
      return await existing
    }
    const created = Promise.resolve(options.createTransport(subject)).catch(
      (error: unknown) => {
        transports.delete(key)
        throw error
      }
    )
    transports.set(key, created)
    return await created
  }

  return {
    resolveStorageWireTransport,
    async close() {
      const settled = await Promise.allSettled(transports.values())
      transports.clear()
      await Promise.all(
        settled.map(async (result) => {
          if (result.status === "fulfilled") {
            await result.value.close?.()
          }
        })
      )
    }
  }
}

function normalizeTransportPoolKey(key: string): string {
  if (key.length === 0) {
    throw new Error("storage transport pool key must not be empty")
  }
  return key
}
