export interface SecretResolveContext {
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
