import { describe, expect, it } from "vitest";
import { getChannelProvider, listSupportedChannels } from "../src/channels/registry";

describe("getChannelProvider", () => {
  it("devuelve el adaptador de telegram", () => {
    const provider = getChannelProvider("telegram");
    expect(provider?.channel).toBe("telegram");
    expect(provider?.displayName).toBe("Telegram");
  });

  it("devuelve el adaptador de sitio web", () => {
    const provider = getChannelProvider("web");
    expect(provider?.channel).toBe("web");
    expect(provider?.displayName).toBe("Sitio web");
  });

  it("devuelve el adaptador de facebook", () => {
    const provider = getChannelProvider("facebook");
    expect(provider?.channel).toBe("facebook");
    expect(provider?.displayName).toBe("Facebook Messenger");
  });

  it("devuelve el adaptador de instagram", () => {
    const provider = getChannelProvider("instagram");
    expect(provider?.channel).toBe("instagram");
    expect(provider?.displayName).toBe("Instagram");
  });

  // Backlog de Agencia (WhatsApp): whatsapp ya tiene adaptador real, dejó de
  // ser el ejemplo de "canal sin adaptador".
  it("devuelve el adaptador de whatsapp", () => {
    const provider = getChannelProvider("whatsapp");
    expect(provider?.channel).toBe("whatsapp");
    expect(provider?.displayName).toBe("WhatsApp");
  });

  it("devuelve null para un canal sin adaptador todavía (ej. messenger de escritorio)", () => {
    expect(getChannelProvider("messenger")).toBeNull();
    expect(getChannelProvider("sms")).toBeNull();
  });
});

describe("listSupportedChannels", () => {
  it("incluye todos los canales con adaptador real", () => {
    const channels = listSupportedChannels().map((p) => p.channel);
    expect(channels).toContain("telegram");
    expect(channels).toContain("web");
    expect(channels).toContain("facebook");
    expect(channels).toContain("instagram");
    expect(channels).toContain("whatsapp");
  });
});
