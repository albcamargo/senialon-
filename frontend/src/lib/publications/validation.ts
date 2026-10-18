import "server-only";
import type { Schema } from "@/lib/api/types";
import type { SavedSelection } from "./types";

function insideWindow(
  windows: Schema<"Windows">,
  publication: Schema<"Publication">,
): boolean {
  if (!publication.window || !publication.published_at)
    return publication.eligibility !== "eligible";
  const window = windows[publication.window];
  const published = Date.parse(publication.published_at);
  return (
    published >= Date.parse(window.start_inclusive) &&
    published < Date.parse(window.end_exclusive)
  );
}

export function consistentPublication(
  run: Schema<"Run">,
  publication: Schema<"Publication">,
  eligibleOnly = false,
): boolean {
  const evidence = new Set(
    publication.evidence.map((item) => item.evidence_id),
  );
  return (
    publication.run_id === run.run_id &&
    run.corpus.some((source) => source.source_id === publication.source_id) &&
    (!eligibleOnly || publication.eligibility === "eligible") &&
    insideWindow(run.windows, publication) &&
    evidence.size === publication.evidence.length &&
    publication.evidence.every(
      (item) => item.video_id === publication.video_id,
    ) &&
    publication.ai_relevance.evidence_ids.every((id) => evidence.has(id)) &&
    !publication.secondary_topic_ids.includes(publication.main_topic_id ?? "")
  );
}

export function consistentPublications(
  run: Schema<"Run">,
  page: Schema<"PublicationsResponse">,
): boolean {
  return (
    page.snapshot_revision === run.revision &&
    new Set(page.items.map((item) => item.video_id)).size ===
      page.items.length &&
    page.items.every((item) => consistentPublication(run, item, true))
  );
}

export function consistentSelections(
  run: Schema<"Run">,
  page: Schema<"AnalysesResponse">,
): boolean {
  return (
    page.snapshot_revision === run.revision &&
    new Set(page.items.map((item) => item.analysis_id)).size ===
      page.items.length &&
    new Set(page.items.map((item) => item.video_id)).size === page.items.length
  );
}

export function consistentSelection(
  runId: string,
  videoId: string,
  result: Schema<"AnalysisResponse">,
): boolean {
  const data = result.data;
  const evidence = new Set(data.evidence.map((item) => item.evidence_id));
  return (
    data.run_id === runId &&
    data.publication.run_id === runId &&
    data.publication.video_id === videoId &&
    data.publication.eligibility === "eligible" &&
    insideWindow(data.windows, data.publication) &&
    data.performance.capture_id === data.publication.capture_id &&
    data.evidence.every((item) => item.video_id === videoId) &&
    evidence.size === data.evidence.length &&
    data.review.run_id === runId &&
    data.review.analysis_id === data.analysis_id &&
    data.review.analysis_version === data.analysis_version &&
    data.review.evidence_reviews.length === evidence.size &&
    new Set(data.review.evidence_reviews.map((item) => item.evidence_id))
      .size === evidence.size &&
    data.review.evidence_reviews.every((item) =>
      evidence.has(item.evidence_id),
    ) &&
    result.operations_to_inspect.every(
      (item) => item.run_id === runId && item.analysis_id === data.analysis_id,
    )
  );
}

// A selection acknowledgment needs no provider inputs or audiovisual payload.
export function selectionSummary(data: Schema<"Analysis">): SavedSelection {
  return {
    run_id: data.run_id,
    analysis_id: data.analysis_id,
    analysis_version: data.analysis_version,
    created_at: data.created_at,
    version_created_at: data.version_created_at,
    publication: data.publication,
    audiovisual: data.audiovisual,
    decision: data.review.decision,
  };
}
