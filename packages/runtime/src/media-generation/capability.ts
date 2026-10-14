import { randomUUID } from "node:crypto"
import { MediaGenerationAdapterRegistry } from "../provider/media-binding.js"
import { WanexMediaGenerationRuntime } from "./runtime.js"
import type {
  MediaGenerationCapability,
  MediaGenerationRuntimeOptions
} from "./types.js"

export function createMediaGenerationCapability(
  options: Pick<MediaGenerationRuntimeOptions,
    "adapters" | "maxOutputBytes" | "pollInitialDelayMs" |
    "pollMaxDelayMs" | "maxConsecutivePollFailures"
  > & { readonly workerCount?: number }
): MediaGenerationCapability {
  const adapters = [...options.adapters]
  const { maxOutputBytes, pollInitialDelayMs, pollMaxDelayMs, maxConsecutivePollFailures } = options
  const registry = new MediaGenerationAdapterRegistry(adapters)
  const workerCount = options.workerCount ?? 1
  if (!Number.isSafeInteger(workerCount) || workerCount < 1) {
    throw new Error("media generation workerCount must be a positive safe integer")
  }
  return {
    supports: registry.supports.bind(registry),
    createWorkers(context) {
      return Array.from({ length: registry.size === 0 ? 0 : workerCount }, (_, index) =>
        new WanexMediaGenerationRuntime({
          ...context,
          adapters,
          workerId: `runtime_host_media_generation_worker_${index}_${randomUUID()}`,
          ...(maxOutputBytes === undefined ? {} : { maxOutputBytes }),
          ...(pollInitialDelayMs === undefined ? {} : { pollInitialDelayMs }),
          ...(pollMaxDelayMs === undefined ? {} : { pollMaxDelayMs }),
          ...(maxConsecutivePollFailures === undefined ? {} : { maxConsecutivePollFailures })
        })
      )
    }
  }
}
