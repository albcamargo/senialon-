"use server";

import type { Schema } from "@/lib/api/types";
import type {
  CatalogSnapshot,
  PublicationSnapshot,
  SelectionPage,
  SelectionResult,
} from "@/lib/publications/types";
import {
  consistentPublication,
  consistentPublications,
  consistentSelection,
  consistentSelections,
  selectionSummary,
} from "@/lib/publications/validation";
import { invalidSnapshot, runRequest } from "@/lib/runs/server";
import type { Result } from "@/lib/runs/types";

function pageQuery(cursor?: string) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor !== undefined) query.set("cursor", cursor);
  return query;
}

export async function readCatalogAction(
  runId: string,
): Promise<Result<CatalogSnapshot>> {
  const [run, publications, analyses] = await Promise.all([
    runRequest("getRun", ["runs", runId]),
    runRequest("listEligibleVideos", ["runs", runId, "videos"], {
      query: pageQuery(),
    }),
    runRequest("listAnalyses", ["runs", runId, "analyses"], {
      query: pageQuery(),
    }),
  ]);
  if (!run.ok) return run;
  if (!publications.ok) return publications;
  if (
    run.value.data.run_id !== runId ||
    !consistentPublications(run.value.data, publications.value)
  )
    return invalidSnapshot();
  return {
    ok: true,
    value: {
      run: run.value.data,
      publications: publications.value,
      analyses:
        analyses.ok && !consistentSelections(run.value.data, analyses.value)
          ? invalidSnapshot<Schema<"AnalysesResponse">>()
          : analyses,
    },
  };
}

export async function morePublicationsAction(runId: string, cursor: string) {
  const [run, page] = await Promise.all([
    runRequest("getRun", ["runs", runId]),
    runRequest("listEligibleVideos", ["runs", runId, "videos"], {
      query: pageQuery(cursor),
    }),
  ]);
  if (!run.ok) return run;
  if (!page.ok) return page;
  return run.value.data.run_id === runId &&
    consistentPublications(run.value.data, page.value)
    ? { ok: true as const, value: page.value }
    : invalidSnapshot<Schema<"PublicationsResponse">>();
}

export async function moreSelectionsAction(
  runId: string,
  cursor: string,
): Promise<Result<SelectionPage>> {
  const [run, page] = await Promise.all([
    runRequest("getRun", ["runs", runId]),
    runRequest("listAnalyses", ["runs", runId, "analyses"], {
      query: pageQuery(cursor),
    }),
  ]);
  if (!run.ok) return run;
  if (!page.ok) return page;
  return run.value.data.run_id === runId &&
    consistentSelections(run.value.data, page.value)
    ? { ok: true, value: { run: run.value.data, page: page.value } }
    : invalidSnapshot();
}

export async function readPublicationAction(
  runId: string,
  videoId: string,
): Promise<Result<PublicationSnapshot>> {
  const [run, publication] = await Promise.all([
    runRequest("getRun", ["runs", runId]),
    runRequest("getVideo", ["runs", runId, "videos", videoId]),
  ]);
  if (!run.ok) return run;
  if (!publication.ok) return publication;
  return run.value.data.run_id === runId &&
    publication.value.data.video_id === videoId &&
    consistentPublication(run.value.data, publication.value.data)
    ? {
        ok: true,
        value: {
          run: run.value.data,
          publication: publication.value.data,
          servedAt: publication.value.meta.served_at,
        },
      }
    : invalidSnapshot();
}

export async function readSelectionAction(
  runId: string,
  analysisId: string,
  videoId: string,
): Promise<Result<SelectionResult>> {
  const result = await runRequest("getAnalysis", [
    "runs",
    runId,
    "analyses",
    analysisId,
  ]);
  if (!result.ok) return result;
  return result.value.data.analysis_id === analysisId &&
    consistentSelection(runId, videoId, result.value)
    ? {
        ok: true,
        value: {
          selection: selectionSummary(result.value.data),
          servedAt: result.value.meta.served_at,
        },
      }
    : invalidSnapshot();
}

export async function selectPublicationAction(
  runId: string,
  videoId: string,
  revision: number,
  key: string,
): Promise<Result<SelectionResult>> {
  // This mutation only records selection. FE 1.7 never sends advance_analysis.
  const result = await runRequest(
    "selectAnalysis",
    ["runs", runId, "analyses"],
    {
      key,
      body: { expected_run_revision: revision, video_id: videoId },
    },
  );
  if (!result.ok) return result;
  return consistentSelection(runId, videoId, result.value)
    ? {
        ok: true,
        value: {
          selection: selectionSummary(result.value.data),
          servedAt: result.value.meta.served_at,
        },
      }
    : invalidSnapshot();
}
