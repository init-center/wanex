import { useCallback, useEffect, useRef, useState } from "react";

export type ClipboardWriteState = "idle" | "pending" | "succeeded" | "failed";

export interface ClipboardWriter {
  readonly state: ClipboardWriteState;
  write(text: string): Promise<void>;
}

const SUCCESS_RESET_DELAY_MS = 2_000;

export function useClipboardWriter(): ClipboardWriter {
  const [state, setState] = useState<ClipboardWriteState>("idle");
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      if (resetTimer.current !== undefined) clearTimeout(resetTimer.current);
    };
  }, []);

  const write = useCallback(async (text: string): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    generation.current += 1;
    const requestGeneration = generation.current;
    if (resetTimer.current !== undefined) {
      clearTimeout(resetTimer.current);
      resetTimer.current = undefined;
    }
    setState("pending");

    try {
      const clipboard = typeof navigator === "undefined"
        ? undefined
        : navigator.clipboard;
      if (clipboard?.writeText === undefined) {
        finish("failed");
        return;
      }
      await clipboard.writeText(text);
      finish("succeeded");
    } catch {
      finish("failed");
    } finally {
      inFlight.current = false;
    }

    function finish(nextState: ClipboardWriteState): void {
      if (!mounted.current || generation.current !== requestGeneration) return;
      setState(nextState);
      if (nextState !== "succeeded") return;
      resetTimer.current = setTimeout(() => {
        resetTimer.current = undefined;
        if (mounted.current && generation.current === requestGeneration) {
          setState("idle");
        }
      }, SUCCESS_RESET_DELAY_MS);
    }
  }, []);

  return { state, write };
}
