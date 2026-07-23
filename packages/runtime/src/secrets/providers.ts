import { InMemoryResolvedSecret } from "./secret.js"
import type { ResolveSecretRequest, SecretProvider } from "./types.js"

export class StaticSecretProvider implements SecretProvider {
  readonly scheme: string
  private readonly values: ReadonlyMap<string, string>

  constructor(options: {
    readonly scheme?: string
    readonly values: ReadonlyMap<string, string> | Record<string, string>
  }) {
    this.scheme = options.scheme ?? "static"
    this.values =
      options.values instanceof Map
        ? options.values
        : new Map(Object.entries(options.values))
  }

  resolve(request: ResolveSecretRequest): InMemoryResolvedSecret {
    const value = this.values.get(request.ref)
    if (value === undefined) {
      throw new Error(`static secret not found: ${request.ref}`)
    }
    return new InMemoryResolvedSecret({
      ref: request.ref,
      provider: request.scheme,
      value
    })
  }
}

export class EnvSecretProvider implements SecretProvider {
  readonly scheme = "env"
  private readonly env: Readonly<Record<string, string | undefined>>

  constructor(
    env: Readonly<Record<string, string | undefined>> = process.env
  ) {
    this.env = env
  }

  resolve(request: ResolveSecretRequest): InMemoryResolvedSecret {
    const name = envNameFromRef(request.ref)
    const value = this.env[name]
    if (value === undefined || value.length === 0) {
      throw new Error(`environment secret not found: ${name}`)
    }
    return new InMemoryResolvedSecret({
      ref: request.ref,
      provider: request.scheme,
      value
    })
  }
}

export function envNameFromRef(ref: string): string {
  if (ref.startsWith("env://")) {
    const raw = ref.slice("env://".length)
    const withoutLeadingSlash = raw.startsWith("/") ? raw.slice(1) : raw
    const [name] = withoutLeadingSlash.split("/")
    return validateEnvName(name ?? "", ref)
  }
  if (ref.startsWith("env:")) {
    return validateEnvName(ref.slice("env:".length), ref)
  }
  throw new Error(`not an env secret ref: ${ref}`)
}

function validateEnvName(name: string, ref: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid env secret ref: ${ref}`)
  }
  return name
}
