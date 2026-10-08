import { useLayoutEffect, useMemo, useState } from "react";

/** Local Settings admission/publication only; never cancels or replays Host work. */
export function useSettingsOperation(
  clearFeedback: () => void,
  onError: (message: string) => void,
): {
  readonly busy: boolean;
  readonly isBusy: () => boolean;
  readonly run: <T>(request: () => Promise<T>, settle: (result: T) => void) => Promise<void>;
} {
  const scope = useMemo(() => ({ active: false, operation: undefined as object | undefined }), []);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    scope.active = true;
    return () => { scope.active = false; scope.operation = undefined; };
  }, [scope]);
  const isBusy = (): boolean => scope.operation !== undefined;

  async function run<T>(request: () => Promise<T>, settle: (result: T) => void): Promise<void> {
    if (!scope.active || isBusy()) return;
    const operation = {};
    scope.operation = operation;
    setBusy(true);
    clearFeedback();
    const current = (): boolean => scope.active && scope.operation === operation;
    try {
      const result = await request();
      if (current()) settle(result);
    } catch (reason) {
      if (current()) onError(reason instanceof Error ? reason.message : "Settings request failed");
    } finally {
      if (current()) {
        scope.operation = undefined;
        setBusy(false);
      }
    }
  }
  return { busy, isBusy, run };
}
