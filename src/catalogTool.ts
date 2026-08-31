import { searchCatalogItems } from "./catalog";
import type { ChannelProvider } from "./channels/provider";
import type { ToolDefinition } from "./llm/provider";

// Agencia (Fase 2b: catálogo con fotos — inmobiliaria/restaurante/
// panadería/tienda). Un solo tool call: busca en el catálogo real Y manda
// las fotos de lo que encontró (best-effort, si el canal las soporta),
// para que el modelo solo tenga que redactar el texto de seguimiento —
// mismo motivo por el que nunca inventa un producto: el resultado sale
// 100% de catalog_items, nunca del propio modelo.
export const SEARCH_CATALOG_TOOL: ToolDefinition = {
  name: "searchCatalog",
  description:
    "Busca en el catálogo real de productos/propiedades/menú del negocio (con fotos, si las tiene). " +
    "Úsala cuando el cliente pregunte por algo específico que el negocio vende u ofrece. Nunca " +
    "inventes un producto, propiedad o platillo que no aparezca en el resultado de esta tool.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Palabras clave de lo que busca el cliente, ej. 'departamento en Polanco' o 'pizza'" },
    },
    required: ["query"],
  },
};

interface SearchCatalogArgs {
  query?: string;
}

export async function executeSearchCatalogTool(
  db: D1Database,
  tenantId: string,
  rawArguments: string,
  channelProvider: ChannelProvider | null,
  channelExternalId: string | null,
  chatId: string,
): Promise<string> {
  let args: SearchCatalogArgs;
  try {
    args = JSON.parse(rawArguments) as SearchCatalogArgs;
  } catch {
    return JSON.stringify({ error: "Argumentos inválidos" });
  }
  if (!args.query) {
    return JSON.stringify({ error: "Falta query" });
  }

  const items = await searchCatalogItems(db, tenantId, args.query);

  // Best-effort: si el canal no manda fotos (ej. el widget de sitio web) o
  // un item no tiene foto, el texto del resultado sigue siendo suficiente
  // para que el modelo responda — nunca bloquea la conversación por esto.
  if (channelProvider?.sendPhoto && channelExternalId) {
    for (const item of items) {
      if (!item.photoUrl) continue;
      try {
        const caption = item.price ? `${item.title} — ${item.price}` : item.title;
        await channelProvider.sendPhoto(channelExternalId, chatId, item.photoUrl, caption);
      } catch {
        // best-effort — una foto que falla no debe tumbar la respuesta de texto.
      }
    }
  }

  return JSON.stringify({
    items: items.map((item) => ({ id: item.itemId, title: item.title, description: item.description, price: item.price })),
  });
}
