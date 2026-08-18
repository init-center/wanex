# @wanex/local-credential-store

Trusted local credential persistence for Wanex executable hosts.

This package owns only the opaque `wanex-keychain:` reference contract and the
platform keychain adapter. It does not own Provider setup, model endpoints,
Product state, Runtime execution, Storage, or renderer APIs. Runtime consumers
receive only its `SecretResolverPort` behavior.

Use `@wanex/local-credential-store/binding` when a host supplies a verified
native binding artifact. Importing that subpath does not eagerly load the
default `@napi-rs/keyring` binding. Executables that use the default platform
binding import `@wanex/local-credential-store/keychain` explicitly; the root
exports only the reference contract.
