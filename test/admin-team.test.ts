import { describe, expect, it, vi } from "vitest";
import { createAdminUser, deleteAdminUser, getAdminUserByEmail, listAdminUsers, setAdminUserPassword } from "../src/admin/team";

function mockDb(firstResult: unknown = null) {
  const run = vi.fn().mockResolvedValue({ success: true });
  const first = vi.fn().mockResolvedValue(firstResult);
  const all = vi.fn().mockResolvedValue({ results: [] });
  const bind = vi.fn().mockReturnValue({ run, first, all });
  const prepare = vi.fn().mockReturnValue({ bind, run, first, all });
  return { db: { prepare } as unknown as D1Database, prepare, bind, run, first, all };
}

describe("getAdminUserByEmail", () => {
  it("devuelve null si no existe", async () => {
    const { db } = mockDb(null);
    expect(await getAdminUserByEmail(db, "nadie@x.com")).toBeNull();
  });

  it("mapea la fila a AdminUser", async () => {
    const { db } = mockDb({ id: 1, email: "a@b.com", password_hash: "hash", role: "operador" });
    expect(await getAdminUserByEmail(db, "a@b.com")).toEqual({ id: 1, email: "a@b.com", passwordHash: "hash", role: "operador" });
  });
});

describe("createAdminUser", () => {
  it("inserta email, password_hash y role", async () => {
    const { db, bind } = mockDb();
    await createAdminUser(db, "a@b.com", "hash", "admin");
    expect(bind).toHaveBeenCalledWith("a@b.com", "hash", "admin");
  });
});

describe("listAdminUsers", () => {
  it("mapea created_at a createdAt", async () => {
    const { db, all } = mockDb();
    all.mockResolvedValue({ results: [{ id: 1, email: "a@b.com", role: "admin", created_at: "2026-01-01" }] });
    expect(await listAdminUsers(db)).toEqual([{ id: 1, email: "a@b.com", role: "admin", createdAt: "2026-01-01" }]);
  });
});

describe("setAdminUserPassword / deleteAdminUser", () => {
  it("actualiza el password_hash por id", async () => {
    const { db, bind } = mockDb();
    await setAdminUserPassword(db, 5, "nuevo-hash");
    expect(bind).toHaveBeenCalledWith("nuevo-hash", 5);
  });

  it("borra por id", async () => {
    const { db, bind } = mockDb();
    await deleteAdminUser(db, 5);
    expect(bind).toHaveBeenCalledWith(5);
  });
});
