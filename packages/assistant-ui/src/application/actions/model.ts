export interface SurfaceEnvelopeLike {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: {
    readonly message: string
  }
}
