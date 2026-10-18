import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceAnalysisAction,
  readAnalysisAction,
} from "@/app/analysis-actions";
import { AnalysisView } from "@/components/analysis/analysis-view";
import { AnalysisSignal } from "@/components/analysis/analysis-signal";
import type { Schema } from "@/lib/api/types";
import { parseContractValue } from "@/lib/api/validation";
import type { AnalysisSnapshot } from "@/lib/analysis/types";
import { consistentAnalysis } from "@/lib/analysis/validation";
import {
  analysisPath,
  canAdvanceAnalysis,
  parseAnalysisVersion,
  timestampLabel,
} from "@/lib/analysis/presentation";
import { parseReceipt } from "@/lib/runs/command";

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
const origin = "https://senialon.example";
const key = "synthetic-analysis-key-0001";
const requestId = "synthetic:analysis:request";
const fetchMock = vi.fn<typeof fetch>();
function snapshot(name = "AnalysisWithEvidence"): AnalysisSnapshot {
  const run = parseContractValue("RunResponse", example("CreatedRun")).data;
  run.revision = 10;
  run.budget = {
    currency: "USD",
    incremental_limit: "20.00",
    state: "allowed",
    reason: "SINTÉTICO, no acredita saldo.",
    confirmed_new_charges: "0.00",
    reserved: "0.00",
    available_for_new_calls: "20.00",
  };
  const response = parseContractValue("AnalysisResponse", example(name));
  return { run, response, latestVersion: response.data.analysis_version };
}
function reply(value: object, status = 200) {
  return Response.json(
    {
      ...value,
      meta: {
        contract_version: "1.0.0",
        request_id: requestId,
        served_at: "2026-10-18T10:00:00-05:00",
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
function operation(): Schema<"OperationResponse"> {
  const value = parseContractValue(
    "OperationResponse",
    example("CompletedOperation"),
  );
  Object.assign(value.data, {
    analysis_id: analysisId,
    stage: "audiovisual",
    item_id: "demoB000001",
    input_version: "1",
    analysis_version: 2,
  });
  return value;
}
function serve(state = snapshot(), historical?: Schema<"AnalysisResponse">) {
  fetchMock.mockImplementation(async (url, init) => {
    const parsed = new URL(String(url));
    if (init?.method === "POST") return reply(operation());
    if (parsed.pathname.endsWith(`/analyses/${analysisId}`))
      return reply(
        parsed.searchParams.has("analysis_version") && historical
          ? historical
          : state.response,
      );
    return reply({ data: state.run });
  });
}
function markup(state = snapshot()) {
  return renderToStaticMarkup(
    createElement(AnalysisView, { snapshot: state, stale: false }),
  );
}
beforeEach(() => {
  vi.stubEnv("DEMO_USERNAME", "synthetic-fe18");
  vi.stubEnv("DEMO_PASSWORD", "synthetic-password");
  vi.stubEnv("DEMO_ALLOWED_ORIGIN", origin);
  vi.stubEnv("SENIALON_BACKEND_URL", "http://binding.internal/backend/");
  vi.stubEnv("VERCEL", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  incoming.headers = new Headers({
    authorization: `Basic ${Buffer.from("synthetic-fe18:synthetic-password").toString("base64")}`,
    origin,
    "X-Request-Id": requestId,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("lectura y avance de la ficha protegida", () => {
  it.each(["read", "advance"])(
    "rechaza %s sin acceso antes de Python",
    async (action) => {
      incoming.headers.delete("authorization");
      const result =
        action === "read"
          ? await readAnalysisAction(runId, analysisId)
          : await advanceAnalysisAction(runId, analysisId, 10, 1, key);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "AUTH_REQUIRED" },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([null, "https://foreign.example"])(
    "rechaza avance con origen %s",
    async (value) => {
      if (value) incoming.headers.set("origin", value);
      else incoming.headers.delete("origin");
      expect(
        await advanceAnalysisAction(runId, analysisId, 10, 1, key),
      ).toMatchObject({ ok: false, error: { code: "ORIGIN_FORBIDDEN" } });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("abrir ficha usa dos GET sin pedir comparación, revisión o proveedores", async () => {
    serve();
    expect((await readAnalysisAction(runId, analysisId)).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        body: undefined,
        cache: "no-store",
      });
      expect(String(url)).not.toMatch(/advance|groups|comparison|review/);
    }
  });
  it("recupera versión histórica y consulta la última sin mezclarlas", async () => {
    const state = snapshot();
    const old = parseContractValue(
      "AnalysisResponse",
      example("AnalysisHistoricalReadOnly"),
    );
    serve(state, old);
    const result = await readAnalysisAction(runId, analysisId, 1);
    expect(result).toMatchObject({
      ok: true,
      value: {
        latestVersion: 2,
        response: {
          data: { analysis_version: 1, audiovisual: { state: "failed" } },
          current_actions: [],
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("?analysis_version=1"),
      ),
    ).toBe(true);
  });
  it("un solo avance lleva revisión, versión y clave exactas", async () => {
    serve();
    expect(
      (await advanceAnalysisAction(runId, analysisId, 10, 1, key)).ok,
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe(
      `/backend/api/v1/runs/${runId}/advance`,
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(key);
    expect(JSON.parse(String(init?.body))).toEqual({
      expected_run_revision: 10,
      target: {
        scope: "analysis",
        analysis_id: analysisId,
        expected_analysis_version: 1,
      },
    });
  });
  it.each([0, -1, 1.5])(
    "rechaza versión de análisis %s antes de enviar",
    async (version) => {
      expect(
        await advanceAnalysisAction(runId, analysisId, 10, version, key),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each(["run_id", "analysis_id", "stage", "input_version"])(
    "no acredita una operación con %s ajeno",
    async (field) => {
      const value = operation();
      Object.assign(value.data, { [field]: "foreign" });
      fetchMock.mockImplementation(async () => reply(value));
      expect(
        await advanceAnalysisAction(runId, analysisId, 10, 1, key),
      ).toMatchObject({ ok: false, error: { code: "STALE_DATA" } });
    },
  );
  it("rechaza identidad de análisis o versión recibida equivocadas", async () => {
    const state = snapshot();
    state.response.data.analysis_id = "foreign";
    serve(state);
    expect(await readAnalysisAction(runId, analysisId)).toMatchObject({
      ok: false,
      error: { code: "STALE_DATA" },
    });
  });
  it("un fallo de transporte conserva aviso sin filtrar mensaje interno", async () => {
    fetchMock.mockRejectedValue(new Error("synthetic-private-error"));
    const result = await readAnalysisAction(runId, analysisId);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("synthetic-private-error");
  });
});

describe("coherencia entre evidencia, versiones y señal", () => {
  it.each([
    "SelectedAnalysis",
    "AnalysisWithEvidence",
    "AudiovisualFailure",
    "AnalysisWithInsufficientEditorialMaterial",
  ])("admite el ejemplo canónico %s", (name) => {
    expect(consistentAnalysis(snapshot(name))).toBe(true);
  });
  const corruptions: [string, (state: AnalysisSnapshot) => void][] = [
    [
      "ventana incompatible",
      (s) => {
        s.response.data.windows.previous.start_inclusive =
          "2026-10-04T00:00:00-05:00";
      },
    ],
    [
      "evidencia de otro video",
      (s) => {
        s.response.data.evidence[1].video_id = "demoC000001";
      },
    ],
    [
      "referencia de hipótesis ausente",
      (s) => {
        s.response.data.hypotheses[0].evidence_ids = ["missing"];
      },
    ],
    [
      "referencia de adaptación ausente",
      (s) => {
        s.response.data.adaptation.angle!.based_on_evidence_ids = ["missing"];
      },
    ],
    [
      "referencia de valor ausente",
      (s) => {
        s.response.data.value.evidence_ids = ["missing"];
      },
    ],
    [
      "evidencia de otra dimensión",
      (s) => {
        s.response.data.dimensions[0].evidence_ids = ["fixture-av-audio_hook"];
      },
    ],
    [
      "intervalo audiovisual invertido",
      (s) => {
        const e = s.response.data.evidence.find(
          (e) => e.kind === "audiovisual",
        )!;
        e.start_seconds = 9;
        e.end_seconds = 1;
      },
    ],
    [
      "intervalo fuera del video",
      (s) => {
        const e = s.response.data.evidence.find(
          (e) => e.kind === "audiovisual",
        )!;
        e.end_seconds = 181;
      },
    ],
    [
      "material no observado",
      (s) => {
        s.response.data.material = [];
      },
    ],
    [
      "revisión de otra versión",
      (s) => {
        s.response.data.review.analysis_version++;
      },
    ],
    [
      "revisión de evidencia ausente",
      (s) => {
        s.response.data.review.evidence_reviews.pop();
      },
    ],
    [
      "tema de señal ajeno",
      (s) => {
        s.response.data.signal.topic_id = "foreign";
      },
    ],
    [
      "canal de señal fuera del corpus",
      (s) => {
        s.response.data.signal.signal!.previous.by_source[0].source_id =
          "foreign";
      },
    ],
    [
      "versión antigua con capacidades vigentes",
      (s) => {
        s.latestVersion = 3;
        s.response.current_actions = ["advance_analysis"];
      },
    ],
  ];
  it.each(corruptions)(
    "rechaza %s sin sustituirlo por información inventada",
    (_label, mutate) => {
      const state = snapshot();
      mutate(state);
      expect(consistentAnalysis(state)).toBe(false);
    },
  );
  it("solo current_actions vigente autoriza avance; allowed_actions de la instantánea no", () => {
    const state = snapshot("SelectedAnalysis");
    state.response.data.allowed_actions = ["advance_analysis"];
    state.response.current_actions = [];
    expect(canAdvanceAnalysis(state)).toBe(false);
    state.response.current_actions = ["advance_analysis"];
    expect(canAdvanceAnalysis(state)).toBe(true);
    state.run.budget.state = "check_required";
    expect(canAdvanceAnalysis(state)).toBe(false);
  });
});

describe("presentación verificable sin puntuación global", () => {
  it("separa los bloques y distingue cero medido de métricas desconocidas", () => {
    const html = markup();
    for (const label of [
      "Métricas originales",
      "Señal temática",
      "Observaciones audiovisuales",
      "Valor para la audiencia",
      "Afinidad editorial",
      "Hipótesis explicativas",
      "Adaptación sugerida",
      "Evidencia y revisión",
    ])
      expect(html).toContain(label);
    expect(html).toContain("<dd>0</dd>");
    expect(html).toContain("No disponible");
    expect(html).toContain("Aporte respaldado");
    expect(html).toContain("Automatización comercial con IA");
    expect(html).not.toMatch(/<form|<iframe/i);
    expect(html).toContain("No se combinan desempeño, señal, valor y afinidad");
  });
  it("fallo audiovisual mantiene metadatos y señal; no completa observaciones", () => {
    const html = markup(snapshot("AudiovisualFailure"));
    expect(html).toContain("No se completó el análisis audiovisual");
    expect(html).toContain("Métricas originales");
    expect(html).toContain("100 %");
    expect(html).toContain("Sin observación respaldada disponible");
  });
  it.each([
    "supported_contribution",
    "unsupported_utility",
    "insufficient_information",
  ] as const)("conserva decisión JEV de valor %s", (decision) => {
    const state = snapshot();
    if (state.response.data.value.state !== "decided")
      throw new Error("fixture");
    state.response.data.value.decision = decision;
    const html = markup(state);
    expect(html).toContain(
      {
        supported_contribution: "Aporte respaldado",
        unsupported_utility: "Utilidad no sustentada",
        insufficient_information: "Información insuficiente",
      }[decision],
    );
  });
  it("parcial no muestra porcentajes, delta ni novedad del corpus completo", () => {
    const state = snapshot();
    state.response.data.signal.signal = parseContractValue(
      "TopicSignal",
      example("SignalPartialNumeric"),
    );
    const html = renderToStaticMarkup(
      createElement(AnalysisSignal, { snapshot: state }),
    );
    expect(html).toContain("Comparación completa pendiente");
    expect(html).not.toMatch(/100 %|Nuevo en el corpus|\+2/);
  });
  it("base cero conserva nuevo en el corpus sin fabricar porcentaje", () => {
    const state = snapshot();
    state.response.data.signal.signal = parseContractValue(
      "TopicSignal",
      example("Signal_0_3"),
    );
    const html = renderToStaticMarkup(
      createElement(AnalysisSignal, { snapshot: state }),
    );
    expect(html).toContain("Nuevo en el corpus");
    expect(html).not.toContain("Infinity");
  });
  it("enlaces temporales usan identidad canónica, nunca URLs recibidas arbitrarias", () => {
    const state = snapshot();
    const item = state.response.data.evidence.find(
      (e) => e.kind === "audiovisual",
    )!;
    item.source_url = "https://foreign.example/track";
    item.start_seconds = 65.5;
    item.end_seconds = 70;
    const html = markup(state);
    expect(html).toContain(
      "https://www.youtube.com/watch?v=demoB000001&amp;t=65s",
    );
    expect(html).toContain("1:05,5–1:10");
    expect(html).not.toContain('href="https://foreign.example');
  });
  it("escapa texto de proveedores y muestra revisión de evidencia con su nota", () => {
    const state = snapshot();
    state.response.data.hypotheses[0].text = "<script>alert(1)</script>";
    state.response.data.review.evidence_reviews[1] = {
      evidence_id: "fixture-av-format",
      state: "disputed",
      note: "SINTÉTICO: no coincide con el original.",
    };
    const html = markup(state);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("En disputa");
    expect(html).toContain("no coincide con el original");
  });
  it("sin material editorial no inventa hipótesis o adaptación", () => {
    const html = markup(snapshot("AnalysisWithInsufficientEditorialMaterial"));
    expect(html).toContain("No hay hipótesis respaldadas");
    expect(html).toContain("No disponible en esta versión");
    expect(html).toContain("Información insuficiente");
  });
});

describe("recuperación e identidad navegable", () => {
  it("recibo guarda solo identidad y versiones, conservando clave tras recarga", () => {
    const receipt = {
      version: 1,
      kind: "advance_analysis",
      key,
      createdAt: "2026-10-18T10:00:00-05:00",
      operationId: null,
      runId,
      revision: 10,
      analysisId,
      analysisVersion: 1,
      videoId: "demoB000001",
    };
    expect(parseReceipt(JSON.stringify(receipt))).toEqual(receipt);
    expect(() =>
      parseReceipt(JSON.stringify({ ...receipt, result: "no debe guardarse" })),
    ).toThrow();
    expect(() =>
      parseReceipt(JSON.stringify({ ...receipt, analysisVersion: 0 })),
    ).toThrow();
  });
  it("URL mantiene ejecución, análisis y versión con segmentos escapados", () => {
    expect(analysisPath("run a", "analysis/b", 2)).toBe(
      "/runs/run%20a/analyses/analysis%2Fb?analysis_version=2",
    );
    expect(parseAnalysisVersion(undefined)).toBeUndefined();
    expect(parseAnalysisVersion("2")).toBe(2);
    expect(timestampLabel(3)).toBe("0:03");
  });
  it.each(["0", "-1", "1.5", "01", "Infinity", "9007199254740992", ["1", "2"]])(
    "rechaza selector de versión ambiguo %s",
    (value) => {
      expect(parseAnalysisVersion(value)).toBeNull();
    },
  );
});
