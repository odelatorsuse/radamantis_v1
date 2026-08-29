import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyBusinessOwner } from "../src/vigilante";

const ref = { tenantId: "vet-ch", channel: "telegram", chatId: "555" };

// Despacha por contenido del SQL, mismo patrón que test/noShowSweep.test.ts:
// notifyBusinessOwner lee tenant_settings (getTenantSettings) y
// channel_bindings (getChannelExternalId).
function mockDb(opts: { alertChatId?: string | null; channelToken?: string | null } = {}) {
  const alertChatId = opts.alertChatId === undefined ? "999" : opts.alertChatId;
  const channelToken = opts.channelToken === undefined ? "bot-token-vet-ch" : opts.channelToken;

  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn(() => ({
      first: vi.fn().mockResolvedValue(
        sql.includes("FROM tenant_settings")
          ? {
              tone: "calido",
              language: "es",
              currency: "MXN",
              prompt_override: null,
              timezone: "America/Mexico_City",
              business_hours: "{}",
              alert_chat_id: alertChatId,
              alert_activation_code: null,
            }
          : sql.includes("FROM channel_bindings")
            ? channelToken !== null
              ? { external_id: channelToken }
              : null
            : null,
      ),
    })),
  }));

  return { prepare } as unknown as D1Database;
}

describe("notifyBusinessOwner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no manda nada si el tenant no configuró alertChatId (opt-in)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = mockDb({ alertChatId: null });

    await notifyBusinessOwner(db, ref, "esto es una estafa");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("manda una alerta real por Telegram al chat_id configurado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const db = mockDb({ alertChatId: "999" });

    await notifyBusinessOwner(db, ref, "quiero hablar con una persona");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token-vet-ch/sendMessage",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.chat_id).toBe(999);
    expect(body.text).toContain("quiero hablar con una persona");
    expect(body.text).toContain("telegram #555");
  });

  it("no lanza si no hay channel_binding para el tenant (best-effort)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = mockDb({ alertChatId: "999", channelToken: null });

    await expect(notifyBusinessOwner(db, ref, "urgente")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no lanza si el envío por Telegram falla (best-effort)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const db = mockDb({ alertChatId: "999" });

    await expect(notifyBusinessOwner(db, ref, "urgente")).resolves.toBeUndefined();
  });
});
