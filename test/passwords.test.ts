import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/passwords";

describe("hashPassword / verifyPassword", () => {
  it("verifica correctamente la contraseña original", async () => {
    const hash = await hashPassword("mi-contraseña-segura");
    expect(await verifyPassword("mi-contraseña-segura", hash)).toBe(true);
  });

  it("rechaza una contraseña incorrecta", async () => {
    const hash = await hashPassword("mi-contraseña-segura");
    expect(await verifyPassword("otra-contraseña", hash)).toBe(false);
  });

  it("nunca guarda la contraseña en texto plano", async () => {
    const hash = await hashPassword("mi-contraseña-segura");
    expect(hash).not.toContain("mi-contraseña-segura");
  });

  it("dos hashes de la misma contraseña son distintos (salt aleatorio)", async () => {
    const a = await hashPassword("misma-contraseña");
    const b = await hashPassword("misma-contraseña");
    expect(a).not.toBe(b);
    expect(await verifyPassword("misma-contraseña", a)).toBe(true);
    expect(await verifyPassword("misma-contraseña", b)).toBe(true);
  });

  it("devuelve false ante un hash con formato inválido, sin lanzar", async () => {
    await expect(verifyPassword("algo", "formato-invalido")).resolves.toBe(false);
  });
});
