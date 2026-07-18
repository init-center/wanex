import { randomUUID } from "node:crypto"

export function createChangeSetId(): string {
  return `cs_git_${randomUUID().replaceAll("-", "")}`
}
