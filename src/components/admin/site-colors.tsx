"use client";

// Configuración → Colores: los colores del sitio web, con su vista previa (components/admin/theme.tsx). Aquí porque Contenido
// del sitio está desactivado. El panel tiene un tema fijo (components/admin/panel-theme.ts).
import { useState } from "react";
import { api } from "@/lib/client/api";
import { can } from "@/lib/permissions";
import { sameTheme, themeIssues } from "@/lib/theme";
import { useAdmin } from "@/components/admin/context";
import { AccessDenied } from "@/components/admin/account";
import { ThemeEditor } from "@/components/admin/theme";
import { PageHeader, SaveBar } from "@/components/admin/ui";

export function SiteColorsView() {
  const { data, ask } = useAdmin();
  const saved = data.site.theme;
  const [draft, setDraft] = useState(saved);
  const dirty = !sameTheme(draft, saved);

  // Al guardar en otra pestaña o dispositivo (o al terminar de guardar aquí), lo guardado pasa a ser la base.
  const [base, setBase] = useState(saved);
  if (!sameTheme(base, saved)) {
    setBase(saved);
    setDraft(saved);
  }

  if (!can(data.me.role, "content")) return <AccessDenied module="configuracion" />;

  const save = () => {
    const n = themeIssues(draft).length;
    ask({
      title: "Publicar los colores del sitio",
      text: `Los huéspedes verán el sitio con estos colores.${n ? ` Ojo: ${n === 1 ? "una combinación tiene poco contraste" : `${n} combinaciones tienen poco contraste`} y puede costar leerla.` : ""}`,
      okLabel: "Publicar colores",
      done: "Colores del sitio publicados",
      // El resto del contenido va tal como está guardado: aquí solo cambian los colores.
      run: () => api.admin.saveSite({ settings: data.site.settings, policies: data.site.policies, content: data.site.texts, theme: draft }),
    });
  };

  return (
    <>
      <PageHeader
        title="Colores del sitio web"
        description="Los colores que ven los huéspedes. Mira el resultado en la vista previa; nada se publica hasta confirmar."
      />
      <ThemeEditor theme={draft} saved={saved} onChange={setDraft} />
      <SaveBar dirty={dirty} onDiscard={() => setDraft(saved)} onSave={save} saveLabel="Publicar colores" />
    </>
  );
}
