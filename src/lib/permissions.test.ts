import { describe, expect, it } from "vitest";
import { CAPABILITIES, ROLE_HINT, ROLE_LABEL, can, canManageRole, isAdminRole, isRole } from "@/lib/permissions";
import type { PanelRole } from "@/lib/types";

const ROLES: PanelRole[] = ["superadmin", "admin", "recepcion"];

describe("roles del panel", () => {
  it("reconoce los tres roles y nada más", () => {
    for (const r of ROLES) expect(isRole(r)).toBe(true);
    for (const r of ["", "Admin", "super", "owner", null, undefined, 1]) expect(isRole(r)).toBe(false);
  });

  it("cada rol tiene nombre y descripción", () => {
    for (const r of ROLES) {
      expect(ROLE_LABEL[r]).toBeTruthy();
      expect(ROLE_HINT[r]).toBeTruthy();
    }
  });

  it("el superadministrador puede todo; el administrador, todo menos el registro de actividad", () => {
    for (const c of CAPABILITIES) if (c.perm) expect(can("superadmin", c.perm)).toBe(true);
    expect(can("admin", "activity")).toBe(false);
    for (const c of CAPABILITIES) if (c.perm && c.perm !== "activity") expect(can("admin", c.perm)).toBe(true);
    expect(can("recepcion", "activity")).toBe(false);
    expect(can(null, "activity")).toBe(false);
  });

  it("superadministrador y administrador son administradores", () => {
    expect(isAdminRole("superadmin")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("recepcion")).toBe(false);
  });

  it("solo un superadministrador gestiona cuentas de superadministrador", () => {
    expect(canManageRole("superadmin", "superadmin")).toBe(true);
    expect(canManageRole("superadmin", "admin")).toBe(true);
    expect(canManageRole("admin", "superadmin")).toBe(false);
    expect(canManageRole("admin", "admin")).toBe(true);
    expect(canManageRole("admin", "recepcion")).toBe(true);
    expect(canManageRole("recepcion", "recepcion")).toBe(false);
  });
});
