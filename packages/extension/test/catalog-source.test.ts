import { describe, expect, it, vi } from "vitest"
import {
  createAppExtensionCatalog,
  createStaticAppExtensionCatalogSource,
  resolveAppExtensionContributions
} from "../src/index.js"

describe("Extension catalog source", () => {
  it("publishes immutable generations and suppresses duplicate revisions", () => {
    const initial = generation("revision-a", "command.a")
    const catalog = createAppExtensionCatalog(initial)
    const listener = vi.fn()
    const unsubscribe = catalog.source.subscribe(listener)

    expect(catalog.source.current()).toMatchObject({ revision: "revision-a" })
    expect(Object.isFrozen(catalog.source.current())).toBe(true)
    expect(Object.isFrozen(catalog.source.current().snapshot)).toBe(true)
    expect(
      Object.isFrozen(catalog.source.current().snapshot.contributions)
    ).toBe(true)
    const commandDomain = catalog.source.current().snapshot.byDomain.command
    expect(commandDomain.byId).not.toBeInstanceOf(Map)
    expect("set" in commandDomain.byId).toBe(false)
    expect(Object.isFrozen(commandDomain.byId.get("command.a"))).toBe(true)
    const mutableOriginal = initial.snapshot.byDomain.command.byId.get(
      "command.a"
    ) as unknown as { value: { title: string } }
    mutableOriginal.value.title = "mutated original"
    expect(
      catalog.source
        .current()
        .snapshot.byDomain.command.byId.get("command.a")!.value.title
    ).toBe("command.a")
    expect(catalog.publish(generation("revision-a", "command.a"))).toEqual({
      changed: false,
      listenerErrors: []
    })
    expect(listener).not.toHaveBeenCalled()

    const published = catalog.publish(generation("revision-b", "command.b"))
    expect(published).toEqual({ changed: true, listenerErrors: [] })
    expect(catalog.source.current()).toMatchObject({ revision: "revision-b" })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(catalog.source.current())

    unsubscribe()
    unsubscribe()
    catalog.publish(generation("revision-c", "command.c"))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("isolates listener failures without rolling back publication", () => {
    const catalog = createAppExtensionCatalog(generation("revision-a", "command.a"))
    const laterListener = vi.fn()
    catalog.source.subscribe(() => {
      throw new Error("listener failed")
    })
    catalog.source.subscribe(laterListener)

    const result = catalog.publish(generation("revision-b", "command.b"))

    expect(result.changed).toBe(true)
    expect(result.listenerErrors).toEqual([expect.any(Error)])
    expect(laterListener).toHaveBeenCalledTimes(1)
    expect(catalog.source.current().revision).toBe("revision-b")
  })

  it("provides a read-only static source and rejects unsafe revisions", () => {
    const source = createStaticAppExtensionCatalogSource(
      generation("static:test", "command.static")
    )
    const listener = vi.fn()

    expect(source.current().revision).toBe("static:test")
    expect(source.subscribe(listener)()).toBeUndefined()
    expect(listener).not.toHaveBeenCalled()
    expect(() => createAppExtensionCatalog(generation(" bad ", "command.bad")))
      .toThrow(/revision must contain/)
  })
})

function generation(revision: string, commandId: string) {
  return {
    revision,
    snapshot: resolveAppExtensionContributions([
      {
        id: commandId,
        domain: "command" as const,
        value: {
          name: commandId,
          title: commandId,
          paletteVisibility: "visible" as const,
          handlerRef: `handler.${commandId}`
        },
        provenance: {
          source: {
            kind: "plugin" as const,
            scope: "user" as const,
            id: "plugin.catalog-test"
          },
          trust: "user_enabled" as const
        }
      }
    ])
  }
}
