export class SystemServiceClientError extends Error {
  readonly code: string

  constructor(message: string, options: { readonly code: string }) {
    super(message)
    this.name = "SystemServiceClientError"
    this.code = options.code
  }
}

export class StorageTransportError extends Error {
  readonly code: string

  constructor(message: string, options: { readonly code: string }) {
    super(message)
    this.name = "StorageTransportError"
    this.code = options.code
  }
}
