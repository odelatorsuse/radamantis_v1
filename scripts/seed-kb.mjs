#!/usr/bin/env node
// Etapa 5: script de ingesta de KB a Vectorize. Uso:
//   OPENAI_API_KEY=... node scripts/seed-kb.mjs <tenant_id> <kb.json> [out.ndjson]
//   npx wrangler vectorize insert radamantis-kb --file=<out.ndjson>
import { readFileSync, writeFileSync } from "node:fs";

const [tenantId, kbFile, outFile = "vectors.ndjson"] = process.argv.slice(2);
const apiKey = process.env.OPENAI_API_KEY;

if (!tenantId || !kbFile) {
  console.error("Uso: OPENAI_API_KEY=... node scripts/seed-kb.mjs <tenant_id> <kb.json> [out.ndjson]");
  process.exit(1);
}
if (!apiKey) {
  console.error("Falta OPENAI_API_KEY en el entorno.");
  process.exit(1);
}

const docs = JSON.parse(readFileSync(kbFile, "utf-8"));
const lines = [];

for (const doc of docs) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: doc.content }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings falló para ${doc.id}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const values = data.data[0].embedding;
  // D4: tenant_id en la metadata de cada vector — filtro obligatorio en toda query.
  lines.push(JSON.stringify({ id: `${tenantId}:${doc.id}`, values, metadata: { tenant_id: tenantId, doc_id: doc.id, content: doc.content } }));
  console.log(`Embebido: ${doc.id}`);
}

writeFileSync(outFile, lines.join("\n") + "\n");
console.log(`Escrito ${lines.length} vectores en ${outFile}`);
console.log(`Ahora corre: npx wrangler vectorize insert radamantis-kb --file=${outFile}`);
