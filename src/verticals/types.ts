// D6: esquema declarativo de Vertical Template. El core lo carga por
// tenant.vertical_id en runtime — agregar un giro nuevo es un archivo
// nuevo en este directorio + una entrada en registry.ts, cero cambios
// a agent.ts/index.ts/prompts.ts.
export interface VerticalTemplate {
  verticalId: string;
  displayName: string;
  promptBase: string;
  toolsEnabled: string[];
  kbSchema: string[];
  superpowersDefault: string[];
}
