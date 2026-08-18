import type {
  AppExtensionContribution,
  AppExtensionResolvedSnapshot
} from "./types.js"

const DOMAIN_KEYS = [
  "instruction",
  "skill",
  "command",
  "agent",
  "tool",
  "provider_catalog",
  "lifecycle_hook"
] as const

export function immutableAppExtensionSnapshot(
  snapshot: AppExtensionResolvedSnapshot
): AppExtensionResolvedSnapshot {
  let cloned: AppExtensionResolvedSnapshot
  try {
    cloned = structuredClone(snapshot)
  } catch {
    throw new Error(
      "extension catalog snapshot must contain structured-cloneable data"
    )
  }
  for (const key of DOMAIN_KEYS) {
    const domain = cloned.byDomain[key] as unknown as {
      byId: ReadonlyMap<string, AppExtensionContribution>
    }
    domain.byId = new ImmutableMapView(domain.byId)
  }
  return deepFreeze(cloned)
}

class ImmutableMapView<Key, Value> implements ReadonlyMap<Key, Value> {
  readonly #values: ReadonlyMap<Key, Value>

  constructor(values: ReadonlyMap<Key, Value>) {
    this.#values = values
    Object.freeze(this)
  }

  get size(): number {
    return this.#values.size
  }

  get [Symbol.toStringTag](): string {
    return "Map"
  }

  get(key: Key): Value | undefined {
    return this.#values.get(key)
  }

  has(key: Key): boolean {
    return this.#values.has(key)
  }

  entries(): MapIterator<[Key, Value]> {
    return this.#values.entries()
  }

  keys(): MapIterator<Key> {
    return this.#values.keys()
  }

  values(): MapIterator<Value> {
    return this.#values.values()
  }

  forEach(
    callbackfn: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void,
    thisArg?: unknown
  ): void {
    for (const [key, value] of this.#values) {
      callbackfn.call(thisArg, value, key, this)
    }
  }

  [Symbol.iterator](): MapIterator<[Key, Value]> {
    return this.entries()
  }
}

function deepFreeze<Value>(value: Value, seen = new WeakSet<object>()): Value {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value
  }
  seen.add(value)
  for (const child of Object.values(value)) {
    deepFreeze(child, seen)
  }
  return Object.freeze(value)
}
