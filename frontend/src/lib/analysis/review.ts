import type { Schema } from "@/lib/api/types";
import type { AnalysisSnapshot } from "./types";
import { evidenceReviewLabels, reviewLabels } from "./presentation";

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function identity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
export function isEvidenceReview(
  value: unknown,
): value is Schema<"EvidenceReview"> {
  return (
    object(value) &&
    Object.keys(value).length === 3 &&
    identity(value.evidence_id) &&
    typeof value.state === "string" &&
    Object.hasOwn(evidenceReviewLabels, value.state) &&
    (value.note === null ||
      (typeof value.note === "string" && !!value.note.trim())) &&
    (value.state === "pending_review" || value.note !== null)
  );
}
// A small browser-safe guard for user-authored pending input. The server still
// validates every request and response against the canonical OpenAPI schema.
export function isReviewRequest(
  value: unknown,
): value is Schema<"ReviewRequest"> {
  return (
    object(value) &&
    Object.keys(value).length === 5 &&
    positive(value.expected_analysis_version) &&
    positive(value.expected_review_revision) &&
    typeof value.decision === "string" &&
    Object.hasOwn(reviewLabels, value.decision) &&
    typeof value.reason === "string" &&
    !!value.reason.trim() &&
    Array.isArray(value.evidence_reviews) &&
    value.evidence_reviews.every(isEvidenceReview) &&
    new Set(value.evidence_reviews.map((item) => item.evidence_id)).size ===
      value.evidence_reviews.length
  );
}
export function reviewRequest(
  review: Schema<"EditorialReview">,
): Schema<"ReviewRequest"> {
  return {
    expected_analysis_version: review.analysis_version,
    expected_review_revision: review.revision,
    decision: review.decision,
    reason: review.reason ?? "",
    evidence_reviews: review.evidence_reviews.map((item) => ({ ...item })),
  };
}
export function sameReviewInput(
  input: Schema<"ReviewRequest">,
  review: Schema<"EditorialReview">,
): boolean {
  const states = new Map(
    review.evidence_reviews.map((item) => [item.evidence_id, item]),
  );
  return (
    input.expected_analysis_version === review.analysis_version &&
    input.decision === review.decision &&
    input.reason === review.reason &&
    states.size === review.evidence_reviews.length &&
    new Set(input.evidence_reviews.map((item) => item.evidence_id)).size ===
      input.evidence_reviews.length &&
    input.evidence_reviews.length === states.size &&
    input.evidence_reviews.every((item) => {
      const saved = states.get(item.evidence_id);
      return saved?.state === item.state && saved.note === item.note;
    })
  );
}
export function sameReview(
  a: Schema<"EditorialReview">,
  b: Schema<"EditorialReview">,
): boolean {
  return (
    a.review_id === b.review_id &&
    a.run_id === b.run_id &&
    a.analysis_id === b.analysis_id &&
    a.analysis_version === b.analysis_version &&
    a.revision === b.revision &&
    a.updated_at === b.updated_at &&
    a.actor === b.actor &&
    a.reason === b.reason &&
    a.decision === b.decision &&
    a.evidence_reviews.length === b.evidence_reviews.length &&
    a.evidence_reviews.every((item) =>
      b.evidence_reviews.some(
        (other) =>
          other.evidence_id === item.evidence_id &&
          other.state === item.state &&
          other.note === item.note,
      ),
    )
  );
}
export function canRecordReview(snapshot: AnalysisSnapshot): boolean {
  return (
    snapshot.response.data.analysis_version === snapshot.latestVersion &&
    snapshot.response.current_actions.includes("record_review") &&
    !snapshot.run.operations_to_inspect.some(
      (item) => item.state === "running",
    ) &&
    !snapshot.response.operations_to_inspect.some(
      (item) => item.state === "running",
    )
  );
}
