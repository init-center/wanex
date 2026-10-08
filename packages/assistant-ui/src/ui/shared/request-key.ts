/** Idempotency key for one user-initiated action; the same click replays safely. */
export function requestKey(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid === undefined) throw new Error("The browser client requires crypto.randomUUID");
  return `${prefix}:${randomUuid.call(globalThis.crypto)}`;
}
