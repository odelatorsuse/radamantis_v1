import { describe, expect, it, vi } from "vitest";
import { executeSearchCatalogTool } from "../src/catalogTool";
import type { ChannelProvider } from "../src/channels/provider";

function mockDbWithItems(items: { item_id: string; title: string; description: string; price: string | null; photo_url: string | null; updated_at: string }[]) {
  const all = vi.fn().mockResolvedValue({ results: items });
  const bind = vi.fn().mockReturnValue({ all });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare } as unknown as D1Database;
}

describe("executeSearchCatalogTool", () => {
  it("devuelve los items encontrados (sin la URL de la foto en el texto)", async () => {
    const db = mockDbWithItems([
      { item_id: "depa-polanco", title: "Depa en Polanco", description: "2 recámaras", price: "$2,500,000", photo_url: null, updated_at: "2026-08-30" },
    ]);

    const result = await executeSearchCatalogTool(db, "t", JSON.stringify({ query: "Polanco" }), null, null, "chat-1");

    expect(JSON.parse(result)).toEqual({
      items: [{ id: "depa-polanco", title: "Depa en Polanco", description: "2 recámaras", price: "$2,500,000" }],
    });
  });

  it("manda la foto por el canal cuando el item tiene una y el canal lo soporta", async () => {
    const db = mockDbWithItems([
      { item_id: "depa-polanco", title: "Depa en Polanco", description: "2 recámaras", price: "$2,500,000", photo_url: "https://x.com/a.jpg", updated_at: "2026-08-30" },
    ]);
    const sendPhoto = vi.fn().mockResolvedValue(undefined);
    const provider: ChannelProvider = { channel: "telegram", displayName: "Telegram", sendMessage: vi.fn(), sendPhoto };

    await executeSearchCatalogTool(db, "t", JSON.stringify({ query: "Polanco" }), provider, "bot-token", "chat-1");

    expect(sendPhoto).toHaveBeenCalledWith("bot-token", "chat-1", "https://x.com/a.jpg", "Depa en Polanco — $2,500,000");
  });

  it("no manda foto si el canal no la soporta (ej. widget de sitio web) — sigue devolviendo el texto", async () => {
    const db = mockDbWithItems([
      { item_id: "depa-polanco", title: "Depa en Polanco", description: "2 recámaras", price: null, photo_url: "https://x.com/a.jpg", updated_at: "2026-08-30" },
    ]);
    const provider: ChannelProvider = { channel: "web", displayName: "Sitio web", sendMessage: vi.fn() };

    const result = await executeSearchCatalogTool(db, "t", JSON.stringify({ query: "Polanco" }), provider, "dominio.com", "visitor-1");

    expect(JSON.parse(result).items).toHaveLength(1);
  });

  it("una foto que falla no tumba el resultado de texto (best-effort)", async () => {
    const db = mockDbWithItems([
      { item_id: "depa-polanco", title: "Depa en Polanco", description: "2 recámaras", price: null, photo_url: "https://x.com/a.jpg", updated_at: "2026-08-30" },
    ]);
    const sendPhoto = vi.fn().mockRejectedValue(new Error("boom"));
    const provider: ChannelProvider = { channel: "telegram", displayName: "Telegram", sendMessage: vi.fn(), sendPhoto };

    const result = await executeSearchCatalogTool(db, "t", JSON.stringify({ query: "Polanco" }), provider, "bot-token", "chat-1");

    expect(JSON.parse(result).items).toHaveLength(1);
  });

  it("devuelve un error claro si falta query", async () => {
    const db = mockDbWithItems([]);
    const result = await executeSearchCatalogTool(db, "t", JSON.stringify({}), null, null, "chat-1");
    expect(JSON.parse(result)).toEqual({ error: "Falta query" });
  });

  it("devuelve un error claro si los argumentos no son JSON válido", async () => {
    const db = mockDbWithItems([]);
    const result = await executeSearchCatalogTool(db, "t", "no-es-json", null, null, "chat-1");
    expect(JSON.parse(result)).toEqual({ error: "Argumentos inválidos" });
  });
});
