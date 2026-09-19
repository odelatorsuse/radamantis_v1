import { describe, expect, it } from "vitest";
import { getCategoryByChatId, getPadelSettings, isPadelCategory, listCategoryConfigs, PADEL_CATEGORIES, upsertCategoryConfig, upsertPadelSettings } from "../src/padelCategories";
import { createFakePadelD1 } from "./fakePadelD1";

describe("PADEL_CATEGORIES / isPadelCategory", () => {
  it("son exactamente las 6 categorías reales, de menor a mayor nivel", () => {
    expect(PADEL_CATEGORIES).toEqual(["6ta", "5ta", "4ta", "3ra", "2da", "1ra"]);
  });

  it("isPadelCategory rechaza texto libre", () => {
    expect(isPadelCategory("6ta")).toBe(true);
    expect(isPadelCategory("septima")).toBe(false);
  });
});

describe("listCategoryConfigs / upsertCategoryConfig", () => {
  it("devuelve las 6 categorías aunque ninguna esté configurada todavía", async () => {
    const db = createFakePadelD1();
    const configs = await listCategoryConfigs(db, "club-1");
    expect(configs).toHaveLength(6);
    for (const c of configs) {
      expect(c.weekday).toBeNull();
      expect(c.chatId).toBeNull();
    }
  });

  it("upsert guarda el día/chat de una categoría sin tocar las demás", async () => {
    const db = createFakePadelD1();
    await upsertCategoryConfig(db, "club-1", "6ta", { weekday: 2, chatId: "-1001111" });
    await upsertCategoryConfig(db, "club-1", "5ta", { weekday: 4, chatId: "-1002222" });

    const configs = await listCategoryConfigs(db, "club-1");
    const sexta = configs.find((c) => c.category === "6ta");
    const quinta = configs.find((c) => c.category === "5ta");
    const cuarta = configs.find((c) => c.category === "4ta");

    expect(sexta).toEqual({ category: "6ta", weekday: 2, chatId: "-1001111" });
    expect(quinta).toEqual({ category: "5ta", weekday: 4, chatId: "-1002222" });
    expect(cuarta).toEqual({ category: "4ta", weekday: null, chatId: null });
  });

  it("upsert sobre la misma categoría actualiza en vez de duplicar", async () => {
    const db = createFakePadelD1();
    await upsertCategoryConfig(db, "club-1", "6ta", { weekday: 2, chatId: "-1001111" });
    await upsertCategoryConfig(db, "club-1", "6ta", { weekday: 3, chatId: "-1001111" });

    const configs = await listCategoryConfigs(db, "club-1");
    expect(configs.find((c) => c.category === "6ta")).toEqual({ category: "6ta", weekday: 3, chatId: "-1001111" });
  });

  it("aislamiento cross-tenant: la configuración de un club no se mezcla con otro", async () => {
    const db = createFakePadelD1();
    await upsertCategoryConfig(db, "club-a", "6ta", { weekday: 2, chatId: "-1001111" });
    await upsertCategoryConfig(db, "club-b", "6ta", { weekday: 4, chatId: "-1002222" });

    const a = await listCategoryConfigs(db, "club-a");
    const b = await listCategoryConfigs(db, "club-b");
    expect(a.find((c) => c.category === "6ta")?.chatId).toBe("-1001111");
    expect(b.find((c) => c.category === "6ta")?.chatId).toBe("-1002222");
  });
});

describe("getCategoryByChatId", () => {
  it("resuelve la categoría real cuando el chat está vinculado", async () => {
    const db = createFakePadelD1();
    await upsertCategoryConfig(db, "club-1", "3ra", { weekday: 1, chatId: "-1009999" });

    expect(await getCategoryByChatId(db, "club-1", "-1009999")).toBe("3ra");
  });

  it("devuelve null si el chat no está vinculado a ninguna categoría", async () => {
    const db = createFakePadelD1();
    expect(await getCategoryByChatId(db, "club-1", "chat-desconocido")).toBeNull();
  });
});

describe("getPadelSettings / upsertPadelSettings", () => {
  it("default 5 rondas, 5 canchas, modalidad individual si no se ha configurado nada", async () => {
    const db = createFakePadelD1();
    expect(await getPadelSettings(db, "club-1")).toEqual({ rounds: 5, courtCount: 5, defaultRegistrationMode: "individual" });
  });

  it("upsert cambia rondas, canchas y modalidad por defecto", async () => {
    const db = createFakePadelD1();
    await upsertPadelSettings(db, "club-1", { rounds: 4, courtCount: 3, defaultRegistrationMode: "pareja" });
    expect(await getPadelSettings(db, "club-1")).toEqual({ rounds: 4, courtCount: 3, defaultRegistrationMode: "pareja" });
  });
});
