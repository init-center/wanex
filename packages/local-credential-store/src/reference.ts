export const WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME = "wanex-keychain" as const

export interface WanexLocalCredentialPolicy {
  readonly scheme: string
  createRef(input: {
    readonly connectionId: string
    readonly revisionId: string
  }): string
  ownsRef(ref: string): boolean
}

export function wanexLocalCredentialPolicy(options: {
  readonly namespace: string
  readonly scheme?: string
}): WanexLocalCredentialPolicy {
  const namespace = normalizeWanexLocalCredentialNamespace(options.namespace)
  const scheme = normalizeCredentialScheme(
    options.scheme ?? WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME
  )
  return {
    scheme,
    createRef(input) {
      return wanexLocalCredentialRef({
        scheme,
        namespace,
        connectionId: input.connectionId,
        revisionId: input.revisionId
      })
    },
    ownsRef(ref) {
      return isWanexLocalCredentialRef({ ref, scheme, namespace })
    }
  }
}

export function wanexLocalCredentialRef(options: {
  readonly scheme?: string
  readonly namespace: string
  readonly connectionId: string
  readonly revisionId: string
}): string {
  const namespace = normalizeWanexLocalCredentialNamespace(options.namespace)
  const connectionId = options.connectionId.trim()
  if (connectionId.length === 0) {
    throw new Error("credential connection id must not be empty")
  }
  const revisionId = options.revisionId.trim()
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(revisionId)) {
    throw new Error("credential revision id is invalid")
  }
  const scheme = normalizeCredentialScheme(
    options.scheme ?? WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME
  )
  return `${scheme}://${namespace}/${encodeURIComponent(`${connectionId}.${revisionId}`)}`
}

export function isWanexLocalCredentialRef(options: {
  readonly ref: string
  readonly scheme?: string
  readonly namespace: string
}): boolean {
  let url: URL
  try {
    url = new URL(options.ref)
  } catch {
    return false
  }
  const rawAccount = url.pathname.slice(1)
  return (
    url.protocol === `${normalizeCredentialScheme(
      options.scheme ?? WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME
    )}:` &&
    url.hostname === normalizeWanexLocalCredentialNamespace(options.namespace) &&
    url.search.length === 0 &&
    url.hash.length === 0 &&
    url.username.length === 0 &&
    url.password.length === 0 &&
    rawAccount.length > 0 &&
    !rawAccount.includes("/")
  )
}

export function normalizeWanexLocalCredentialNamespace(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(
      "credential namespace must be a 64-character lowercase hexadecimal hash"
    )
  }
  return value
}

function normalizeCredentialScheme(value: string): string {
  const scheme = value.trim().toLowerCase()
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
    throw new Error("credential store scheme is invalid")
  }
  return scheme
}
