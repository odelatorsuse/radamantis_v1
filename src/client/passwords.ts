// Etapa 10 (consola del cliente): hashing de contraseñas con PBKDF2 vía
// Web Crypto (disponible nativo en Workers) — sin dependencia externa tipo
// bcrypt, consistente con el resto del proyecto (fetch directo, sin SDKs).
const ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, keyMaterial, KEY_LENGTH_BITS);
  return new Uint8Array(bits);
}

// Formato de almacenamiento: "iteraciones:salt_hex:hash_hex" — las
// iteraciones viajan con el hash para poder subirlas en el futuro sin
// invalidar contraseñas ya guardadas con un valor menor.
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, ITERATIONS);
  return `${ITERATIONS}:${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [iterationsStr, saltHex, hashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  const salt = fromHex(saltHex);
  const expected = fromHex(hashHex);
  const actual = await deriveBits(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  // Comparación en tiempo constante — evita filtrar por timing cuántos
  // bytes coinciden.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
