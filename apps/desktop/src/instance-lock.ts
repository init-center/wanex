export interface DesktopSingleInstanceOwner {
  requestSingleInstanceLock(): boolean;
  releaseSingleInstanceLock(): void;
}

export interface DesktopSingleInstanceLock {
  readonly acquired: boolean;
  release(): void;
}

export class DesktopSingleInstanceLockUnavailableError extends Error {
  readonly code = "desktop_single_instance_lock_unavailable";

  constructor() {
    super("Desktop single-instance lock is already held");
    this.name = "DesktopSingleInstanceLockUnavailableError";
  }
}

export function acquireDesktopSingleInstanceLock(
  owner: DesktopSingleInstanceOwner,
): DesktopSingleInstanceLock {
  const acquired = owner.requestSingleInstanceLock();
  let held = acquired;
  return {
    acquired,
    release() {
      if (!held) return;
      held = false;
      owner.releaseSingleInstanceLock();
    },
  };
}
