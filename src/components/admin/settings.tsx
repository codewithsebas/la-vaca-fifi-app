"use client";

import { BellIcon, CalendarIcon, ExternalLinkIcon, LogoutIcon, RefreshIcon, VolumeIcon } from "@/components/ui/icons";
import { api } from "@/lib/api";
import { isMockApi } from "@/lib/config";
import { useAdmin } from "@/components/admin/context";
import { Combobox } from "@/components/ui/combobox";
import { LIVE_LABEL, LiveDot, SOUND_GROUPS, chime, unlockAudio, useSound } from "@/components/admin/notifications";
import { PREF, usePref, writePref } from "@/components/admin/prefs";
import { PushSettingsCard } from "@/components/admin/push";
import { Button, Callout, Card, CardHeader, Field, PageHeader, Switch, buttonClass } from "@/components/admin/ui";
import { CALENDAR_VIEWS } from "@/components/admin/calendar";

export function SettingsView() {
  const { live, logout, ask } = useAdmin();
  const [sound, setSound] = useSound();
  const muted = usePref(PREF.mutedSounds, "").split(",").filter(Boolean);
  const calendarView = usePref(PREF.calendarView, "auto");

  const toggleGroup = (id: string, on: boolean) => writePref(PREF.mutedSounds, (on ? muted.filter((x) => x !== id) : [...muted, id]).join(","));
  const test = () => {
    unlockAudio();
    setTimeout(chime, 60);
  };
  const reset = () =>
    ask({
      title: "Restablecer datos de prueba",
      text: "Se borran las reservas simuladas y se cargan las de demostración.",
      okLabel: "Restablecer",
      done: "Datos de prueba restablecidos",
      run: () => api.admin.reset(),
    });

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Preferencias de este navegador: notificaciones, sonido de los avisos, vista del calendario y sesión. No cambian nada en el sitio."
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Card aria-labelledby="st-sound" className="flex flex-col gap-4 p-4 sm:p-5">
          <CardHeader
            id="st-sound"
            icon={<VolumeIcon size={18} />}
            title="Sonido de notificaciones"
            subtitle="Suena cuando llega un aviso nuevo con el panel abierto."
            actions={
              <Button size="sm" icon={<VolumeIcon size={14} />} onClick={test}>
                Probar sonido
              </Button>
            }
          />
          <Switch checked={sound} onChange={setSound} label="Reproducir sonido" description="Puedes silenciarlo también desde la campana de notificaciones." />
          <fieldset disabled={!sound} className="flex min-w-0 flex-col gap-3 border-t border-line pt-4 disabled:opacity-55">
            <legend className="sr-only">Avisos con sonido</legend>
            <p className="text-[13px] font-semibold text-ink">Qué avisos suenan</p>
            {SOUND_GROUPS.map((g) => (
              <Switch
                key={g.id}
                checked={sound && !muted.includes(g.id)}
                disabled={!sound}
                onChange={(v) => toggleGroup(g.id, v)}
                label={g.label}
                description={g.description}
              />
            ))}
          </fieldset>
          <Callout>
            Los navegadores solo permiten reproducir sonido después de que interactúas con la página (un clic o una tecla). Si abres el panel y no tocas nada,
            el primer aviso llegará sin sonido.
          </Callout>
        </Card>

        <div className="flex flex-col gap-4">
          <PushSettingsCard />

          <Card aria-labelledby="st-live" className="flex flex-col gap-3 p-4 sm:p-5">
            <CardHeader
              id="st-live"
              icon={<BellIcon size={18} />}
              title="Tiempo real"
              subtitle="Reservas, comprobantes y bloqueos se actualizan sin recargar la página."
            />
            <p className="flex items-center gap-2.5 rounded-xl bg-canvas px-3.5 py-3 text-[13.5px] font-semibold text-ink">
              <LiveDot status={live} />
              {LIVE_LABEL[live]}
            </p>
            {live === "offline" && (
              <Callout tone="warning">
                Se perdió la conexión en vivo. Recarga la página para reconectar; mientras tanto, los datos se actualizan al hacer cambios.
              </Callout>
            )}
          </Card>

          <Card aria-labelledby="st-cal" className="flex flex-col gap-4 p-4 sm:p-5">
            <CardHeader id="st-cal" icon={<CalendarIcon size={18} />} title="Calendario" subtitle="Vista con la que se abre el calendario en este navegador." />
            <Field
              label="Vista predeterminada"
              hint="«Automática» elige según el ancho de la pantalla: pocos días en el celular, la semana en la tableta y el mes en el computador."
            >
              {(p) => (
                <Combobox
                  id={p.id}
                  describedBy={p["aria-describedby"]}
                  value={calendarView}
                  onChange={(v) => writePref(PREF.calendarView, v)}
                  options={[{ value: "auto", label: "Automática según la pantalla" }, ...CALENDAR_VIEWS.map((v) => ({ value: v.value, label: v.label }))]}
                />
              )}
            </Field>
          </Card>

          <Card aria-labelledby="st-session" className="flex flex-col gap-3 p-4 sm:p-5">
            <CardHeader id="st-session" icon={<LogoutIcon size={18} />} title="Sesión" />
            <div className="flex flex-wrap gap-2">
              <a href="/" target="_blank" rel="noopener" className={buttonClass()}>
                <ExternalLinkIcon size={15} />
                Ver sitio web
              </a>
              {isMockApi && (
                <Button icon={<RefreshIcon size={15} />} onClick={reset}>
                  Restablecer datos de prueba
                </Button>
              )}
              <Button variant="danger-ghost" icon={<LogoutIcon size={15} />} onClick={logout}>
                Cerrar sesión
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
