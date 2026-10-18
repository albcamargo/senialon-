"use server";

import type { Schema } from "@/lib/api/types";
import { analysisStages } from "@/lib/analysis/presentation";
import type { AnalysisSnapshot } from "@/lib/analysis/types";
import { consistentAnalysis } from "@/lib/analysis/validation";
import { invalidSnapshot, runRequest } from "@/lib/runs/server";
import type { Result } from "@/lib/runs/types";

export async function readAnalysisAction(
  runId: string,
  analysisId: string,
  version?: number,
): Promise<Result<AnalysisSnapshot>> {
  const query =
    version === undefined
      ? undefined
      : new URLSearchParams({ analysis_version: String(version) });
  const requested = runRequest(
    "getAnalysis",
    ["runs", runId, "analyses", analysisId],
    { query },
  );
  const [run, analysis, latest] = await Promise.all([
    runRequest("getRun", ["runs", runId]),
    requested,
    version === undefined
      ? requested
      : runRequest("getAnalysis", ["runs", runId, "analyses", analysisId]),
  ]);
  if (!run.ok) return run;
  if (!analysis.ok) return analysis;
  if (!latest.ok) return latest;
  const value = {
    run: run.value.data,
    response: analysis.value,
    latestVersion: latest.value.data.analysis_version,
  };
  if (
    value.run.run_id !== runId ||
    value.response.data.analysis_id !== analysisId ||
    latest.value.data.run_id !== runId ||
    latest.value.data.analysis_id !== analysisId ||
    latest.value.data.publication.video_id !==
      value.response.data.publication.video_id ||
    (version !== undefined &&
      value.response.data.analysis_version !== version) ||
    !consistentAnalysis(value)
  )
    return invalidSnapshot();
  return { ok: true, value };
}

export async function advanceAnalysisAction(
  runId: string,
  analysisId: string,
  revision: number,
  analysisVersion: number,
  key: string,
) {
  const result = await runRequest("advanceRun", ["runs", runId, "advance"], {
    key,
    body: {
      expected_run_revision: revision,
      target: {
        scope: "analysis",
        analysis_id: analysisId,
        expected_analysis_version: analysisVersion,
      },
    },
  });
  if (
    result.ok &&
    (result.value.data.run_id !== runId ||
      result.value.data.analysis_id !== analysisId ||
      !analysisStages.has(result.value.data.stage) ||
      result.value.data.input_version !== String(analysisVersion))
  )
    return invalidSnapshot<Schema<"OperationResponse">>();
  return result;
}
