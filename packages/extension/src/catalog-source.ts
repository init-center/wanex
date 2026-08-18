import type {
  AppExtensionCatalogController,
  AppExtensionCatalogGeneration,
  AppExtensionCatalogListener,
  AppExtensionCatalogPublication,
  AppExtensionCatalogSource
} from "./types-catalog.js"
import { immutableAppExtensionSnapshot } from "./catalog-snapshot.js"

const MAX_REVISION_LENGTH = 256

export function createAppExtensionCatalog(
  initial: AppExtensionCatalogGeneration
): AppExtensionCatalogController {
  let current = normalizeGeneration(initial)
  const listeners = new Set<AppExtensionCatalogListener>()
  const source: AppExtensionCatalogSource = Object.freeze({
    current() {
      return current
    },
    subscribe(listener: AppExtensionCatalogListener) {
      if (typeof listener !== "function") {
        throw new Error("extension catalog listener must be a function")
      }
      listeners.add(listener)
      let subscribed = true
      return () => {
        if (subscribed) {
          subscribed = false
          listeners.delete(listener)
        }
      }
    }
  })

  return Object.freeze({
    source,
    publish(
      generation: AppExtensionCatalogGeneration
    ): AppExtensionCatalogPublication {
      const revision = normalizeRevision(generation.revision)
      if (revision === current.revision) {
        return { changed: false, listenerErrors: [] }
      }
      const next = normalizeGeneration(generation, revision)
      current = next
      const listenerErrors: unknown[] = []
      for (const listener of [...listeners]) {
        try {
          listener(next)
        } catch (error) {
          listenerErrors.push(error)
        }
      }
      return {
        changed: true,
        listenerErrors: Object.freeze(listenerErrors)
      }
    }
  })
}

export function createStaticAppExtensionCatalogSource(
  generation: AppExtensionCatalogGeneration
): AppExtensionCatalogSource {
  return createAppExtensionCatalog(generation).source
}

function normalizeGeneration(
  generation: AppExtensionCatalogGeneration,
  normalizedRevision?: string
): AppExtensionCatalogGeneration {
  const revision = normalizedRevision ?? normalizeRevision(generation.revision)
  if (
    generation.snapshot === null ||
    typeof generation.snapshot !== "object"
  ) {
    throw new Error("extension catalog snapshot must be an object")
  }
  return Object.freeze({
    revision,
    snapshot: immutableAppExtensionSnapshot(generation.snapshot)
  })
}

function normalizeRevision(revision: string): string {
  if (
    typeof revision !== "string" ||
    revision.length === 0 ||
    revision.length > MAX_REVISION_LENGTH ||
    revision !== revision.trim() ||
    /[\u0000-\u001f\u007f]/u.test(revision)
  ) {
    throw new Error(
      `extension catalog revision must contain 1 to ${MAX_REVISION_LENGTH} trimmed printable characters`
    )
  }
  return revision
}
