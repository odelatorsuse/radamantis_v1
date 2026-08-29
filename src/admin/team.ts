import type { AdminRole } from "./session";

// Etapa Agencia (Equipo/roles): admin_users NO está atado a un tenant (a
// diferencia de tenant_users, ver client/repository.ts) — un admin/operador
// ve todos los tenants, según su rol.

export interface AdminUser {
  id: number;
  email: string;
  passwordHash: string;
  role: AdminRole;
}

export interface AdminUserSummary {
  id: number;
  email: string;
  role: AdminRole;
  createdAt: string;
}

export async function getAdminUserByEmail(db: D1Database, email: string): Promise<AdminUser | null> {
  const row = await db
    .prepare("SELECT id, email, password_hash, role FROM admin_users WHERE email = ?")
    .bind(email)
    .first<{ id: number; email: string; password_hash: string; role: AdminRole }>();
  if (!row) return null;
  return { id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role };
}

export async function createAdminUser(db: D1Database, email: string, passwordHash: string, role: AdminRole): Promise<void> {
  await db.prepare("INSERT INTO admin_users (email, password_hash, role) VALUES (?, ?, ?)").bind(email, passwordHash, role).run();
}

export async function listAdminUsers(db: D1Database): Promise<AdminUserSummary[]> {
  const { results } = await db
    .prepare("SELECT id, email, role, created_at FROM admin_users ORDER BY created_at ASC")
    .all<{ id: number; email: string; role: AdminRole; created_at: string }>();
  return results.map((r) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.created_at }));
}

export async function setAdminUserPassword(db: D1Database, userId: number, passwordHash: string): Promise<void> {
  await db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").bind(passwordHash, userId).run();
}

export async function deleteAdminUser(db: D1Database, userId: number): Promise<void> {
  await db.prepare("DELETE FROM admin_users WHERE id = ?").bind(userId).run();
}
