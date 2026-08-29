import { describe, expect, it, vi } from "vitest";
import { createSessionToken, verifySessionToken } from "../src/client/session";

const SECRET = "test-session-secret";

describe("createSessionToken / verifySessionToken", () => {
  it("verifica correctamente un token recién creado", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 42);
    const session = await verifySessionToken(SECRET, token);
    expect(session).toEqual({ tenantId: "vet-ch", userId: 42, exp: expect.any(Number) });
  });

  it("rechaza un token firmado con otro secret", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 42);
    expect(await verifySessionToken("otro-secret", token)).toBeNull();
  });

  it("rechaza un token manipulado (tenantId alterado)", async () => {
    const token = await createSessionToken(SECRET, "vet-ch", 42);
    const [body, sig] = token.split(".");
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    payload.tenantId = "otro-tenant";
    const tamperedBody = Buffer.from(JSON.stringify(payload)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifySessionToken(SECRET, `${tamperedBody}.${sig}`)).toBeNull();
  });

  it("rechaza un token expirado", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const token = await createSessionToken(SECRET, "vet-ch", 42);
      vi.setSystemTime(new Date("2026-01-09T00:00:00Z")); // 8 días después (TTL es 7)
      expect(await verifySessionToken(SECRET, token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rechaza un token con formato inválido", async () => {
    expect(await verifySessionToken(SECRET, "no-es-un-token")).toBeNull();
    expect(await verifySessionToken(SECRET, "")).toBeNull();
  });
});
