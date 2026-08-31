import { describe, expect, it, vi } from "vitest";
import { createCatalogItem, deleteCatalogItem, listCatalogItems, searchCatalogItems, updateCatalogItem } from "../src/catalog";

describe("listCatalogItems", () => {
  it("mapea las filas a CatalogItem", async () => {
    const all = vi.fn().mockResolvedValue({
      results: [{ item_id: "depa-polanco", title: "Depa en Polanco", description: "2 recámaras", price: "$2,500,000", photo_url: "https://x.com/a.jpg", updated_at: "2026-08-30 10:00:00" }],
    });
    const bind = vi.fn().mockReturnValue({ all });
    const db = { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database;

    const items = await listCatalogItems(db, "sofia-inmobiliaria");

    expect(items).toEqual([
      { itemId: "depa-polanco", title: "Depa en Polanco", description: "2 recámaras", price: "$2,500,000", photoUrl: "https://x.com/a.jpg", updatedAt: "2026-08-30 10:00:00" },
    ]);
  });
});

describe("createCatalogItem", () => {
  it("genera un slug único a partir del título", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ first, run });
    const db = { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database;

    const itemId = await createCatalogItem(db, "sofia-inmobiliaria", "Depa en Polanco", "2 recámaras", "$2,500,000", "https://x.com/a.jpg");

    expect(itemId).toBe("depa-en-polanco");
    expect(bind).toHaveBeenCalledWith("sofia-inmobiliaria", "depa-en-polanco", "Depa en Polanco", "2 recámaras", "$2,500,000", "https://x.com/a.jpg");
  });

  it("evita colisiones agregando un sufijo numérico", async () => {
    const first = vi.fn().mockResolvedValueOnce({ exists: 1 }).mockResolvedValueOnce(null);
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ first, run });
    const db = { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database;

    const itemId = await createCatalogItem(db, "t", "Pizza", "Con queso", null, null);
    expect(itemId).toBe("pizza-2");
  });
});

describe("updateCatalogItem / deleteCatalogItem", () => {
  it("update pasa los campos en el orden esperado", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const db = { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database;

    await updateCatalogItem(db, "t", "pizza", "Pizza margarita", "Con queso y albahaca", "$150", null);
    expect(bind).toHaveBeenCalledWith("Pizza margarita", "Con queso y albahaca", "$150", null, "t", "pizza");
  });

  it("delete filtra por tenant_id + item_id", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    await deleteCatalogItem(db, "t", "pizza");
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM catalog_items"));
    expect(bind).toHaveBeenCalledWith("t", "pizza");
  });
});

describe("searchCatalogItems", () => {
  it("busca con LIKE contra título y descripción, con límite", async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    await searchCatalogItems(db, "t", "Polanco");

    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("LIKE"));
    expect(bind).toHaveBeenCalledWith("t", "%polanco%", "%polanco%", 3);
  });

  // Bug real encontrado en la primera prueba funcional (2026-08-31): una
  // consulta de varias palabras nunca calzaba como una sola subcadena
  // contra un título más corto — el modelo casi nunca repite el título
  // exacto. Ahora busca por palabra (OR entre ellas), filtrando
  // conectores comunes.
  it("busca por palabra individual, no por la frase completa (bug real: 'playeras de algodón' no calzaba con 'Playera básica algodón')", async () => {
    const bind = vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: [] }) });
    const db = { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database;

    await searchCatalogItems(db, "t", "playeras de algodón");

    // "de" se filtra (conector corto); "playeras" y "algodón" quedan.
    expect(bind).toHaveBeenCalledWith("t", "%playeras%", "%playeras%", "%algodón%", "%algodón%", 3);
  });

  it("cae de vuelta a la frase completa si no quedan palabras útiles tras filtrar conectores", async () => {
    const bind = vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: [] }) });
    const db = { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database;

    await searchCatalogItems(db, "t", "de con que");

    expect(bind).toHaveBeenCalledWith("t", "%de con que%", "%de con que%", 3);
  });
});
