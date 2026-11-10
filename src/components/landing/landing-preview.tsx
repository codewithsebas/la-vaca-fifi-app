"use client";

import { useEffect, useMemo, useState } from "react";
import { LandingView } from "@/components/landing/landing-view";
import { SiteProvider } from "@/components/site/site-provider";
import { mergeSite } from "@/lib/site";
import { isPreviewZone, type FromPreview, type PreviewData, type PreviewZone, type ToPreview } from "@/lib/site-preview";

// Solo la zona más interna bajo el puntero se marca: un clic ahí abre su editor en el panel.
const STYLES = `
  [data-zone] { cursor: pointer; }
  [data-zone] a, [data-zone] button, [data-zone] summary { cursor: inherit; }
  [data-zone]:hover:not(:has([data-zone]:hover)) { outline: 2px dashed #1f6fc4; outline-offset: 3px; border-radius: 8px; }
  [data-zone][data-zone-active] { outline: 3px solid #1f6fc4; outline-offset: 3px; border-radius: 8px; }
`;

const post = (m: FromPreview) => window.parent.postMessage(m, window.location.origin);

// Dentro del iframe del panel: no lee nada por su cuenta, pinta lo que el panel le envía. Nada navega ni reserva: un clic
// sirve para saltar al editor de esa zona.
export function LandingPreview() {
  const [data, setData] = useState<PreviewData | null>(null);
  const [target, setTarget] = useState<{ zone: PreviewZone } | null>(null);
  const hasData = !!data;

  useEffect(() => {
    if (window.parent === window) return;
    const onMessage = (e: MessageEvent<ToPreview>) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if (e.data?.type === "vf-preview-data") setData(e.data.data);
      if (e.data?.type === "vf-preview-zone") setTarget({ zone: e.data.zone });
    };
    window.addEventListener("message", onMessage);
    post({ type: "vf-preview-ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onClick = (e: MouseEvent) => {
      stop(e);
      const zone = (e.target as Element | null)?.closest?.<HTMLElement>("[data-zone]")?.dataset.zone;
      if (isPreviewZone(zone)) post({ type: "vf-preview-edit", zone });
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && (e.target as Element | null)?.closest?.("a, button, summary, input, select, textarea")) stop(e);
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("submit", stop, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("submit", stop, true);
    };
  }, []);

  // Lleva la página a la zona que se está editando y la marca un momento.
  useEffect(() => {
    if (!target || !hasData) return;
    const el = document.querySelector<HTMLElement>(`[data-zone="${target.zone}"]`);
    if (!el) return;
    window.scrollTo({ top: target.zone === "hero" ? 0 : Math.max(0, el.getBoundingClientRect().top + window.scrollY - 96) });
    el.setAttribute("data-zone-active", "");
    const t = setTimeout(() => el.removeAttribute("data-zone-active"), 1600);
    return () => {
      clearTimeout(t);
      el.removeAttribute("data-zone-active");
    };
  }, [target, hasData]);

  const site = useMemo(() => (data ? mergeSite(data.content.settings, data.content.policies, data.content.texts) : null), [data]);
  if (!data || !site) return null;

  return (
    <SiteProvider content={data.content} cabins={data.cabins}>
      <style>{STYLES}</style>
      <LandingView cabins={data.cabins} site={site} photos={data.content.photos} texts={data.content.texts} services={data.content.services} />
    </SiteProvider>
  );
}
