import { createSignedToken, verifySignedToken, type SignedPayload } from "../session";

export type AdminRole = "admin" | "operador";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días, mismo TTL que /console

export interface AdminSessionPayload extends SignedPayload {
  userId: number;
  email: string;
  role: AdminRole;
}

// Secreto propio (ADMIN_SESSION_SECRET), distinto del CLIENT_SESSION_SECRET
// de /console a propósito — un token de sesión de un tenant nunca debe
// poder validar aquí, ni viceversa, aunque ambos usen la misma firma HMAC.
export async function createAdminSessionToken(secret: string, userId: number, email: string, role: AdminRole): Promise<string> {
  return createSignedToken<AdminSessionPayload>(secret, { userId, email, role, exp: Date.now() + SESSION_TTL_MS });
}

export async function verifyAdminSessionToken(secret: string, token: string): Promise<AdminSessionPayload | null> {
  return verifySignedToken<AdminSessionPayload>(secret, token);
}
