"use server";

import type { Schema } from "@/lib/api/types";
import { readAnalysisAction } from "@/app/analysis-actions";
import { sameReview, sameReviewInput } from "@/lib/analysis/review";
import { invalidSnapshot, runRequest } from "@/lib/runs/server";

export async function readReviewAction(
  runId: string,
  analysisId: string,
  version?: number,
) {
  const snapshot = await readAnalysisAction(runId, analysisId, version);
  if (!snapshot.ok) return snapshot;
  const result = await runRequest(
    "getReview",
    ["runs", runId, "analyses", analysisId, "review"],
    {
      query: new URLSearchParams({
        analysis_version: String(snapshot.value.response.data.analysis_version),
      }),
    },
  );
  if (!result.ok) return result;
  if (!sameReview(result.value.data, snapshot.value.response.data.review))
    return invalidSnapshot<typeof snapshot.value>();
  return snapshot;
}

export async function recordReviewAction(
  runId: string,
  analysisId: string,
  reviewId: string,
  request: Schema<"ReviewRequest">,
  key: string,
) {
  const result = await runRequest(
    "recordReview",
    ["runs", runId, "analyses", analysisId, "review"],
    { body: request, key },
  );
  if (!result.ok) return result;
  const review = result.value.data;
  if (
    review.run_id !== runId ||
    review.analysis_id !== analysisId ||
    review.review_id !== reviewId ||
    review.analysis_version !== request.expected_analysis_version ||
    review.revision !== request.expected_review_revision + 1 ||
    !sameReviewInput(request, review)
  )
    return invalidSnapshot<Schema<"ReviewResponse">>();
  return result;
}
