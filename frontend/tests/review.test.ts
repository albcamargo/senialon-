import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readReviewAction, recordReviewAction } from "@/app/review-actions";
import { EditorialReview } from "@/components/analysis/editorial-review";
import { parseContractValue } from "@/lib/api/validation";
import type { AnalysisSnapshot } from "@/lib/analysis/types";
import {
  canRecordReview,
  isReviewRequest,
  reviewRequest,
  sameReview,
  sameReviewInput,
} from "@/lib/analysis/review";
import { parseReceipt, type CommandReceipt } from "@/lib/runs/command";

const incoming = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => incoming.headers }));
const canonical = JSON.parse(
  readFileSync(
    new URL("../../docs/contracts/openapi.json", import.meta.url),
    "utf8",
  ),
);
function example(name: string): unknown {
  return structuredClone(canonical.components.examples[name].value);
}
const runId = "fixture-run-001",
  analysisId = "fixture-analysis-001";
const key = "synthetic-review-key-0001",
  requestId = "synthetic:review:request";
const origin = "https://senialon.example";
const fetchMock = vi.fn<typeof fetch>();
function fixtures() {
  const run = parseContractValue("RunResponse", example("CreatedRun")).data;
  run.revision = 10;
  const response = parseContractValue(
    "AnalysisResponse",
    example("AnalysisWithEvidence"),
  );
  const request = parseContractValue(
    "ReviewRequest",
    example("DiscardRequest"),
  );
  const saved = parseContractValue("ReviewResponse", example("SavedReview"));
  saved.data.review_id = response.data.review.review_id;
  return { snapshot: { run, response, latestVersion: 2 }, request, saved };
}
function reply(value: object, status = 200) {
  return Response.json(
    {
      ...value,
      meta: {
        contract_version: "1.0.0",
        request_id: requestId,
        served_at: "2026-10-18T11:00:00-05:00",
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Contract-Version": "1.0.0",
        "X-Request-Id": requestId,
      },
    },
  );
}
function serve(state = fixtures()) {
  fetchMock.mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "PUT") return reply(state.saved);
    if (path.endsWith("/review"))
      return reply({ data: state.snapshot.response.data.review });
    if (path.endsWith(`/analyses/${analysisId}`))
      return reply(state.snapshot.response);
    return reply({ data: state.snapshot.run });
  });
}
function receipt(): Extract<CommandReceipt, { kind: "record_review" }> {
  const state = fixtures();
  return {
    version: 1,
    kind: "record_review",
    key,
    createdAt: "2026-10-18T11:00:00-05:00",
    operationId: null,
    runId,
    revision: 10,
    analysisId,
    videoId: "demoB000001",
    reviewId: state.snapshot.response.data.review.review_id,
    request: state.request,
  };
}
beforeEach(() => {
  vi.stubEnv("DEMO_USERNAME", "synthetic-fe19");
  vi.stubEnv("DEMO_PASSWORD", "synthetic-password");
  vi.stubEnv("DEMO_ALLOWED_ORIGIN", origin);
  vi.stubEnv("SENIALON_BACKEND_URL", "http://binding.internal/backend/");
  vi.stubEnv("VERCEL", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  incoming.headers = new Headers({
    authorization: `Basic ${Buffer.from("synthetic-fe19:synthetic-password").toString("base64")}`,
    origin,
    "X-Request-Id": requestId,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("revisión editorial por el BFF protegido", () => {
  it.each(["read", "save"])(
    "rechaza %s sin credencial antes de Python",
    async (action) => {
      incoming.headers.delete("authorization");
      const state = fixtures();
      const result =
        action === "read"
          ? await readReviewAction(runId, analysisId)
          : await recordReviewAction(
              runId,
              analysisId,
              state.saved.data.review_id,
              state.request,
              key,
            );
      expect(result).toMatchObject({
        ok: false,
        error: { code: "AUTH_REQUIRED" },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([null, "https://foreign.example"])(
    "rechaza PUT con origen %s",
    async (value) => {
      if (value) incoming.headers.set("origin", value);
      else incoming.headers.delete("origin");
      const state = fixtures();
      expect(
        await recordReviewAction(
          runId,
          analysisId,
          state.saved.data.review_id,
          state.request,
          key,
        ),
      ).toMatchObject({ ok: false, error: { code: "ORIGIN_FORBIDDEN" } });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("guardar envía solo PUT con versión/revisión y evidencia exactas, sin pedir avance", async () => {
    const state = fixtures();
    serve(state);
    expect(
      (
        await recordReviewAction(
          runId,
          analysisId,
          state.saved.data.review_id,
          state.request,
          key,
        )
      ).ok,
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe(
      `/backend/api/v1/runs/${runId}/analyses/${analysisId}/review`,
    );
    expect(init).toMatchObject({ method: "PUT", cache: "no-store" });
    expect(JSON.parse(String(init?.body))).toEqual(state.request);
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(key);
  });
  it("consultar revisión hace solo GET y no depende de presupuesto de proveedores", async () => {
    serve();
    const result = await readReviewAction(runId, analysisId);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/review?analysis_version=2"),
      ),
    ).toBe(true);
    if (result.ok) expect(canRecordReview(result.value)).toBe(true);
  });
  it("lectura histórica mantiene revisión exacta y capacidades vacías", async () => {
    const state = fixtures();
    const old = parseContractValue(
      "AnalysisResponse",
      example("AnalysisHistoricalReadOnly"),
    );
    fetchMock.mockImplementation(async (url) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/review"))
        return reply({ data: old.data.review });
      if (u.pathname.endsWith(`/analyses/${analysisId}`))
        return reply(
          u.searchParams.has("analysis_version")
            ? old
            : state.snapshot.response,
        );
      return reply({ data: state.snapshot.run });
    });
    const result = await readReviewAction(runId, analysisId, 1);
    expect(result).toMatchObject({
      ok: true,
      value: {
        latestVersion: 2,
        response: {
          current_actions: [],
          data: { review: { analysis_version: 1, decision: "pending_review" } },
        },
      },
    });
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });
  it.each([0, -1, 1.5])(
    "rechaza revisión de partida %s sin enviar",
    async (revision) => {
      const state = fixtures();
      state.request.expected_review_revision = revision;
      expect(
        await recordReviewAction(
          runId,
          analysisId,
          state.saved.data.review_id,
          state.request,
          key,
        ),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("conflicto conserva código y no realiza otro envío", async () => {
    fetchMock.mockImplementation(async () =>
      reply(example("Error_VERSION_CONFLICT") as object, 409),
    );
    const state = fixtures();
    expect(
      await recordReviewAction(
        runId,
        analysisId,
        state.saved.data.review_id,
        state.request,
        key,
      ),
    ).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    "run_id",
    "analysis_id",
    "review_id",
    "analysis_version",
    "revision",
    "decision",
    "reason",
    "evidence_reviews",
  ])("no anuncia guardado con %s diferente del intento", async (field) => {
    const state = fixtures();
    const review = state.saved.data;
    if (field === "analysis_version" || field === "revision")
      Object.assign(review, { [field]: 10 });
    else if (field === "decision") review.decision = "consider_for_adaptation";
    else if (field === "evidence_reviews")
      review.evidence_reviews[0].note = "Texto ajeno";
    else Object.assign(review, { [field]: "foreign" });
    serve(state);
    expect(
      await recordReviewAction(
        runId,
        analysisId,
        fixtures().saved.data.review_id,
        state.request,
        key,
      ),
    ).toMatchObject({ ok: false, error: { code: "STALE_DATA" } });
  });
  it("un cambio entre GET de ficha y GET de revisión se conserva como incoherencia", async () => {
    const state = fixtures();
    fetchMock.mockImplementation(async (url) =>
      new URL(String(url)).pathname.endsWith("/review")
        ? reply(state.saved)
        : new URL(String(url)).pathname.endsWith(`/analyses/${analysisId}`)
          ? reply(state.snapshot.response)
          : reply({ data: state.snapshot.run }),
    );
    expect(await readReviewAction(runId, analysisId)).toMatchObject({
      ok: false,
      error: { code: "STALE_DATA" },
    });
  });
  it("timeout no implica guardado ni expone mensaje interno", async () => {
    fetchMock.mockRejectedValue(new Error("synthetic-private-marker"));
    const state = fixtures();
    const result = await recordReviewAction(
      runId,
      analysisId,
      state.saved.data.review_id,
      state.request,
      key,
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("synthetic-private-marker");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("identidad del borrador y estados de revisión", () => {
  it("la revisión inicial permanece pendiente y no crea un motivo supuesto", () => {
    const initial = parseContractValue(
      "ReviewResponse",
      example("InitialReview"),
    ).data;
    expect(reviewRequest(initial)).toMatchObject({
      decision: "pending_review",
      reason: "",
      expected_analysis_version: 1,
      expected_review_revision: 1,
    });
    expect(isReviewRequest(reviewRequest(initial))).toBe(false);
  });
  it.each(["pending_review", "consider_for_adaptation", "discarded"] as const)(
    "acepta decisión %s con motivo y la misma evidencia",
    (decision) => {
      const state = fixtures();
      state.request.decision = decision;
      expect(isReviewRequest(state.request)).toBe(true);
    },
  );
  it.each(["", "  \n  "])(
    "exige motivo no vacío incluso volviendo a pendiente %j",
    (reason) => {
      const state = fixtures();
      state.request.decision = "pending_review";
      state.request.reason = reason;
      expect(isReviewRequest(state.request)).toBe(false);
    },
  );
  it.each([
    "verified_against_source",
    "disputed",
    "insufficient_to_verify",
  ] as const)("estado de evidencia %s requiere nota", (state) => {
    const input = fixtures().request;
    input.evidence_reviews[0].state = state;
    expect(isReviewRequest(input)).toBe(false);
    input.evidence_reviews[0].note = "SINTÉTICO: contraste registrado";
    expect(isReviewRequest(input)).toBe(true);
  });
  it("omitir, duplicar o añadir evidencia no coincide con la revisión confirmada", () => {
    const { request, saved } = fixtures();
    expect(sameReviewInput(request, saved.data)).toBe(true);
    const omitted = structuredClone(request);
    omitted.evidence_reviews.pop();
    expect(sameReviewInput(omitted, saved.data)).toBe(false);
    const duplicated = structuredClone(request);
    duplicated.evidence_reviews.push(duplicated.evidence_reviews[0]);
    expect(isReviewRequest(duplicated)).toBe(false);
    const repeatedResponse = structuredClone(saved.data);
    repeatedResponse.evidence_reviews.push(
      repeatedResponse.evidence_reviews[0],
    );
    expect(sameReviewInput(request, repeatedResponse)).toBe(false);
  });
  it("el orden de evidencia no modifica la identidad del guardado", () => {
    const { request, saved } = fixtures();
    saved.data.evidence_reviews.reverse();
    expect(sameReviewInput(request, saved.data)).toBe(true);
    const other = structuredClone(saved.data);
    other.evidence_reviews.reverse();
    expect(sameReview(other, saved.data)).toBe(true);
  });
  it("solo current_actions vigente autoriza revisión, sin exigir fondos ni audiovisual completo", () => {
    const state = fixtures().snapshot;
    expect(state.run.budget.state).toBe("check_required");
    expect(canRecordReview(state)).toBe(true);
    state.response.current_actions = [];
    state.response.data.allowed_actions = ["record_review"];
    expect(canRecordReview(state)).toBe(false);
    state.response.current_actions = ["record_review"];
    state.latestVersion++;
    expect(canRecordReview(state)).toBe(false);
  });
  it("recibo restaura el cuerpo exacto para reintento manual sin resultados ni credenciales", () => {
    const value = receipt();
    expect(parseReceipt(JSON.stringify(value))).toEqual(value);
    value.request.reason = "SINTÉTICO " + "texto ".repeat(600);
    expect(parseReceipt(JSON.stringify(value))).toEqual(value);
    expect(value).not.toHaveProperty("password");
    expect(value).not.toHaveProperty("evidence");
  });
  it.each(["operation", "extra", "duplicate", "version", "note"])(
    "rechaza recibo editorial ilegible: %s",
    (defect) => {
      const value = receipt();
      if (defect === "operation") value.operationId = "foreign";
      if (defect === "extra") Object.assign(value, { result: "no se guarda" });
      if (defect === "duplicate")
        value.request.evidence_reviews.push(value.request.evidence_reviews[0]);
      if (defect === "version") value.request.expected_analysis_version = 0;
      if (defect === "note")
        value.request.evidence_reviews[0].state = "verified_against_source";
      expect(() => parseReceipt(JSON.stringify(value))).toThrow();
    },
  );
});

describe("formulario integrado en la ficha", () => {
  function markup(snapshot: AnalysisSnapshot, pinned = false) {
    return renderToStaticMarkup(
      createElement(EditorialReview, {
        snapshot,
        pinned,
        stale: false,
        busy: false,
        perform: async (_label, work) => work(),
        onSnapshot: () => {},
        onConfirmed: () => {},
        onDraftChange: () => {},
      }),
    );
  }
  it("etiquetas visibles, motivo y notas, con estado guardado separado del borrador", () => {
    const html = markup(fixtures().snapshot);
    for (const text of [
      "Revisión editorial",
      "Estado guardado: Pendiente de revisión",
      "Decisión editorial",
      "Motivo de la decisión",
      "Guardar decisión",
      "Nota de evidencia 1",
      "Borrador para análisis versión",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("Decisión guardada.");
    expect(html).toContain('aria-describedby="review-help"');
  });
  it("histórico no ofrece una revisión editable aunque el snapshot antiguo tuviera acciones", () => {
    const html = markup(fixtures().snapshot, true);
    expect(html).toContain("Esta URL fija una versión de solo lectura");
    expect(html).toContain("<fieldset disabled=");
  });
  it("escapa motivo guardado y no lo interpreta como HTML", () => {
    const state = fixtures().snapshot;
    state.response.data.review.reason = "<script>synthetic</script>";
    const html = markup(state);
    expect(html).toContain("&lt;script&gt;synthetic&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});
