export function bindStoreFacet<T extends object>(facet: object): T {
  const bound: Record<string, unknown> = {}
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(facet))) {
    if (name === "constructor") {
      continue
    }
    const method = (facet as Record<string, unknown>)[name]
    if (typeof method === "function") {
      bound[name] = method.bind(facet)
    }
  }
  return bound as T
}
