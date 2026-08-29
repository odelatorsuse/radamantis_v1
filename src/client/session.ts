import { createSignedToken, verifySignedToken, type SignedPayload } from "../session";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface SessionPayload extends SignedPayload {
  tenantId: string;
  userId: number;
}

export async function createSessionToken(secret: string, tenantId: string, userId: number): Promise<string> {
  return createSignedToken<SessionPayload>(secret, { tenantId, userId, exp: Date.now() + SESSION_TTL_MS });
}

export async function verifySessionToken(secret: string, token: string): Promise<SessionPayload | null> {
  return verifySignedToken<SessionPayload>(secret, token);
}
