import { describe, expect, it } from "vitest";
import { appendMessage, getHistory } from "../src/messages";
import { createFakeD1 } from "./fakeD1";

// D3 (P0): test dedicado de fuga cross-tenant. Usa el mismo channel + chat_id
// para dos tenants distintos — el peor caso realista — y verifica que el
// repositorio real (no un mock por-llamada) nunca mezcla sus historiales.
describe("aislamiento cross-tenant en el historial de conversación", () => {
  it("un tenant no ve los mensajes de otro tenant aunque compartan channel y chat_id", async () => {
    const db = createFakeD1();
    const channel = "telegram";
    const sharedChatId = "999";

    await appendMessage(db, { tenantId: "vet-ch", channel, chatId: sharedChatId }, { role: "user", content: "dato confidencial de vet-ch" });
    await appendMessage(db, { tenantId: "segundo-tenant-test", channel, chatId: sharedChatId }, { role: "user", content: "dato confidencial del segundo tenant" });

    const historyVetCh = await getHistory(db, { tenantId: "vet-ch", channel, chatId: sharedChatId });
    const historySegundo = await getHistory(db, { tenantId: "segundo-tenant-test", channel, chatId: sharedChatId });

    expect(historyVetCh).toEqual([{ role: "user", content: "dato confidencial de vet-ch" }]);
    expect(historySegundo).toEqual([{ role: "user", content: "dato confidencial del segundo tenant" }]);
  });

  it("una conversación sin mensajes propios no hereda mensajes de otro tenant", async () => {
    const db = createFakeD1();
    await appendMessage(db, { tenantId: "vet-ch", channel: "telegram", chatId: "1" }, { role: "user", content: "solo de vet-ch" });

    const historyOtroTenant = await getHistory(db, { tenantId: "segundo-tenant-test", channel: "telegram", chatId: "1" });

    expect(historyOtroTenant).toEqual([]);
  });
});
