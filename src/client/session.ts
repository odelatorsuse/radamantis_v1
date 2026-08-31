import { createSignedToken, verifySignedToken, type SignedPayload } from "../session";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
// Agencia ("ver consola sin cambiar de ventana"): un admin puede entrar a
// la consola de cualquier tenant sin su contraseña — corta duración a
// propósito, es un token de "vista", no un login real.
const IMPERSONATION_TTL_MS = 15 * 60 * 1000; // 15 minutos
// Sentinel: no hay un tenant_user real detrás de una impersonación desde
// /admin. userId no se usa para nada en /api/client/* (solo tenantId, ver
// el middleware en client/routes.ts) — es seguro que no corresponda a una
// fila real.
const IMPERSONATION_USER_ID = -1;

export interface SessionPayload extends SignedPayload {
  tenantId: string;
  userId: number;
}

export async function createSessionToken(secret: string, tenantId: string, userId: number): Promise<string> {
  return createSignedToken<SessionPayload>(secret, { tenantId, userId, exp: Date.now() + SESSION_TTL_MS });
}

export async function createImpersonationToken(secret: string, tenantId: string): Promise<string> {
  return createSignedToken<SessionPayload>(secret, { tenantId, userId: IMPERSONATION_USER_ID, exp: Date.now() + IMPERSONATION_TTL_MS });
}

export async function verifySessionToken(secret: string, token: string): Promise<SessionPayload | null> {
  return verifySignedToken<SessionPayload>(secret, token);
}
