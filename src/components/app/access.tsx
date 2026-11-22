"use client";

import { createContext, useContext } from "react";

/**
 * Whether the current visitor may change the vault. False for signed-out
 * visitors of a public (view-only) vault. This only hides controls — the
 * server enforces the same rule on every request (see `src/proxy.ts`).
 */
const CanEditContext = createContext(true);

export function AccessProvider({ canEdit, children }: { canEdit: boolean; children: React.ReactNode }) {
  return <CanEditContext.Provider value={canEdit}>{children}</CanEditContext.Provider>;
}

export function useCanEdit() {
  return useContext(CanEditContext);
}

/** Renders its children only for the vault owner. */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  return useCanEdit() ? <>{children}</> : null;
}

/** Renders its children only for view-only visitors. */
export function VisitorOnly({ children }: { children: React.ReactNode }) {
  return useCanEdit() ? null : <>{children}</>;
}
