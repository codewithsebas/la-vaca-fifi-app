"use client";

// Filtro de periodo compartido por Finanzas y Pagos: hoy, 7 días … 1 año o un rango personalizado. Se guarda en la URL.
import { type Range } from "@/lib/admin-metrics";
import { addDays, fmtDate, isISO, nightsBetween, plural } from "@/lib/format";
import { CalendarIcon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { useAdmin, useParam } from "@/components/admin/context";
import { DateRangePicker } from "@/components/admin/date-picker";

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

// Una lista desplegable (cada opción dice sus fechas) y, con «Personalizado», el calendario para elegirlas.
export function PeriodFilter({ period }: { period: ReturnType<typeof usePeriod> }) {
  const { today } = useAdmin();
  const options = PRESETS.map((p) => ({
    value: p.value,
    label: p.label,
    description:
      p.value === "personalizado"
        ? "Elige las fechas"
        : p.value === "1"
          ? fmtDate(today)
          : `${fmtDate(addDays(today, -(Number(p.value) - 1)))} → ${fmtDate(today)}`,
  }));
  return (
    <>
      <div className="w-full sm:w-[200px]">
        <Combobox
          value={period.preset}
          onChange={(v) => period.setPreset(v as Preset)}
          options={options}
          searchable={false}
          icon={<CalendarIcon size={15} className="text-ink-muted" />}
        />
      </div>
      {period.preset === "personalizado" && (
        <div className="w-full sm:w-[280px]">
          <DateRangePicker mode="days" from={period.custom.from} to={period.custom.to} max={today} onChange={period.setCustom} clearable={false} />
        </div>
      )}
    </>
  );
}
