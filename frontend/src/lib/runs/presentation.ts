import type { Schema } from "@/lib/api/types";

export const stageLabels: Record<Schema<"Stage">["state"], string> = {
  not_requested: "Sin solicitar",
  pending: "Pendiente",
  running: "En proceso",
  complete: "Disponible",
  insufficient: "Información insuficiente",
  failed: "Error",
  blocked: "Bloqueado",
  uncertain: "Resultado incierto",
  not_applicable: "No aplica",
};
export const phaseLabels: Record<Schema<"Run">["current_stage"], string> = {
  acquisition: "Recolección",
  ia_relevance: "Pertinencia de IA",
  grouping: "Agrupación temática",
  awaiting_confirmation: "Confirmación de grupos",
  comparison: "Comparación temática",
  idle: "Sin paso pendiente",
};
const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function dateLabel(value: string): string {
  return dateFormatter.format(new Date(value));
}
export function phaseLabel(value: string): string {
  const analysis: Record<string, string> = {
    audiovisual: "Análisis audiovisual",
    value: "Valor para la audiencia",
    persona: "Afinidad de persona",
    company_context: "Contexto empresarial",
    pillar: "Pilar editorial",
    synthesis: "Síntesis y adaptación",
  };
  if (Object.hasOwn(analysis, value)) return analysis[value];
  return Object.hasOwn(phaseLabels, value)
    ? phaseLabels[value as keyof typeof phaseLabels]
    : value;
}
export function discoveryLabel(
  cell: Schema<"CoverageCell"> | undefined,
): string {
  if (!cell) return "Desconocido";
  if (cell.acquisition.state === "complete" && cell.pagination_complete)
    return `${cell.discovered_video_ids.length} publicaciones observadas`;
  if (cell.discovered_video_ids.length)
    return `${cell.discovered_video_ids.length} observadas · consulta incompleta`;
  return "Desconocido · consulta incompleta";
}

export function canAdvance(run: Schema<"Run">): boolean {
  return (
    run.allowed_actions.includes("advance_corpus") &&
    !run.operations_to_inspect.some(
      (operation) => operation.analysis_id === null,
    )
  );
}
