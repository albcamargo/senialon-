// FE 1.9 SYNTHETIC TEST HARNESS ONLY. Never imported by product or demo code.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

if (process.env.SENIALON_SYNTHETIC_TEST_ONLY !== "1")
  throw new Error("Solo se permite ejecución sintética de pruebas.");
const contract = JSON.parse(
  readFileSync(
    new URL("../../../docs/contracts/openapi.json", import.meta.url),
    "utf8",
  ),
);
const example = (name) =>
  structuredClone(contract.components.examples[name].value);
const authorization = `Basic ${Buffer.from(`${process.env.DEMO_USERNAME}:${process.env.DEMO_PASSWORD}`).toString("base64")}`;
let scenario, requests, analysis, older, revision, failReads, deliveries;
function reset(name) {
  scenario = name;
  requests = [];
  revision = 10;
  failReads = false;
  deliveries = new Map();
  analysis = example(
    name === "review-partial"
      ? "AnalysisWithInsufficientEditorialMaterial"
      : name === "review-edit-lock"
        ? "SelectedAnalysis"
        : "AnalysisWithEvidence",
  );
  analysis.data.publication.title = "SINTÉTICO · Aplicación de IA para equipos";
  if (name === "review-no-action") analysis.current_actions = [];
  older = example("AnalysisHistoricalReadOnly");
  older.data.publication.title = analysis.data.publication.title;
  Object.assign(older.data.review, {
    decision: "discarded",
    reason: "SINTÉTICO · Motivo conservado de la versión anterior",
    revision: 2,
  });
}
reset("review-ready");
function run() {
  const value = example("CreatedRun").data;
  value.revision = revision;
  if (scenario === "review-edit-lock")
    value.budget = {
      currency: "USD",
      incremental_limit: "20.00",
      state: "allowed",
      reason: "SINTÉTICO: no acredita saldo real.",
      confirmed_new_charges: "0.00",
      reserved: "0.00",
      available_for_new_calls: "20.00",
    };
  return value;
}
function peerReview() {
  analysis.data.review.revision++;
  analysis.data.review.decision = "discarded";
  analysis.data.review.reason = "SINTÉTICO · Otra sesión guardó esta revisión";
  revision++;
}
function send(request, response, value, status = 200) {
  const id = request.headers["x-request-id"] ?? "synthetic:review:harness";
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Contract-Version": "1.0.0",
    "X-Request-Id": id,
  });
  response.end(
    JSON.stringify({
      ...value,
      meta: {
        contract_version: "1.0.0",
        request_id: id,
        served_at: "2026-10-18T11:00:00-05:00",
      },
    }),
  );
}
async function body(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 4_000_000) throw new Error("Cuerpo demasiado grande");
  }
  return value ? JSON.parse(value) : {};
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1:3381");
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
    const input = request.method === "PUT" ? await body(request) : null;
    requests.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      key: request.headers["idempotency-key"] ?? null,
      body: input,
    });
    const parts = url.pathname.split("/");
    if (failReads && parts[7] === "review" && request.method === "GET") {
      send(request, response, example("Error_INTERNAL_ERROR"), 500);
      return;
    }
    if (parts.length === 5) {
      send(request, response, { data: run() });
      return;
    }
    if (parts[5] === "analyses" && request.method === "GET") {
      const version = url.searchParams.get("analysis_version");
      const value = structuredClone(
        version && Number(version) !== analysis.data.analysis_version
          ? older
          : analysis,
      );
      if (version && Number(version) !== analysis.data.analysis_version) {
        value.current_actions = [];
        value.operations_to_inspect = [];
      }
      send(
        request,
        response,
        parts[7] === "review" ? { data: value.data.review } : value,
      );
      return;
    }
    if (parts[7] === "review" && request.method === "PUT") {
      const key = request.headers["idempotency-key"];
      const previous = deliveries.get(key);
      if (previous) {
        send(
          request,
          response,
          previous.input === JSON.stringify(input)
            ? { data: previous.review }
            : example("Error_IDEMPOTENCY_KEY_REUSED"),
          previous.input === JSON.stringify(input) ? 200 : 409,
        );
        return;
      }
      const attempts = requests.filter((row) => row.method === "PUT");
      if (attempts.length === 1) {
        if (scenario === "review-retry") {
          send(request, response, example("Error_INTERNAL_ERROR"), 500);
          return;
        }
        if (
          scenario === "review-revision-conflict" ||
          scenario === "review-ambiguous-conflict"
        ) {
          peerReview();
          send(
            request,
            response,
            example(
              scenario === "review-revision-conflict"
                ? "Error_VERSION_CONFLICT"
                : "Error_INTERNAL_ERROR",
            ),
            scenario === "review-revision-conflict" ? 409 : 500,
          );
          return;
        }
        if (scenario === "review-version-conflict") {
          older = structuredClone(analysis);
          analysis.data.analysis_version++;
          analysis.data.review.analysis_version++;
          Object.assign(analysis.data.review, {
            review_id: "synthetic-review-version-3",
            revision: 1,
            decision: "pending_review",
            reason: null,
          });
          revision++;
          send(request, response, example("Error_VERSION_CONFLICT"), 409);
          return;
        }
      }
      if (
        input.expected_analysis_version !== analysis.data.analysis_version ||
        input.expected_review_revision !== analysis.data.review.revision
      ) {
        send(request, response, example("Error_VERSION_CONFLICT"), 409);
        return;
      }
      const ids = analysis.data.evidence.map((e) => e.evidence_id);
      if (
        !input.reason.trim() ||
        input.evidence_reviews.length !== ids.length ||
        new Set(input.evidence_reviews.map((e) => e.evidence_id)).size !==
          ids.length ||
        input.evidence_reviews.some((e) => !ids.includes(e.evidence_id))
      ) {
        send(request, response, example("Error_VALIDATION_ERROR"), 422);
        return;
      }
      const review = {
        ...analysis.data.review,
        revision: analysis.data.review.revision + 1,
        decision: input.decision,
        reason: input.reason,
        evidence_reviews: input.evidence_reviews,
        updated_at: "2026-10-18T11:00:00-05:00",
      };
      analysis.data.review = structuredClone(review);
      revision++;
      deliveries.set(key, {
        input: JSON.stringify(input),
        review: structuredClone(review),
      });
      if (scenario === "review-lost") {
        request.socket.destroy();
        return;
      }
      const result = structuredClone(review);
      if (scenario === "review-wrong-ack") result.analysis_version = 99;
      send(request, response, { data: result });
      return;
    }
    send(request, response, example("Error_NOT_FOUND"), 404);
  } catch {
    send(request, response, example("Error_INTERNAL_ERROR"), 500);
  }
});
server.listen(Number(process.env.SENIALON_SYNTHETIC_PORT ?? 3381), "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
