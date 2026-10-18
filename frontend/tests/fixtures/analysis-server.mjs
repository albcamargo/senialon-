// FE 1.8 SYNTHETIC TEST HARNESS ONLY. Never imported by the application.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

if (process.env.SENIALON_SYNTHETIC_TEST_ONLY !== "1")
  throw new Error("Solo se permite ejecución sintética de pruebas.");
const canonical = JSON.parse(
  readFileSync(
    new URL("../../../docs/contracts/openapi.json", import.meta.url),
    "utf8",
  ),
);
const example = (name) =>
  structuredClone(canonical.components.examples[name].value);
const authorization = `Basic ${Buffer.from(`${process.env.DEMO_USERNAME}:${process.env.DEMO_PASSWORD}`).toString("base64")}`;
const analysisId = "fixture-analysis-001";
let scenario, requests, analysis, historical, operation, revision, failReads;
const budget = () => ({
  currency: "USD",
  incremental_limit: "20.00",
  state: scenario === "analysis-budget" ? "check_required" : "allowed",
  reason: "SINTÉTICO: no acredita saldo ni consumos reales.",
  confirmed_new_charges: "0.00",
  reserved: "0.00",
  available_for_new_calls: "20.00",
});
function reset(name) {
  scenario = name;
  requests = [];
  operation = null;
  revision = 10;
  failReads = false;
  const exampleName =
    name === "analysis-failed"
      ? "AudiovisualFailure"
      : name === "analysis-insufficient"
        ? "AnalysisWithInsufficientEditorialMaterial"
        : [
              "analysis-pending",
              "analysis-lost",
              "analysis-running",
              "analysis-uncertain",
              "analysis-retry",
              "analysis-budget",
            ].includes(name)
          ? "SelectedAnalysis"
          : "AnalysisWithEvidence";
  analysis = example(exampleName);
  analysis.data.publication.title = "SINTÉTICO · Aplicación de IA para equipos";
  historical = example("AnalysisHistoricalReadOnly");
  historical.data.publication.title = analysis.data.publication.title;
  if (name === "analysis-partial")
    analysis.data.signal.signal = example("SignalPartialNumeric");
  if (name === "analysis-malformed")
    analysis.data.dimensions[0].evidence_ids = ["missing-evidence"];
}
reset("analysis-complete");
function reference() {
  return {
    operation_id: operation.operation_id,
    run_id: operation.run_id,
    analysis_id: analysisId,
    state: operation.state,
    stage: operation.stage,
    updated_at: operation.updated_at,
  };
}
function currentAnalysis(version) {
  const value = structuredClone(
    version === "1" && analysis.data.analysis_version > 1
      ? historical
      : analysis,
  );
  value.operations_to_inspect =
    operation && operation.state !== "succeeded" ? [reference()] : [];
  if (version && Number(version) < analysis.data.analysis_version) {
    value.operations_to_inspect = [];
    value.current_actions = [];
  } else if (operation && operation.state !== "succeeded")
    value.current_actions = [];
  return value;
}
function run() {
  const value = example("CreatedRun").data;
  value.revision = revision;
  value.budget = budget();
  value.allowed_actions = ["select_analysis"];
  if (operation?.state === "succeeded")
    value.last_checkpoint = operation.last_checkpoint;
  if (operation && operation.state !== "succeeded") {
    value.operations_to_inspect = [reference()];
    value.allowed_actions = [];
    value.workflow = {
      state: operation.state === "running" ? "running" : operation.state,
      reason: "SINTÉTICO: operación de análisis pendiente de conciliación.",
    };
  }
  return value;
}
function makeOperation(state, inputVersion, retry = "none") {
  const value = example(
    state === "succeeded" ? "CompletedOperation" : `Operation_${state}`,
  ).data;
  Object.assign(value, {
    analysis_id: analysisId,
    stage: "audiovisual",
    item_id: "demoB000001",
    input_version: String(inputVersion),
    analysis_version: analysis.data.analysis_version,
    run_revision: revision,
    budget: budget(),
    retry_policy: retry,
    reason: "SINTÉTICO: resultado de la prueba; no se ejecutó un proveedor.",
  });
  value.last_checkpoint =
    state === "succeeded"
      ? {
          operation_id: value.operation_id,
          stage: "audiovisual",
          item_id: "demoB000001",
          committed_at: "2026-10-18T10:00:00-05:00",
        }
      : null;
  return value;
}
function send(request, response, value, status = 200) {
  const requestId =
    request.headers["x-request-id"] ?? "synthetic:analysis:harness";
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Contract-Version": "1.0.0",
    "X-Request-Id": requestId,
  });
  response.end(
    JSON.stringify({
      ...value,
      meta: {
        contract_version: "1.0.0",
        request_id: requestId,
        served_at: "2026-10-18T10:00:00-05:00",
      },
    }),
  );
}
async function body(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 65536) throw new Error("Cuerpo demasiado grande");
  }
  return value ? JSON.parse(value) : {};
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1:3371");
    if (url.pathname === "/health") {
      response.end("SYNTHETIC TEST ONLY");
      return;
    }
    if (url.pathname === "/__test/scenario" && request.method === "POST") {
      reset((await body(request)).scenario);
      response.end("SYNTHETIC RESET");
      return;
    }
    if (url.pathname === "/__test/fail" && request.method === "POST") {
      failReads = true;
      response.end("SYNTHETIC FAILURE");
      return;
    }
    if (url.pathname === "/__test/requests") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(requests));
      return;
    }
    if (request.headers.authorization !== authorization) {
      response.setHeader("WWW-Authenticate", 'Basic realm="SENIALON"');
      send(request, response, example("Error_AUTH_REQUIRED"), 401);
      return;
    }
    const data = request.method === "POST" ? await body(request) : null;
    requests.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      key: request.headers["idempotency-key"] ?? null,
      body: data,
    });
    if (failReads && request.method === "GET") {
      send(request, response, example("Error_INTERNAL_ERROR"), 500);
      return;
    }
    const parts = url.pathname.split("/");
    if (url.pathname === "/api/v1/runs") {
      send(request, response, {
        ...example("RunList"),
        items: [run()],
        snapshot_revision: revision,
        next_cursor: null,
      });
      return;
    }
    if (parts.length === 5) {
      send(request, response, { data: run() });
      return;
    }
    if (parts[5] === "analyses") {
      if (parts.length === 7) {
        send(
          request,
          response,
          currentAnalysis(url.searchParams.get("analysis_version")),
        );
        return;
      }
      send(request, response, {
        items: [
          {
            analysis_id: analysisId,
            analysis_version: analysis.data.analysis_version,
            video_id: "demoB000001",
            created_at: analysis.data.created_at,
            audiovisual: analysis.data.audiovisual,
          },
        ],
        snapshot_revision: revision,
        next_cursor: null,
      });
      return;
    }
    if (parts[5] === "videos") {
      send(
        request,
        response,
        parts.length === 7
          ? { data: analysis.data.publication }
          : {
              items: [analysis.data.publication],
              snapshot_revision: revision,
              next_cursor: null,
            },
      );
      return;
    }
    if (parts[5] === "operations" && operation) {
      send(request, response, { data: operation });
      return;
    }
    if (parts[5] === "advance" && request.method === "POST") {
      const attempts = requests.filter(
        (row) => row.method === "POST" && row.path.endsWith("/advance"),
      );
      const inputVersion = data.target.expected_analysis_version;
      if (scenario === "analysis-retry" && attempts.length === 1) {
        operation = makeOperation(
          "failed",
          inputVersion,
          "same_request_after_status_read",
        );
        const error = example("Error_INTERNAL_ERROR");
        Object.assign(error.error, {
          operation_id: operation.operation_id,
          stage: operation.stage,
          retry_policy: operation.retry_policy,
        });
        send(request, response, error, 500);
        return;
      }
      if (scenario === "analysis-uncertain") {
        operation = makeOperation(
          "uncertain",
          inputVersion,
          "manual_reconciliation_required",
        );
        const error = example("Error_PROVIDER_RESULT_UNCERTAIN");
        Object.assign(error.error, {
          operation_id: operation.operation_id,
          stage: operation.stage,
          retry_policy: operation.retry_policy,
        });
        send(request, response, error, 409);
        return;
      }
      if (scenario === "analysis-running") {
        operation = makeOperation("running", inputVersion);
        send(request, response, { data: operation }, 202);
        return;
      }
      historical = structuredClone(analysis);
      historical.operations_to_inspect = [];
      historical.current_actions = [];
      analysis = example("AnalysisWithEvidence");
      analysis.data.publication.title = historical.data.publication.title;
      analysis.data.analysis_version = inputVersion + 1;
      analysis.data.review.analysis_version = inputVersion + 1;
      revision++;
      operation = makeOperation("succeeded", inputVersion);
      if (scenario === "analysis-lost") {
        request.socket.destroy();
        return;
      }
      send(request, response, { data: operation });
      return;
    }
    send(request, response, example("Error_NOT_FOUND"), 404);
  } catch {
    send(request, response, example("Error_INTERNAL_ERROR"), 500);
  }
});
server.listen(Number(process.env.SENIALON_SYNTHETIC_PORT ?? 3371), "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
