import { describe, expect, it, vi } from "vitest";
import { getPlatformSettings, upsertPlatformSettings } from "../src/platformSettings";

function mockDb(row: { meta_app_id: string | null; meta_app_secret: string | null; meta_verify_token: string | null } | null) {
  const first = vi.fn().mockResolvedValue(row);
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ first, run });
  const prepare = vi.fn().mockReturnValue({ bind, first, run });
  return { db: { prepare } as unknown as D1Database, prepare, bind, first, run };
}

describe("getPlatformSettings", () => {
  it("devuelve los valores guardados", async () => {
    const { db } = mockDb({ meta_app_id: "app-1", meta_app_secret: "secret-1", meta_verify_token: "verify-1" });
    expect(await getPlatformSettings(db)).toEqual({ metaAppId: "app-1", metaAppSecret: "secret-1", metaVerifyToken: "verify-1" });
  });

  it("devuelve null en todos los campos si no hay fila todavía", async () => {
    const { db } = mockDb(null);
    expect(await getPlatformSettings(db)).toEqual({ metaAppId: null, metaAppSecret: null, metaVerifyToken: null });
  });
});

describe("upsertPlatformSettings", () => {
  it("solo pisa los campos recibidos, preservando el resto", async () => {
    const { db, bind } = mockDb({ meta_app_id: null, meta_app_secret: null, meta_verify_token: "verify-existente" });
    await upsertPlatformSettings(db, { metaAppId: "app-nuevo" });
    expect(bind).toHaveBeenCalledWith("app-nuevo", null, "verify-existente");
  });

  it("guarda los tres campos cuando se pasan todos", async () => {
    const { db, bind } = mockDb({ meta_app_id: null, meta_app_secret: null, meta_verify_token: null });
    await upsertPlatformSettings(db, { metaAppId: "app-1", metaAppSecret: "secret-1", metaVerifyToken: "verify-1" });
    expect(bind).toHaveBeenCalledWith("app-1", "secret-1", "verify-1");
  });
});
