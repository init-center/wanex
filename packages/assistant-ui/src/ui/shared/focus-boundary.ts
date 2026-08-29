import {
  useCallback,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled]):not([tabindex='-1'])",
  "input:not([disabled]):not([type=hidden]):not([tabindex='-1'])",
  "select:not([disabled]):not([tabindex='-1'])",
  "textarea:not([disabled]):not([tabindex='-1'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface FocusBoundaryOptions {
  readonly active: boolean;
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly initialFocusSelector: string;
}

export function useFocusBoundary({
  active,
  containerRef,
  returnFocusRef,
  initialFocusSelector,
}: FocusBoundaryOptions): {
  readonly handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
} {
  const pendingReturnFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const returnTarget = returnFocusRef.current;
    if (container === null) return;
    const initial = container.querySelector<HTMLElement>(initialFocusSelector) ??
      focusableElements(container)[0];
    const focusFrame = requestAnimationFrame(() => {
      if (container.isConnected) initial?.focus();
    });
    return () => {
      cancelAnimationFrame(focusFrame);
      pendingReturnFocus.current = returnTarget;
    };
  }, [active, containerRef, initialFocusSelector, returnFocusRef]);

  useLayoutEffect(() => {
    if (active) return;
    const returnTarget = pendingReturnFocus.current;
    pendingReturnFocus.current = null;
    returnFocusRef.current = null;
    if (returnTarget?.isConnected === true) returnTarget.focus();
  }, [active, returnFocusRef]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!active || event.key !== "Tab") return;
    const container = containerRef.current;
    if (container === null) return;
    const focusable = focusableElements(container);
    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !container.contains(current))) {
      event.preventDefault();
      last?.focus();
      return;
    }
    if (!event.shiftKey && (current === last || !container.contains(current))) {
      event.preventDefault();
      first?.focus();
    }
  }, [active, containerRef]);

  return { handleKeyDown };
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.closest("[hidden]") === null,
  );
}
