// Compartido por rag/kb.ts (documentos) y catalog.ts (items de catalogo):
// autoservicio desde /console -- el dueno del negocio solo captura un
// titulo, no piensa en "id" -- se deriva un slug legible a partir del
// titulo en vez de pedirle un identificador tecnico.
export function slugify(title: string, fallback: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}
