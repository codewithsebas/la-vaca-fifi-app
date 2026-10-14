"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Cabin } from "@/lib/config";
import { mergeSite, type SiteConfig, type SiteContent } from "@/lib/site";

type Site = SiteContent & { c: SiteConfig; cabins: Cabin[]; cabinName: (id: string) => string };

const SiteCtx = createContext<Site | null>(null);

// Contenido editable del sitio y cabañas activas para los componentes de cliente (los carga el layout raíz en el servidor).
export function SiteProvider({ content, cabins, children }: { content: SiteContent; cabins: Cabin[]; children: ReactNode }) {
  const value = useMemo(
    () => ({
      ...content,
      c: mergeSite(content.settings, content.policies, content.texts),
      cabins,
      cabinName: (id: string) => cabins.find((x) => x.id === id)?.full ?? id,
    }),
    [content, cabins],
  );
  return <SiteCtx.Provider value={value}>{children}</SiteCtx.Provider>;
}

export function useSite() {
  const v = useContext(SiteCtx);
  if (!v) throw new Error("useSite() fuera de <SiteProvider>");
  return v;
}
