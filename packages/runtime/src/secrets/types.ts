export interface SecretResolveContext {
  readonly modelEndpointId?: string
  readonly connectorId?: string
  readonly credentialId?: string
  readonly principalId?: string
  readonly signal?: AbortSignal
}

export interface ResolveSecretRequest {
  readonly ref: string
  readonly scheme: string
  readonly context?: SecretResolveContext
}

export interface ResolvedSecret {
  readonly ref: string
  readonly provider: string
  readonly disposed: boolean
  reveal(): string
  dispose(): void
  toJSON(): never
}

export interface SecretProvider {
  readonly scheme: string
  resolve(request: ResolveSecretRequest): Promise<ResolvedSecret> | ResolvedSecret
}

export interface SecretResolverPort {
  resolve(
    ref: string,
    context?: SecretResolveContext
  ): Promise<ResolvedSecret>
}

/**
 * A trusted-host secret persistence port. Runtime execution consumes only the
 * `SecretResolverPort` side; credential entry and concrete storage belong to
 * an upper trusted host.
 */
export interface SecretStorePort extends SecretResolverPort {
  readonly scheme: string
  put(request: SecretStorePutRequest): Promise<void>
  delete(ref: string): Promise<void>
}

export interface SecretStorePutRequest {
  /**
   * An opaque, store-owned reference. Callers must derive it inside their
   * trusted boundary and must never project it into renderer read models.
   */
  readonly ref: string
  /** Raw sensitive input. It must not be persisted or returned by this API. */
  readonly value: string
}
