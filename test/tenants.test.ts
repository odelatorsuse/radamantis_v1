import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TENANT_SETTINGS, getTenantSettings, resolveTenant, upsertTenantSettings } from "../src/tenants";

describe("resolveTenant", () => {
  it("devuelve tenant_id y vertical_id para un channel_binding existente", async () => {
    const first = vi.fn().mockResolvedValue({ tenant_id: "vet-ch", vertical_id: "veterinaria" });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    const resolved = await resolveTenant(db, "telegram", "bot-token-vet-ch");

    expect(bind).toHaveBeenCalledWith("telegram", "bot-token-vet-ch");
    expect(resolved).toEqual({ tenantId: "vet-ch", verticalId: "veterinaria" });
  });

  it("devuelve null si no hay channel_binding registrado", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    const resolved = await resolveTenant(db, "telegram", "token-desconocido");

    expect(resolved).toBeNull();
  });
});

describe("getTenantSettings", () => {
  it("devuelve los defaults si el tenant no tiene fila en tenant_settings", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    expect(await getTenantSettings(db, "vet-ch")).toEqual(DEFAULT_TENANT_SETTINGS);
  });

  it("devuelve la config guardada si existe", async () => {
    const businessHours = { mon: { start: "10:00", end: "14:00" }, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
    const first = vi.fn().mockResolvedValue({
      tone: "formal",
      language: "en",
      currency: "USD",
      prompt_override: "custom",
      timezone: "America/Mexico_City",
      business_hours: JSON.stringify(businessHours),
      alert_chat_id: "12345",
      alert_activation_code: "ABCD1234",
    });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    expect(await getTenantSettings(db, "vet-ch")).toEqual({
      tone: "formal",
      language: "en",
      currency: "USD",
      promptOverride: "custom",
      timezone: "America/Mexico_City",
      businessHours,
      alertChatId: "12345",
      alertActivationCode: "ABCD1234",
    });
  });
});

describe("upsertTenantSettings", () => {
  it("hace upsert con ON CONFLICT sobre tenant_id, incluyendo los campos de alertas", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;
    const businessHours = { mon: { start: "09:00", end: "18:00" }, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

    await upsertTenantSettings(db, "vet-ch", {
      tone: "formal",
      language: "en",
      currency: "USD",
      promptOverride: null,
      timezone: "America/Mexico_City",
      businessHours,
      alertChatId: "12345",
      alertActivationCode: "ABCD1234",
    });

    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT (tenant_id) DO UPDATE"));
    expect(bind).toHaveBeenCalledWith(
      "vet-ch",
      "formal",
      "en",
      "USD",
      null,
      "America/Mexico_City",
      JSON.stringify(businessHours),
      "12345",
      "ABCD1234",
    );
  });
});
