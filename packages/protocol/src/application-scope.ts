import type { JsonValue } from "./json.js"

export interface ApplicationScopeBinding {
  readonly kind: string
  readonly id: string
  readonly digest: string
  readonly metadata: JsonValue
}
