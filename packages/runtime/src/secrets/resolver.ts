import type {
  ResolvedSecret,
  SecretProvider,
  SecretResolveContext,
  SecretResolverPort
} from "./types.js"

export class SecretResolver implements SecretResolverPort {
  private readonly providers = new Map<string, SecretProvider>()

  constructor(providers: readonly SecretProvider[] = []) {
    for (const provider of providers) {
      this.register(provider)
    }
  }

  register(provider: SecretProvider): void {
    const scheme = normalizeScheme(provider.scheme)
    if (this.providers.has(scheme)) {
      throw new Error(`secret provider already registered: ${scheme}`)
    }
    this.providers.set(scheme, provider)
  }

  async resolve(
    ref: string,
    context?: SecretResolveContext
  ): Promise<ResolvedSecret> {
    const scheme = schemeFromRef(ref)
    const provider = this.providers.get(scheme)
    if (provider === undefined) {
      throw new Error(`no secret provider registered for scheme: ${scheme}`)
    }
    return await provider.resolve({
      ref,
      scheme,
      ...(context === undefined ? {} : { context })
    })
  }

  hasProvider(scheme: string): boolean {
    return this.providers.has(normalizeScheme(scheme))
  }
}

export function schemeFromRef(ref: string): string {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(ref)
  if (match === null) {
    throw new Error(`secret ref must include a URI scheme: ${ref}`)
  }
  return normalizeScheme(match[1] ?? "")
}

export function normalizeScheme(scheme: string): string {
  if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) {
    throw new Error(`invalid secret provider scheme: ${scheme}`)
  }
  return scheme.toLowerCase()
}
