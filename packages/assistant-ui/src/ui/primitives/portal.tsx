import { createContext, useContext } from "react";

/**
 * Floating layers must mount inside the Assistant shell, which owns the theme
 * tokens, instead of at document.body where those tokens do not apply.
 */
const PortalContainer = createContext<HTMLElement | null>(null);

export const PortalContainerProvider = PortalContainer.Provider;

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainer) ?? undefined;
}
