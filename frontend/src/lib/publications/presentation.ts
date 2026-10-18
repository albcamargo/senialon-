import type { Schema } from "@/lib/api/types";

export const shortLabels: Record<
  Schema<"Publication">["short_status"],
  string
> = {
  candidate_short: "Candidato corto",
  confirmed_short: "Short confirmado",
  undetermined: "Condición de Short sin determinar",
};

const metrics = new Intl.NumberFormat("es-CO");
export function metricLabel(metric: Schema<"Metric">): string {
  return metric.state === "known"
    ? metrics.format(BigInt(metric.value))
    : "No disponible";
}
export function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function mergePublications(
  previous: Schema<"PublicationsResponse">,
  next: Schema<"PublicationsResponse">,
): Schema<"PublicationsResponse"> {
  const ids = new Set(previous.items.map((item) => item.video_id));
  if (
    previous.snapshot_revision !== next.snapshot_revision ||
    previous.next_cursor === null ||
    previous.next_cursor === next.next_cursor ||
    next.items.some((item) => ids.has(item.video_id))
  )
    throw new Error(
      "El catálogo cambió; consulta de nuevo sin mezclar páginas.",
    );
  return { ...next, items: [...previous.items, ...next.items] };
}

export function mergeSelections(
  previous: Schema<"AnalysesResponse">,
  next: Schema<"AnalysesResponse">,
): Schema<"AnalysesResponse"> {
  const ids = new Set(previous.items.map((item) => item.analysis_id));
  const videos = new Set(previous.items.map((item) => item.video_id));
  if (
    previous.snapshot_revision !== next.snapshot_revision ||
    previous.next_cursor === null ||
    previous.next_cursor === next.next_cursor ||
    next.items.some(
      (item) => ids.has(item.analysis_id) || videos.has(item.video_id),
    )
  )
    throw new Error(
      "Las selecciones cambiaron; consulta de nuevo sin mezclar páginas.",
    );
  return { ...next, items: [...previous.items, ...next.items] };
}
