import { describe, expect, it } from "vitest";
import { CheckIcon, RefreshIcon } from "@/components/ui/icons";
import { chipOf } from "@/components/admin/sync";
import type { SyncStatus } from "@/lib/offline/engine";

const base: SyncStatus = { network: "online", syncing: false, pending: 0, conflicts: 0, waiting: 0, authLost: false, lastSyncAt: null, sent: 0, total: 0 };

describe("indicador de sincronización", () => {
  it("listo: palomita fija", () => {
    const c = chipOf(base);
    expect([c.label, c.icon, c.spin]).toEqual(["En línea", CheckIcon, undefined]);
  });

  it("actualizando: icono de carga, con el mismo texto", () => {
    const c = chipOf({ ...base, syncing: true });
    expect([c.label, c.icon, c.spin]).toEqual(["En línea", RefreshIcon, true]);
  });

  it("enviando cambios: icono de carga y el avance", () => {
    const c = chipOf({ ...base, syncing: true, total: 3, sent: 1, pending: 2 });
    expect([c.label, c.icon, c.spin]).toEqual(["Sincronizando 2 de 3", RefreshIcon, true]);
  });

  it("un aviso no gira aunque se esté sincronizando", () => {
    expect(chipOf({ ...base, syncing: true, conflicts: 1 }).spin).toBeUndefined();
  });
});
