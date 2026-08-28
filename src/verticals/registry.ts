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
