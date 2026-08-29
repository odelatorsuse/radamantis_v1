import { describe, expect, it } from "vitest";
import { createAdminSessionToken, verifyAdminSessionToken } from "../src/admin/session";

const SECRET = "test-admin-session-secret";

describe("createAdminSessionToken / verifyAdminSessionToken", () => {
  it("verifica correctamente un token recién creado, con el rol incluido", async () => {
    const token = await createAdminSessionToken(SECRET, 7, "socio@radamantis.dev", "operador");
    const session = await verifyAdminSessionToken(SECRET, token);
    expect(session).toEqual({ userId: 7, email: "socio@radamantis.dev", role: "operador", exp: expect.any(Number) });
  });

  it("rechaza un token firmado con otro secret (nunca cruza con /console)", async () => {
    const token = await createAdminSessionToken(SECRET, 7, "socio@radamantis.dev", "admin");
    expect(await verifyAdminSessionToken("otro-secret", token)).toBeNull();
  });

  it("rechaza un token con formato inválido", async () => {
    expect(await verifyAdminSessionToken(SECRET, "no-es-un-token")).toBeNull();
  });
});
