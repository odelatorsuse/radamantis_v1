// Etapa 10 (superpower "Oído y vista", D5-style: CORE la capacidad técnica,
// TOGGLE por plan — hoy no hay sistema de planes, así que está disponible
// para todos los tenants). Voz e imágenes se convierten a TEXTO aquí, antes
// de llegar al agente — reutiliza toda la conversación normal (tools, KB,
// reglas anti-invento, memoria) sin tener que extender LLMProvider/
// LLMMessage para contenido multimodal. Mismo estilo que rag/embeddings.ts:
// va directo a OpenAI con fetch, sin SDK — D5 (LLMProvider) cubre
// completions de chat de texto, no hay equivalente multimodal ahí todavía.

export async function transcribeVoice(apiKey: string, audio: ArrayBuffer, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mimeType }), "audio.ogg");
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`OpenAI transcription falló: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}

// Describe la imagen en vez de dejar que el modelo principal "vea" los
// píxeles directamente — la descripción entra a la conversación como texto
// normal, con las mismas reglas CORE_ANTI_INVENTION_RULES ya aplicando
// (nunca un diagnóstico definitivo). El prompt de descripción refuerza lo
// mismo desde este primer paso, en capas.
const IMAGE_DESCRIPTION_PROMPT =
  "Describe de forma objetiva y breve lo que ves en esta imagen, en el contexto de un negocio de servicios " +
  "(ej. una mascota, una instalación, un comprobante de pago). Nunca des un diagnóstico médico ni una " +
  'conclusión definitiva sobre qué le pasa — solo describe lo observable (ej. "un perro con una mancha ' +
  'roja en la pata trasera izquierda", nunca "tiene una infección").';

export async function describeImage(apiKey: string, image: ArrayBuffer, mimeType: string): Promise<string> {
  const base64 = arrayBufferToBase64(image);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: IMAGE_DESCRIPTION_PROMPT },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 300,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI vision falló: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
