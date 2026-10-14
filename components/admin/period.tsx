"use client";

// Filtro de periodo compartido por Finanzas y Pagos: hoy, 7 días … 1 año o un rango personalizado. Se guarda en la URL.
import { type Range } from "@/lib/admin-metrics";
import { addDays, fmtDate, isISO, nightsBetween, plural } from "@/lib/format";
import { useAdmin, useParam } from "./context";
import { DateRangePicker } from "./date-picker";
import { Segmented } from "./ui";

export type Preset = "1" | "7" | "14" | "30" | "60" | "90" | "180" | "365" | "personalizado";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "1", label: "Hoy" },
  { value: "7", label: "7 días" },
  { value: "14", label: "2 semanas" },
  { value: "30", label: "1 mes" },
  { value: "60", label: "2 meses" },
  { value: "90", label: "3 meses" },
  { value: "180", label: "6 meses" },
  { value: "365", label: "1 año" },
  { value: "personalizado", label: "Personalizado" },
];

export function usePeriod(fallback: Preset = "30") {
  const { today } = useAdmin();
  const [preset, setPreset] = useParam<Preset>("periodo", fallback);
  const [fromP, setFrom] = useParam("desde", "");
  const [toP, setTo] = useParam("hasta", "");
  const custom = { from: isISO(fromP) ? fromP : addDays(today, -29), to: isISO(toP) ? toP : today };
  const known = PRESETS.some((p) => p.value === preset);
  const range: Range = preset === "personalizado" ? custom : { from: addDays(today, -(Number(known ? preset : fallback) - 1)), to: today };
  const days = nightsBetween(range.from, range.to) + 1;
  const label = range.from === range.to ? fmtDate(range.from, true) : `${fmtDate(range.from, true)} → ${fmtDate(range.to, true)}`;
  const setCustom = (from: string | null, to: string | null) => {
    setFrom(from ?? "");
    setTo(to ?? "");
  };
  return { preset: known ? preset : fallback, setPreset, custom, setCustom, range, days, label, daysLabel: plural(days, "día", "días") };
}

export function PeriodFilter({ period }: { period: ReturnType<typeof usePeriod> }) {
  const { today } = useAdmin();
  return (
    <>
      <Segmented label="Periodo" value={period.preset} onChange={period.setPreset} options={PRESETS} />
      {period.preset === "personalizado" && (
        <div className="w-full sm:w-[280px]">
          <DateRangePicker mode="days" from={period.custom.from} to={period.custom.to} max={today} onChange={period.setCustom} clearable={false} />
        </div>
      )}
    </>
  );
}
