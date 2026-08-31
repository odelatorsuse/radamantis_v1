import { barberiaTemplate } from "./barberia";
import { cafeteriaPanaderiaTemplate } from "./cafeteriaPanaderia";
import { clinicaTemplate } from "./clinica";
import { coachTemplate } from "./coach";
import { dentistaTemplate } from "./dentista";
import { esteticaTemplate } from "./estetica";
import { gimnasioTemplate } from "./gimnasio";
import { inmobiliariaTemplate } from "./inmobiliaria";
import { restauranteTemplate } from "./restaurante";
import { sandboxTemplate } from "./sandbox";
import { spaTemplate } from "./spa";
import { tiendaTemplate } from "./tienda";
import type { VerticalTemplate } from "./types";
import { veterinariaTemplate } from "./veterinaria";

const TEMPLATES: Record<string, VerticalTemplate> = {
  veterinaria: veterinariaTemplate,
  estetica: esteticaTemplate,
  dentista: dentistaTemplate,
  gimnasio: gimnasioTemplate,
  restaurante: restauranteTemplate,
  barberia: barberiaTemplate,
  clinica: clinicaTemplate,
  cafeteria_panaderia: cafeteriaPanaderiaTemplate,
  tienda: tiendaTemplate,
  spa: spaTemplate,
  inmobiliaria: inmobiliariaTemplate,
  coach: coachTemplate,
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
