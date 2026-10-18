import "server-only";
import { headers } from "next/headers";
import { handleApiRequest } from "@/lib/api/handler";
import { parseApiResponse, parseContractValue } from "@/lib/api/validation";
import type { OperationId, Schema } from "@/lib/api/types";
import { expectedCorpus } from "./corpus";
import { connectionNotice, type Result } from "./types";

type RunOperation = Extract<
  OperationId,
  | "listRuns"
  | "getRun"
  | "getCoverage"
  | "createRun"
  | "advanceRun"
  | "getOperation"
  | "getGroups"
  | "confirmGroups"
  | "getComparison"
  | "listEligibleVideos"
  | "getVideo"
  | "listAnalyses"
  | "getAnalysis"
  | "selectAnalysis"
>;
type SuccessBody = {
  listRuns: Schema<"RunsResponse">;
  getRun: Schema<"RunResponse">;
  getCoverage: Schema<"CoverageResponse">;
  createRun: Schema<"RunResponse">;
  advanceRun: Schema<"OperationResponse">;
  getOperation: Schema<"OperationResponse">;
  getGroups: Schema<"GroupsResponse">;
  confirmGroups: Schema<"GroupsResponse">;
  getComparison: Schema<"ComparisonResponse">;
  listEligibleVideos: Schema<"PublicationsResponse">;
  getVideo: Schema<"PublicationResponse">;
  listAnalyses: Schema<"AnalysesResponse">;
  getAnalysis: Schema<"AnalysisResponse">;
  selectAnalysis: Schema<"AnalysisResponse">;
};

export function resourceSegment(id: string): string {
  if (
    typeof id !== "string" ||
    !id.length ||
    id.length > 128 ||
    id === "." ||
    id === ".."
  )
    throw new Error("Identificador no válido.");
  return encodeURIComponent(id);
}

export function checkCorpus(run: Schema<"Run">): void {
  const urls = new Set(run.corpus.map((source) => source.original_url));
  const ids = new Set(run.corpus.map((source) => source.source_id));
  if (
    urls.size !== 11 ||
    ids.size !== 11 ||
    expectedCorpus.some((url) => !urls.has(url))
  )
    throw new Error("Corpus distinto del acordado.");
}

// Server Components and Server Actions share the existing BFF guard/validation.
// This Request is dispatched in-process, never fetched at this reserved host.
// Each call independently checks Basic; mutations also check the ORIGINAL Origin.
export async function runRequest<Op extends RunOperation>(
  operation: Op,
  segments: string[],
  options: { query?: URLSearchParams; body?: unknown; key?: string } = {},
): Promise<Result<SuccessBody[Op]>> {
  try {
    const incoming = await headers();
    const forwarded = new Headers();
    for (const name of ["authorization", "origin", "x-request-id"]) {
      const value = incoming.get(name);
      if (value) forwarded.set(name, value);
    }
    const mutation = options.body !== undefined;
    if (mutation) {
      forwarded.set("Content-Type", "application/json");
      if (typeof options.key !== "string") throw new Error("Falta clave.");
      forwarded.set("Idempotency-Key", options.key);
    }
    const pathname = segments.map(resourceSegment).join("/");
    const query = options.query?.toString();
    const response = await handleApiRequest(
      new Request(
        `https://senialon.invalid/api/v1/${pathname}${query ? `?${query}` : ""}`,
        {
          method: mutation ? "POST" : "GET",
          headers: forwarded,
          body: mutation ? JSON.stringify(options.body) : undefined,
        },
      ),
      segments,
    );
    const result = parseApiResponse(
      operation,
      response.status,
      await response.text(),
    );
    if (result.kind === "api_error") {
      const { error, meta } = parseContractValue("ErrorResponse", result.body);
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          requestId: meta.request_id,
          stage: error.stage,
          operationId: error.operation_id,
          retryPolicy: error.retry_policy,
        },
      };
    }
    // The value crossed the canonical validator above, not a raw JSON cast.
    const value = result.body as SuccessBody[Op];
    if (operation === "listRuns") {
      const runs = value as Schema<"RunsResponse">;
      runs.items.forEach(checkCorpus);
      if (
        new Set(runs.items.map((run) => run.run_id)).size !== runs.items.length
      )
        throw new Error("Identidad repetida en el listado.");
    }
    if ("data" in value && "corpus" in value.data) checkCorpus(value.data);
    return { ok: true, value };
  } catch {
    return { ok: false, error: connectionNotice };
  }
}

export function invalidSnapshot<T>(): Result<T> {
  return {
    ok: false,
    error: {
      ...connectionNotice,
      code: "STALE_DATA",
      message:
        "Los datos no corresponden a la misma ejecución y versión. Actualiza el estado para consultarlos juntos.",
    },
  };
}
