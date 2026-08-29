import { describe, expect, it } from "vitest";
import { getChannelProvider, listSupportedChannels } from "../src/channels/registry";

describe("getChannelProvider", () => {
  it("devuelve el adaptador de telegram", () => {
    const provider = getChannelProvider("telegram");
    expect(provider?.channel).toBe("telegram");
    expect(provider?.displayName).toBe("Telegram");
  });

  it("devuelve null para un canal sin adaptador todavía (ej. whatsapp)", () => {
    expect(getChannelProvider("whatsapp")).toBeNull();
    expect(getChannelProvider("messenger")).toBeNull();
    expect(getChannelProvider("instagram")).toBeNull();
  });
});

describe("listSupportedChannels", () => {
  it("incluye telegram", () => {
    const channels = listSupportedChannels().map((p) => p.channel);
    expect(channels).toContain("telegram");
  });
});
