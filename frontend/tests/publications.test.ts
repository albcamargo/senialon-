import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  morePublicationsAction,
  moreSelectionsAction,
  readCatalogAction,
  readPublicationAction,
  readSelectionAction,
  selectPublicationAction,
} from "@/app/publication-actions";
import {
  CatalogView,
  PublicationPreview,
  SavedSelectionView,
} from "@/components/publications/publication-view";
import { parseContractValue } from "@/lib/api/validation";
import {
  mergePublications,
  mergeSelections,
  metricLabel,
} from "@/lib/publications/presentation";
import {
  consistentPublications,
  consistentSelection,
  selectionSummary,
} from "@/lib/publications/validation";
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
const origin = "https://senialon.example";
const requestId = "synthetic:publications:request";
const authorization = `Basic ${Buffer.from("synthetic-fe17:synthetic-password").toString("base64")}`;
const fetchMock = vi.fn<typeof fetch>();
const key = "synthetic-selection-key-0001";
const runId = "fixture-run-001";
const videoId = "demoB000001";
const analysisId = "fixture-analysis-001";
function fixtures() {
  const run = parseContractValue("RunResponse", example("CreatedRun")).data;
  run.revision = 10;
  run.allowed_actions = ["select_analysis"];
  const publications = parseContractValue(
    "PublicationsResponse",
    example("CatalogBeforeGroups"),
  );
  publications.snapshot_revision = run.revision;
  const analyses = parseContractValue(
    "AnalysesResponse",
    example("AnalysisList"),
  );
  analyses.snapshot_revision = run.revision;
  const selection = parseContractValue(
    "AnalysisResponse",
    example("SelectedAnalysis"),
  );
  return { run, publications, analyses, selection };
}
function response(value: object, status = 200) {
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
function serve(state = fixtures()) {
  fetchMock.mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/analyses") && init?.method === "POST")
      return response(state.selection, 201);
    if (path.endsWith("/analyses")) return response(state.analyses);
    if (path.endsWith(`/analyses/${analysisId}`))
      return response(state.selection);
    if (path.endsWith("/videos")) return response(state.publications);
    if (path.endsWith(`/videos/${videoId}`))
      return response({ data: state.publications.items[0] });
    return response({ data: state.run });
  });
}
beforeEach(() => {
  vi.stubEnv("DEMO_USERNAME", "synthetic-fe17");
  vi.stubEnv("DEMO_PASSWORD", "synthetic-password");
  vi.stubEnv("DEMO_ALLOWED_ORIGIN", origin);
  vi.stubEnv("SENIALON_BACKEND_URL", "http://binding.internal/backend/");
  vi.stubEnv("VERCEL", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  incoming.headers = new Headers({
    authorization,
    origin,
    "X-Request-Id": requestId,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("catálogo y selección mediante el BFF protegido", () => {
  it.each(["catalog", "publication", "selection", "select"])(
    "rechaza %s sin credencial antes de Python",
    async (operation) => {
      incoming.headers.delete("authorization");
      const result =
        operation === "catalog"
          ? await readCatalogAction(runId)
          : operation === "publication"
            ? await readPublicationAction(runId, videoId)
            : operation === "selection"
              ? await readSelectionAction(runId, analysisId, videoId)
              : await selectPublicationAction(runId, videoId, 10, key);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "AUTH_REQUIRED" },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([null, "https://foreign.example"])(
    "rechaza selección con origen %s",
    async (value) => {
      if (value) incoming.headers.set("origin", value);
      else incoming.headers.delete("origin");
      expect(
        await selectPublicationAction(runId, videoId, 10, key),
      ).toMatchObject({ ok: false, error: { code: "ORIGIN_FORBIDDEN" } });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([0, -1, 1.5])(
    "rechaza revisión %s sin enviar selección",
    async (revision) => {
      expect(
        await selectPublicationAction(runId, videoId, revision, key),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("catálogo e inspección usan solo GET, sin pedir grupos, comparación o avance", async () => {
    serve();
    expect((await readCatalogAction(runId)).ok).toBe(true);
    expect((await readPublicationAction(runId, videoId)).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        body: undefined,
        cache: "no-store",
      });
      expect(String(url)).not.toMatch(/groups|comparison|advance/);
    }
  });
  it("conserva el catálogo si falla la lectura independiente de selecciones", async () => {
    const state = fixtures();
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/analyses?limit=20")
        ? response(example("Error_INTERNAL_ERROR") as object, 500)
        : new URL(String(url)).pathname.endsWith("/videos")
          ? response(state.publications)
          : response({ data: state.run }),
    );
    const result = await readCatalogAction(runId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.publications.items).toHaveLength(1);
      expect(result.value.analyses).toMatchObject({
        ok: false,
        error: { code: "INTERNAL_ERROR" },
      });
    }
  });
  it.each(["pending", "decrease"])(
    "selecciona sin imponer crecimiento: señal %s",
    async (condition) => {
      const state = fixtures();
      if (condition === "decrease") {
        const signal = parseContractValue("TopicSignal", example("Signal_2_0"));
        state.selection.data.signal = {
          state: "available",
          comparison_revision: 5,
          topic_id: signal.topic_id,
          signal,
        };
        state.selection.data.groups_id = signal.groups_id;
        state.selection.data.groups_version = signal.groups_version;
        state.selection.data.publication.main_topic_id = signal.topic_id;
      }
      serve(state);
      const result = await selectPublicationAction(runId, videoId, 10, key);
      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(new URL(String(url)).pathname).toBe(
        `/backend/api/v1/runs/${runId}/analyses`,
      );
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        expected_run_revision: 10,
        video_id: videoId,
      });
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(key);
      if (result.ok) {
        expect(result.value.selection.decision).toBe("pending_review");
        expect(result.value.selection).not.toHaveProperty("model_uses");
        expect(result.value.selection).not.toHaveProperty("material");
      }
    },
  );
  it("acepta 200 al reutilizar una selección y conserva la identidad", async () => {
    const state = fixtures();
    fetchMock.mockImplementation(async () => response(state.selection));
    const first = await selectPublicationAction(runId, videoId, 10, key);
    const second = await readSelectionAction(runId, analysisId, videoId);
    expect(first).toMatchObject({
      ok: true,
      value: { selection: { analysis_id: analysisId } },
    });
    expect(second).toMatchObject(first);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      "POST",
      "GET",
    ]);
  });
  it("conserva NOT_ELIGIBLE y no intenta análisis ni otro envío", async () => {
    fetchMock.mockResolvedValue(
      response(example("Error_NOT_ELIGIBLE") as object, 422),
    );
    expect(
      await selectPublicationAction(runId, videoId, 10, key),
    ).toMatchObject({ ok: false, error: { code: "NOT_ELIGIBLE" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("un timeout no acredita guardado ni expone detalles internos", async () => {
    fetchMock.mockRejectedValue(new Error("synthetic-sensitive-marker"));
    const result = await selectPublicationAction(runId, videoId, 10, key);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-sensitive-marker");
  });
  it("transporta el cursor opaco sin fabricar ni decodificar páginas", async () => {
    serve();
    const cursor = "synthetic:opaque:+/page2";
    expect((await morePublicationsAction(runId, cursor)).ok).toBe(true);
    expect((await moreSelectionsAction(runId, cursor)).ok).toBe(true);
    for (const [url] of fetchMock.mock.calls.filter(
      ([url]) => new URL(String(url)).search,
    )) {
      expect(new URL(String(url)).searchParams.get("cursor")).toBe(cursor);
      expect(new URL(String(url)).searchParams.get("limit")).toBe("20");
    }
  });
  it("consulta detalles pendientes sin convertirlos en seleccionables", async () => {
    const state = fixtures();
    const publication = parseContractValue(
      "PublicationResponse",
      example("MissingDuration"),
    ).data;
    state.publications.items = [publication];
    serve(state);
    const result = await readPublicationAction(runId, videoId);
    expect(result).toMatchObject({
      ok: true,
      value: {
        publication: { eligibility: "pending", duration: { state: "unknown" } },
      },
    });
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });
});

describe("procedencia y snapshots del catálogo", () => {
  it.each([
    "run",
    "source",
    "window",
    "evidence",
    "duplicate",
    "revision",
    "ineligible",
  ])("rechaza catálogo inconsistente por %s", async (condition) => {
    const state = fixtures();
    const publication = state.publications.items[0];
    if (condition === "run") publication.run_id = "other-run";
    if (condition === "source") publication.source_id = "other-source";
    if (condition === "window")
      publication.published_at = "2026-10-17T00:00:00-05:00";
    if (condition === "evidence")
      publication.evidence[0].video_id = "demoC000001";
    if (condition === "duplicate")
      state.publications.items.push(structuredClone(publication));
    if (condition === "revision") state.publications.snapshot_revision = 9;
    if (condition === "ineligible") publication.eligibility = "excluded";
    serve(state);
    expect(await readCatalogAction(runId)).toMatchObject({
      ok: false,
      error: { code: "STALE_DATA" },
    });
  });
  it("no mezcla selecciones de otra revisión con un catálogo válido", async () => {
    const state = fixtures();
    state.analyses.snapshot_revision = 9;
    serve(state);
    const result = await readCatalogAction(runId);
    expect(result).toMatchObject({
      ok: true,
      value: { analyses: { ok: false, error: { code: "STALE_DATA" } } },
    });
  });
  it.each(["run", "video", "review", "capture", "evidence"])(
    "no anuncia selección guardada con identidad %s contradictoria",
    async (condition) => {
      const state = fixtures();
      const data = state.selection.data;
      if (condition === "run") data.run_id = "other-run";
      if (condition === "video") data.publication.video_id = "demoC000001";
      if (condition === "review") data.review.analysis_id = "other-analysis";
      if (condition === "capture")
        data.performance.capture_id = "other-capture";
      if (condition === "evidence") data.evidence[0].video_id = "demoC000001";
      serve(state);
      expect(
        await selectPublicationAction(runId, videoId, 10, key),
      ).toMatchObject({ ok: false, error: { code: "STALE_DATA" } });
    },
  );
  it("no consulta una selección de otro video como resultado del elegido", async () => {
    serve();
    expect(
      await readSelectionAction(runId, analysisId, "demoC000001"),
    ).toMatchObject({ ok: false, error: { code: "STALE_DATA" } });
  });
  it("comprueba IDs, ventanas y revisión sin exigir grupos ni señal", () => {
    const state = fixtures();
    expect(consistentPublications(state.run, state.publications)).toBe(true);
    expect(consistentSelection(runId, videoId, state.selection)).toBe(true);
    expect(state.selection.data.groups_id).toBeNull();
    expect(state.selection.data.signal.state).toBe("pending");
  });
});

describe("páginas y presentación editorial", () => {
  it.each(["publications", "selections"])(
    "no mezcla páginas %s de revisiones diferentes",
    (kind) => {
      const state = fixtures();
      if (kind === "publications") {
        const first = { ...state.publications, next_cursor: "opaque-cursor" };
        const next = {
          ...state.publications,
          items: [],
          snapshot_revision: 11,
        };
        expect(() => mergePublications(first, next)).toThrow(/catálogo cambió/);
      } else {
        const first = { ...state.analyses, next_cursor: "opaque-cursor" };
        const next = { ...state.analyses, items: [], snapshot_revision: 11 };
        expect(() => mergeSelections(first, next)).toThrow(
          /selecciones cambiaron/,
        );
      }
    },
  );
  it("conserva orden de servidor y detecta IDs repetidos entre páginas", () => {
    const state = fixtures();
    const first = { ...state.publications, next_cursor: "opaque-cursor" };
    expect(() => mergePublications(first, state.publications)).toThrow();
    const next = structuredClone(state.publications);
    next.items[0].video_id = "demoC000001";
    expect(
      mergePublications(first, next).items.map((item) => item.video_id),
    ).toEqual([videoId, "demoC000001"]);
  });
  it("un cursor repetido no deja avanzar indefinidamente", () => {
    const state = fixtures();
    const first = { ...state.publications, next_cursor: "opaque-cursor" };
    expect(() => mergePublications(first, { ...first, items: [] })).toThrow();
  });
  it("muestra candidato corto, captura y cero conocido separado de ausencia", () => {
    const state = fixtures();
    const html = renderToStaticMarkup(
      createElement(PublicationPreview, {
        snapshot: {
          run: state.run,
          publication: state.publications.items[0],
          servedAt: state.publications.meta.served_at,
        },
        stale: false,
      }),
    );
    expect(html).toContain("Candidato corto");
    expect(html).toContain("180 segundos");
    expect(html).toContain("Captura · Colombia");
    expect(html).toContain("<dd>0</dd>");
    expect(html).toContain("No disponible");
    expect(html).not.toContain("Short confirmado");
  });
  it("muestra confirmación de Short con el respaldo recibido", () => {
    const state = fixtures();
    const publication = state.publications.items[0];
    publication.short_status = "confirmed_short";
    publication.short_evidence =
      "SINTÉTICO: evidencia verificable del estado de Short.";
    const html = renderToStaticMarkup(
      createElement(PublicationPreview, {
        snapshot: {
          run: state.run,
          publication,
          servedAt: state.publications.meta.served_at,
        },
        stale: false,
      }),
    );
    expect(html).toContain("Short confirmado");
    expect(html).toContain(publication.short_evidence);
  });
  it("el catálogo declara páginas pendientes sin ordenar por popularidad", () => {
    const state = fixtures();
    state.publications.next_cursor = "opaque-cursor";
    const html = renderToStaticMarkup(
      createElement(CatalogView, {
        run: state.run,
        page: state.publications,
        stale: true,
        busy: false,
        onInspect: () => {},
      }),
    );
    expect(html).toContain("quedan páginas por consultar");
    expect(html).toContain("Listado anterior conservado");
    expect(html).toContain("Inspeccionar publicación");
    expect(html).not.toContain("ranking");
  });
  it("un listado vacío limita la afirmación al material disponible", () => {
    const state = fixtures();
    state.publications.items = [];
    const html = renderToStaticMarkup(
      createElement(CatalogView, {
        run: state.run,
        page: state.publications,
        stale: false,
        busy: false,
        onInspect: () => {},
      }),
    );
    expect(html).toContain("material disponible");
    expect(html).toContain("no demuestra que los once canales estén completos");
  });
  it("conserva métricas enteras mayores que Number.MAX_SAFE_INTEGER", () => {
    expect(
      metricLabel({ state: "known", value: "9007199254740993", reason: null }),
    ).toBe("9.007.199.254.740.993");
  });
  it("escapa contenido externo y construye el enlace con el ID validado", () => {
    const state = fixtures();
    state.publications.items[0].title = "<script>alert('sintético')</script>";
    state.publications.items[0].url = "javascript:alert(1)";
    const html = renderToStaticMarkup(
      createElement(PublicationPreview, {
        snapshot: {
          run: state.run,
          publication: state.publications.items[0],
          servedAt: state.publications.meta.served_at,
        },
        stale: false,
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain(`https://www.youtube.com/watch?v=${videoId}`);
  });
  it("la confirmación de selección conserva el estado editorial recibido", () => {
    const state = fixtures();
    state.selection.data.review.decision = "discarded";
    const html = renderToStaticMarkup(
      createElement(SavedSelectionView, {
        result: {
          selection: selectionSummary(state.selection.data),
          servedAt: state.publications.meta.served_at,
        },
      }),
    );
    expect(html).toContain("Selección guardada");
    expect(html).toContain("Descartada");
    expect(html).not.toContain("Aprobada");
  });
});

describe("recibo local de selección", () => {
  const receipt = {
    version: 1,
    kind: "select_analysis",
    key,
    operationId: null,
    createdAt: "2026-10-18T10:00:00Z",
    runId,
    revision: 10,
    videoId,
  };
  it("recupera identidad y revisión sin resultados, credenciales ni análisis pagado", () => {
    expect(parseReceipt(JSON.stringify(receipt))).toEqual(receipt);
  });
  it.each(["video", "operation", "revision", "extra"])(
    "rechaza recibo de selección inválido por %s",
    (condition) => {
      const value: Record<string, unknown> = { ...receipt };
      if (condition === "video") value.videoId = "bad-id";
      if (condition === "operation") value.operationId = "another-operation";
      if (condition === "revision") value.revision = 0;
      if (condition === "extra") value.secret = "never-store";
      expect(() => parseReceipt(JSON.stringify(value))).toThrow();
    },
  );
});
