import { sandboxTemplate } from "./sandbox";
import type { VerticalTemplate } from "./types";
import { veterinariaTemplate } from "./veterinaria";

const TEMPLATES: Record<string, VerticalTemplate> = {
  veterinaria: veterinariaTemplate,
  sandbox: sandboxTemplate,
};

export function getVerticalTemplate(verticalId: string): VerticalTemplate {
  return TEMPLATES[verticalId] ?? sandboxTemplate;
}

// D9: expuesto vía /api/admin/verticals para que el dashboard (y luego el
// Skill) sepan qué giros existen sin tener que conocer el código del core.
export function listVerticalTemplates(): VerticalTemplate[] {
  return Object.values(TEMPLATES);
}
