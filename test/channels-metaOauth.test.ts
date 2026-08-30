import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFacebookAuthUrl,
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  listManagedPages,
} from "../src/channels/metaOauth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildFacebookAuthUrl", () => {
  it("arma la URL del diálogo de OAuth con client_id, redirect_uri y state", () => {
    const url = buildFacebookAuthUrl("app-123", "https://radamantis.dev/oauth/facebook/callback", "vet-ch");
    expect(url).toContain("https://www.facebook.com/");
    expect(url).toContain("/dialog/oauth?");
    expect(url).toContain("client_id=app-123");
    expect(url).toContain("redirect_uri=" + encodeURIComponent("https://radamantis.dev/oauth/facebook/callback"));
    expect(url).toContain("state=vet-ch");
    expect(url).toContain("response_type=code");
  });
});

describe("exchangeCodeForUserToken", () => {
  it("intercambia el code por un access_token de usuario", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "short-lived-token" }) }));
    const token = await exchangeCodeForUserToken("app-123", "app-secret", "https://redirect", "the-code");
    expect(token).toBe("short-lived-token");
  });

  it("lanza un error claro si Meta falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "invalid code" }));
    await expect(exchangeCodeForUserToken("app-123", "app-secret", "https://redirect", "bad-code")).rejects.toThrow(/code→token/);
  });
});

describe("exchangeForLongLivedUserToken", () => {
  it("pide el token de larga duración con grant_type=fb_exchange_token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "long-lived-token" }) });
    vi.stubGlobal("fetch", fetchMock);
    const token = await exchangeForLongLivedUserToken("app-123", "app-secret", "short-lived-token");
    expect(token).toBe("long-lived-token");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("grant_type=fb_exchange_token");
    expect(url).toContain("fb_exchange_token=short-lived-token");
  });
});

describe("listManagedPages", () => {
  it("devuelve las Páginas con su token y detecta el Instagram vinculado", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/me/accounts")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [{ id: "page-1", name: "Dr. Vet CH", access_token: "page-token-1" }] }),
        });
      }
      if (url.includes("/page-1?")) {
        return Promise.resolve({ ok: true, json: async () => ({ instagram_business_account: { id: "ig-account-1" } }) });
      }
      throw new Error("URL inesperada: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);

    const pages = await listManagedPages("long-lived-user-token");

    expect(pages).toEqual([
      { pageId: "page-1", pageName: "Dr. Vet CH", pageAccessToken: "page-token-1", instagramBusinessAccountId: "ig-account-1" },
    ]);
  });

  it("devuelve instagramBusinessAccountId null cuando la Página no tiene Instagram vinculado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/me/accounts")) {
          return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: "page-2", name: "Sofía Estética", access_token: "page-token-2" }] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );

    const pages = await listManagedPages("long-lived-user-token");
    expect(pages[0].instagramBusinessAccountId).toBeNull();
  });

  it("lanza un error claro si Meta falla al listar Páginas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "invalid token" }));
    await expect(listManagedPages("token-vencido")).rejects.toThrow(/listar Páginas/);
  });
});
