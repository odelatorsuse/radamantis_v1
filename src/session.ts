// Núcleo genérico de tokens firmados, compartido por las sesiones de
// /console (tenant) y /admin (equipo) — cada superficie usa su propio
// secreto y su propia forma de payload (nunca comparten uno ni otro, así
// un token de un tenant jamás valida en el otro lado). No es un JWT
// completo (sin header/alg negociable, la superficie de ataque que más
// problemas le ha dado a JWT en la práctica) sino payload JSON + firma
// HMAC-SHA256 fija — suficiente para este caso de uso, sin dependencias.
export interface SignedPayload {
  exp: number; // epoch ms
}

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

export async function createSignedToken<T extends SignedPayload>(secret: string, payload: T): Promise<string> {
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = base64url(await hmacSign(secret, body));
  return `${body}.${sig}`;
}

export async function verifySignedToken<T extends SignedPayload>(secret: string, token: string): Promise<T | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sigB64] = parts;

  const expected = await hmacSign(secret, body);
  const actual = base64urlDecode(sigB64);
  if (actual.length !== expected.length) return null;
  // Comparación en tiempo constante — evita filtrar por timing cuántos bytes coinciden.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body))) as T;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
