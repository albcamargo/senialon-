import type { Schema } from "@/lib/api/types";
import type { AnalysisSnapshot } from "./types";

export const dimensionLabels: Record<
  Schema<"ObservationDimension">["dimension"],
  string
> = {
  format: "Formato",
  verbal_hook: "Gancho verbal",
  visual_hook: "Gancho visual",
  audio_hook: "Gancho auditivo",
  structure: "Estructura",
  problem: "Problema abordado",
};
export const valueLabels: Record<Schema<"ValueDecision">["decision"], string> =
  {
    supported_contribution: "Aporte respaldado",
    unsupported_utility: "Utilidad no sustentada",
    insufficient_information: "Información insuficiente",
  };
export const fitLabels: Record<Schema<"FitDecision">["decision"], string> = {
  supported: "Afinidad respaldada",
  unsupported: "Afinidad no sustentada",
  insufficient_information: "Información insuficiente",
};
export const pillarLabels: Record<
  Schema<"PillarDecision">["decision"],
  string
> = {
  ai_roi_costs: "ROI y costos de IA",
  ai_sales_automation: "Automatización comercial con IA",
  ai_operational_efficiency: "Eficiencia operativa con IA",
  ai_applied_leadership: "Liderazgo aplicado a IA",
  other_relevant: "Otro pertinente",
  insufficient_information: "Información insuficiente",
};
export const reviewLabels: Record<
  Schema<"EditorialReview">["decision"],
  string
> = {
  pending_review: "Pendiente de revisión",
  consider_for_adaptation: "Considerar para adaptación",
  discarded: "Descartada",
};
export const evidenceReviewLabels: Record<
  Schema<"EvidenceReview">["state"],
  string
> = {
  pending_review: "Pendiente de revisión",
  verified_against_source: "Contrastada con el original",
  disputed: "En disputa",
  insufficient_to_verify: "Información insuficiente para verificar",
};

export const analysisStages = new Set([
  "audiovisual",
  "value",
  "persona",
  "company_context",
  "pillar",
  "synthesis",
]);
export function analysisPath(
  runId: string,
  analysisId: string,
  version?: number,
) {
  return `/runs/${encodeURIComponent(runId)}/analyses/${encodeURIComponent(analysisId)}${version === undefined ? "" : `?analysis_version=${version}`}`;
}
export function parseAnalysisVersion(
  value: unknown,
): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
export function evidenceAnchor(id: string): string {
  return `evidence-${encodeURIComponent(id)}`;
}
export function timestampLabel(seconds: number): string {
  const whole = Math.floor(seconds);
  const fraction = seconds - whole;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}${fraction ? `,${String(seconds).split(".")[1]}` : ""}`;
}
export function canAdvanceAnalysis(snapshot: AnalysisSnapshot): boolean {
  return (
    snapshot.response.data.analysis_version === snapshot.latestVersion &&
    snapshot.response.current_actions.includes("advance_analysis") &&
    snapshot.response.operations_to_inspect.length === 0 &&
    snapshot.run.operations_to_inspect.length === 0 &&
    snapshot.run.budget.state === "allowed"
  );
}
