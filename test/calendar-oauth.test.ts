import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGoogleAuthUrl, exchangeCodeForTokens, getValidAccessToken } from "../src/calendar/oauth";

describe("buildGoogleAuthUrl", () => {
  it("arma la URL de consentimiento con client_id, redirect_uri, scope y state=tenantId", () => {
    const url = buildGoogleAuthUrl("client-123", "https://x.workers.dev/oauth/google/callback", "vet-ch");
    expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth?");
    expect(url).toContain("client_id=client-123");
    expect(url).toContain("state=vet-ch");
    expect(url).toContain("access_type=offline");
    expect(url).toContain(encodeURIComponent("https://www.googleapis.com/auth/calendar"));
  });
});

describe("exchangeCodeForTokens", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devuelve accessToken/refreshToken/expiresAt cuando Google responde bien", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }),
      }),
    );

    const result = await exchangeCodeForTokens("id", "secret", "https://x/callback", "auth-code");

    expect(result.accessToken).toBe("acc");
    expect(result.refreshToken).toBe("ref");
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("lanza un error claro si Google no devuelve refresh_token (tenant ya había autorizado antes)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "acc", expires_in: 3600 }) }),
    );

    await expect(exchangeCodeForTokens("id", "secret", "https://x/callback", "auth-code")).rejects.toThrow(
      /refresh_token/,
    );
  });
});

describe("getValidAccessToken", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devuelve null si el tenant no tiene calendario conectado", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    expect(await getValidAccessToken(db, "id", "secret", "vet-ch")).toBeNull();
  });

  it("reusa el access_token si todavía no vence", async () => {
    const futureExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const first = vi.fn().mockResolvedValue({
      tenant_id: "vet-ch",
      provider: "google",
      access_token: "still-valid",
      refresh_token: "ref",
      expires_at: futureExpiry,
      calendar_id: "primary",
      connected_at: "2026-01-01",
    });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getValidAccessToken(db, "id", "secret", "vet-ch");

    expect(result).toEqual({ accessToken: "still-valid", calendarId: "primary" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refresca el access_token si ya venció", async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();
    const first = vi.fn().mockResolvedValue({
      tenant_id: "vet-ch",
      provider: "google",
      access_token: "expired",
      refresh_token: "ref-token",
      expires_at: pastExpiry,
      calendar_id: "primary",
      connected_at: "2026-01-01",
    });
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn((..._args: unknown[]) => ({ first, run }));
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "fresh", expires_in: 3600 }) }),
    );

    const result = await getValidAccessToken(db, "id", "secret", "vet-ch");

    expect(result).toEqual({ accessToken: "fresh", calendarId: "primary" });
  });
});
