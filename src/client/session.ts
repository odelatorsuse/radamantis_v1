// Etapa 10 (consola del cliente, D10 "JWT por tenant"): token de sesión
// firmado, minimalista — no es un JWT completo (sin header/alg negociable,
// que es justo la superficie de ataque que más problemas de seguridad le
// ha dado a JWT en la práctica) sino un payload JSON + firma HMAC-SHA256
// fija, suficiente para este caso de uso y sin dependencias externas.
export interface SessionPayload {
  tenantId: string;
  userId: number;
  exp: number; // epoch ms
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

export async function createSessionToken(secret: string, tenantId: string, userId: number): Promise<string> {
  const payload: SessionPayload = { tenantId, userId, exp: Date.now() + SESSION_TTL_MS };
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = base64url(await hmacSign(secret, body));
  return `${body}.${sig}`;
}

export async function verifySessionToken(secret: string, token: string): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sigB64] = parts;

  const expected = await hmacSign(secret, body);
  const actual = base64urlDecode(sigB64);
  if (actual.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
