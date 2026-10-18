// SYNTHETIC TEST HARNESS ONLY. No provider client, database or production import.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

if (process.env.SENIALON_SYNTHETIC_TEST_ONLY !== "1")
  throw new Error(
    "Este servidor solo admite la configuración sintética de pruebas.",
  );
const canonical = JSON.parse(
  readFileSync(
    new URL("../../../docs/contracts/openapi.json", import.meta.url),
    "utf8",
  ),
);
const example = (name) =>
  structuredClone(canonical.components.examples[name].value);
const authorization = `Basic ${Buffer.from(`${process.env.DEMO_USERNAME}:${process.env.DEMO_PASSWORD}`).toString("base64")}`;
let scenario = "partial";
let failReads = "";
let revision = 10;
let created = false;
let operation = null;
let requests = [];
let groupProposal = null;
let comparison = null;
let publicationItems = [];
let selectedAnalyses = [];

function makePublication(videoId, title, confirmed = false) {
  const value = example("PublicVideo180").data;
  value.video_id = videoId;
  value.capture_id = "synthetic-capture-" + videoId;
  value.url = "https://www.youtube.com/watch?v=" + videoId;
  value.title = title;
  value.description =
    "Escenario sintético de prueba de FE 1.7; no son publicaciones recolectadas por SENIALON.";
  value.main_topic_id = null;
  value.evidence.forEach((item) => {
    item.video_id = videoId;
    item.evidence_id = "synthetic-text-" + videoId;
    item.source_url = value.url;
  });
  value.ai_relevance.evidence_ids = value.evidence.map(
    (item) => item.evidence_id,
  );
  if (confirmed) {
    value.short_status = "confirmed_short";
    value.short_evidence =
      "SINTÉTICO: respaldo de confirmación del Short, exclusivo de prueba.";
    value.statistics.views = {
      state: "known",
      value: "9007199254740993",
      reason: null,
    };
  }
  return value;
}

function makeSelection(publication) {
  const value = example("SelectedAnalysis");
  const data = value.data;
  data.analysis_id = "synthetic-analysis-" + publication.video_id;
  data.publication = structuredClone(publication);
  data.performance.capture_id = publication.capture_id;
  data.evidence = structuredClone(publication.evidence);
  data.review.analysis_id = data.analysis_id;
  data.review.evidence_reviews = data.evidence.map((item) => ({
    evidence_id: item.evidence_id,
    state: "pending_review",
    note: null,
  }));
  if (scenario === "publications-no-growth") {
    const signal = example("Signal_2_0");
    data.groups_id = signal.groups_id;
    data.groups_version = signal.groups_version;
    data.publication.main_topic_id = signal.topic_id;
    data.signal = {
      state: "available",
      topic_id: signal.topic_id,
      comparison_revision: 9,
      signal,
    };
  }
  return value;
}

function comparisonState() {
  const value = example(
    scenario === "comparison-partial"
      ? "PartialComparison"
      : "CompleteComparison",
  ).data;
  value.groups_id = groupProposal.groups_id;
  value.groups_version = groupProposal.groups_version;
  value.confirmation_id = groupProposal.confirmation?.confirmation_id ?? null;
  value.limitations = [
    "Escenario sintético de prueba de FE 1.6; no son resultados reales de SENIALON.",
  ];
  if (
    scenario === "comparison-unconfirmed" ||
    !["comparison-complete", "comparison-partial"].includes(scenario)
  ) {
    value.state =
      scenario === "comparison-unconfirmed"
        ? "groups_unconfirmed"
        : "not_requested";
    value.signals = [];
    value.computed_at = null;
    value.comparison_revision = null;
  } else {
    value.computed_at = "2026-10-17T12:30:00-05:00";
    value.comparison_revision = revision;
  }
  return value;
}

function run(runId = "fixture-run-001") {
  const value = example("CreatedRun").data;
  value.run_id = runId;
  value.revision = revision;
  value.workflow.reason =
    "Escenario sintético de prueba: pendiente de solicitud explícita.";
  value.budget = {
    currency: "USD",
    incremental_limit: "20.00",
    state: "allowed",
    reason: "Importes sintéticos de prueba; no acreditan saldo real.",
    confirmed_new_charges: "0.00",
    reserved: "0.00",
    available_for_new_calls: "20.00",
  };
  value.corpus[1].resolution = {
    state: "failed",
    reason: "Fallo sintético de resolución del canal.",
  };
  if (scenario.startsWith("groups")) {
    value.current_stage =
      groupProposal?.state === "confirmed"
        ? "comparison"
        : "awaiting_confirmation";
    value.allowed_actions =
      groupProposal?.state === "confirmed"
        ? ["advance_comparison", "select_analysis"]
        : scenario === "groups-pending"
          ? []
          : ["confirm_groups", "select_analysis"];
  }
  if (scenario.startsWith("comparison-")) {
    value.current_stage = comparison?.computed_at
      ? "idle"
      : groupProposal.state === "confirmed"
        ? "comparison"
        : "awaiting_confirmation";
    value.allowed_actions = comparison?.computed_at
      ? ["select_analysis"]
      : groupProposal.state === "confirmed"
        ? ["advance_comparison", "select_analysis"]
        : ["confirm_groups", "select_analysis"];
    value.corpus.forEach((source) => {
      source.resolution = { state: "complete", reason: null };
      source.resolved_channel_id = "synthetic-" + source.source_id;
    });
    if (operation?.state === "succeeded")
      value.last_checkpoint = operation.last_checkpoint;
  }
  if (scenario.startsWith("publications-")) {
    value.current_stage =
      scenario === "publications-no-growth" ? "idle" : "awaiting_confirmation";
    value.allowed_actions = ["select_analysis"];
    value.workflow.reason =
      "Escenario sintético FE 1.7: selección independiente de grupos y comparación.";
  }
  if (operation && operation.state !== "succeeded") {
    value.allowed_actions = [];
    value.workflow = {
      state: operation.state === "running" ? "running" : operation.state,
      reason: "Escenario sintético de recuperación de operación.",
    };
    value.operations_to_inspect = [
      {
        operation_id: operation.operation_id,
        run_id: value.run_id,
        analysis_id: null,
        state: operation.state,
        stage: operation.stage,
        updated_at: operation.updated_at,
      },
    ];
  }
  return value;
}
function makeOperation(state, retryPolicy = "none") {
  const value = example(
    state === "succeeded" ? "CompletedOperation" : `Operation_${state}`,
  ).data;
  value.run_revision = revision;
  value.retry_policy = retryPolicy;
  value.reason =
    state === "uncertain"
      ? "Resultado sintético incierto: reserva retenida, requiere conciliación."
      : "Resultado sintético de prueba.";
  return value;
}
function send(request, response, status, body) {
  const identity = request.headers["x-request-id"] ?? "synthetic-harness";
  const value = structuredClone(body);
  value.meta = {
    contract_version: "1.0.0",
    request_id: identity,
    served_at: scenario.startsWith("comparison-")
      ? "2026-10-18T10:00:00-05:00"
      : "2026-10-17T12:00:00-05:00",
  };
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Contract-Version": "1.0.0",
    "X-Request-Id": identity,
  });
  response.end(JSON.stringify(value));
}
async function jsonBody(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 65536) throw new Error("Cuerpo demasiado grande.");
  }
  return text ? JSON.parse(text) : {};
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1:3341");
    if (url.pathname === "/health") {
      response.end("SYNTHETIC TEST ONLY");
      return;
    }
    if (url.pathname === "/__test/scenario" && request.method === "POST") {
      const body = await jsonBody(request);
      scenario = body.scenario;
      failReads = "";
      revision = 10;
      created = false;
      requests = [];
      operation = null;
      groupProposal = scenario.startsWith("groups")
        ? example(
            scenario === "groups-secondary"
              ? "GroupsWithSecondaryTopics"
              : "ProposedGroups",
          ).data.proposal
        : null;
      comparison = null;
      publicationItems = [];
      selectedAnalyses = [];
      if (scenario.startsWith("publications-")) {
        publicationItems =
          scenario === "publications-empty"
            ? []
            : [
                makePublication(
                  "demoB000001",
                  "SINTÉTICO · Aplicación de IA para equipos",
                ),
                makePublication(
                  "demoC000001",
                  "SINTÉTICO · Automatización con IA",
                  true,
                ),
              ];
        if (scenario === "publications-lost-paged")
          selectedAnalyses = [makeSelection(publicationItems[1])];
      }
      if (scenario.startsWith("comparison-")) {
        groupProposal = example(
          scenario === "comparison-unconfirmed"
            ? "ProposedGroups"
            : "ConfirmedGroups",
        ).data.proposal;
        comparison = comparisonState();
      }
      if (scenario === "lost") operation = makeOperation("running");
      if (scenario === "uncertain")
        operation = makeOperation(
          "uncertain",
          "manual_reconciliation_required",
        );
      response.end("SYNTHETIC RESET");
      return;
    }
    if (url.pathname === "/__test/fail" && request.method === "POST") {
      failReads = (await jsonBody(request)).reads;
      response.end("SYNTHETIC FAILURE ENABLED");
      return;
    }
    if (url.pathname === "/__test/requests") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(requests));
      return;
    }
    if (request.headers.authorization !== authorization) {
      response.setHeader(
        "WWW-Authenticate",
        'Basic realm="SENIALON", charset="UTF-8"',
      );
      send(request, response, 401, example("Error_AUTH_REQUIRED"));
      return;
    }
    const body = request.method === "POST" ? await jsonBody(request) : null;
    requests.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      key: request.headers["idempotency-key"] ?? null,
      body,
    });
    if (
      request.method === "GET" &&
      (failReads === "all" ||
        (failReads === "groups" && url.pathname.endsWith("/groups")) ||
        (failReads === "comparison" && url.pathname.endsWith("/comparison")) ||
        (failReads === "publications" && url.pathname.endsWith("/videos")) ||
        (failReads === "selections" && url.pathname.endsWith("/analyses")) ||
        (failReads === "coverage" && url.pathname.endsWith("/coverage")))
    ) {
      send(request, response, 500, example("Error_INTERNAL_ERROR"));
      return;
    }
    if (url.pathname === "/api/v1/runs") {
      if (request.method === "GET") {
        if (scenario === "paged-conflict" && url.searchParams.has("cursor")) {
          send(request, response, 409, example("Error_VERSION_CONFLICT"));
          return;
        }
        const value = example("RunList");
        value.items =
          scenario === "empty" && !created
            ? []
            : [
                run(
                  url.searchParams.has("cursor")
                    ? "fixture-run-002"
                    : undefined,
                ),
              ];
        value.snapshot_revision = 10;
        value.next_cursor =
          scenario.startsWith("paged") && !url.searchParams.has("cursor")
            ? "synthetic:opaque:+/page2"
            : null;
        send(request, response, 200, value);
        return;
      }
      if (request.method === "POST") {
        created = true;
        send(request, response, 201, { data: run() });
        return;
      }
    }
    const segments = url.pathname.split("/");
    const runId = segments[4];
    if (url.pathname.startsWith("/api/v1/runs/") && runId) {
      if (segments.length === 5 && request.method === "GET") {
        send(request, response, 200, { data: run(runId) });
        return;
      }
      if (
        scenario.startsWith("publications-") &&
        ["videos", "analyses"].includes(segments[5])
      ) {
        const secondPage = url.searchParams.has("cursor");
        if (segments[5] === "videos" && request.method === "GET") {
          if (segments.length === 7) {
            const publication = publicationItems.find(
              (item) => item.video_id === segments[6],
            );
            if (!publication) {
              send(request, response, 404, example("Error_NOT_FOUND"));
              return;
            }
            const value = structuredClone(publication);
            if (scenario === "publications-ineligible") {
              value.eligibility = "pending";
              value.eligibility_reason =
                "SINTÉTICO: duración no disponible en la consulta actual.";
              value.duration = {
                state: "unknown",
                seconds: null,
                reason: "No disponible.",
              };
              value.short_status = "undetermined";
            }
            send(request, response, 200, { data: value });
            return;
          }
          if (scenario === "publications-paged-conflict" && secondPage) {
            revision++;
            send(request, response, 409, example("Error_VERSION_CONFLICT"));
            return;
          }
          const paged = scenario.startsWith("publications-paged");
          send(request, response, 200, {
            items: paged
              ? publicationItems.slice(secondPage ? 1 : 0, secondPage ? 2 : 1)
              : publicationItems,
            next_cursor:
              paged && !secondPage ? "synthetic:publications:+/page2" : null,
            snapshot_revision: revision,
          });
          return;
        }
        if (segments[5] === "analyses" && request.method === "GET") {
          if (segments.length === 7) {
            const selected = selectedAnalyses.find(
              (item) => item.data.analysis_id === segments[6],
            );
            send(
              request,
              response,
              selected ? 200 : 404,
              selected ?? example("Error_NOT_FOUND"),
            );
            return;
          }
          const paged =
            scenario === "publications-lost-paged" &&
            selectedAnalyses.length > 1;
          const items = (
            paged
              ? selectedAnalyses.slice(secondPage ? 1 : 0, secondPage ? 2 : 1)
              : selectedAnalyses
          ).map(({ data }) => ({
            analysis_id: data.analysis_id,
            analysis_version: data.analysis_version,
            video_id: data.publication.video_id,
            created_at: data.created_at,
            audiovisual: data.audiovisual,
          }));
          send(request, response, 200, {
            items,
            next_cursor:
              paged && !secondPage ? "synthetic:selections:+/page2" : null,
            snapshot_revision: revision,
          });
          return;
        }
        if (segments[5] === "analyses" && request.method === "POST") {
          const selected = selectedAnalyses.find(
            (item) => item.data.publication.video_id === body.video_id,
          );
          if (selected) {
            send(request, response, 200, selected);
            return;
          }
          const attempts = requests.filter(
            (item) => item.method === "POST" && item.path.endsWith("/analyses"),
          );
          if (
            ["publications-retry", "publications-revision-changed"].includes(
              scenario,
            ) &&
            attempts.length === 1
          ) {
            if (scenario === "publications-revision-changed") revision++;
            send(request, response, 500, example("Error_INTERNAL_ERROR"));
            return;
          }
          if (scenario === "publications-not-eligible") {
            send(request, response, 422, example("Error_NOT_ELIGIBLE"));
            return;
          }
          if (body.expected_run_revision !== revision) {
            send(request, response, 409, example("Error_VERSION_CONFLICT"));
            return;
          }
          const publication = publicationItems.find(
            (item) => item.video_id === body.video_id,
          );
          if (!publication) {
            send(request, response, 422, example("Error_NOT_ELIGIBLE"));
            return;
          }
          const value = makeSelection(publication);
          selectedAnalyses.push(value);
          revision++;
          if (
            ["publications-lost", "publications-lost-paged"].includes(scenario)
          ) {
            request.socket.destroy();
            return;
          }
          send(request, response, 201, value);
          return;
        }
      }
      if (segments[5] === "coverage" && request.method === "GET") {
        if (
          scenario.startsWith("comparison-") &&
          scenario !== "comparison-partial"
        ) {
          const value = example("CompleteCoverage");
          value.data.run_revision = revision;
          value.data.cells.forEach((cell) => {
            cell.discovered_video_ids = comparison.signals.flatMap((signal) =>
              signal[cell.window].by_source
                .filter((source) => source.source_id === cell.source_id)
                .flatMap((source) => source.video_ids),
            );
          });
          send(request, response, 200, value);
          return;
        }
        const value = example("PartialCoverage");
        value.data.run_id = runId;
        value.data.run_revision = revision;
        value.data.limitations = [
          "Escenario sintético de prueba: c02/anterior no consultable.",
        ];
        send(request, response, 200, value);
        return;
      }
      if (
        segments[5] === "comparison" &&
        request.method === "GET" &&
        comparison
      ) {
        send(request, response, 200, { data: comparison });
        return;
      }
      if (segments[5] === "groups" && groupProposal) {
        if (request.method === "GET" && segments.length === 6) {
          send(request, response, 200, {
            data: {
              run_id: runId,
              stage:
                scenario === "groups-pending"
                  ? {
                      state: "pending",
                      reason: "Propuesta sintética aún no disponible.",
                    }
                  : { state: "complete", reason: null },
              proposal: scenario === "groups-pending" ? null : groupProposal,
            },
          });
          return;
        }
        if (request.method === "POST" && segments[6] === "confirmation") {
          const attempts = requests.filter(
            (item) =>
              item.method === "POST" && item.path.endsWith("/confirmation"),
          );
          if (
            (scenario === "groups-retry" || scenario === "groups-uncertain") &&
            attempts.length === 1
          ) {
            operation = makeOperation(
              scenario === "groups-retry" ? "failed" : "uncertain",
              scenario === "groups-retry"
                ? "same_request_after_status_read"
                : "manual_reconciliation_required",
            );
            operation.stage = "group_confirmation";
            const error = example(
              scenario === "groups-retry"
                ? "Error_INTERNAL_ERROR"
                : "Error_PROVIDER_RESULT_UNCERTAIN",
            );
            error.error.operation_id = operation.operation_id;
            error.error.stage = operation.stage;
            error.error.retry_policy = operation.retry_policy;
            send(
              request,
              response,
              scenario === "groups-retry" ? 500 : 409,
              error,
            );
            return;
          }
          if (scenario === "groups-conflict" && attempts.length === 1) {
            revision++;
            groupProposal.groups_version++;
            groupProposal.created_at = "2026-10-17T12:01:00-05:00";
            send(request, response, 409, example("Error_VERSION_CONFLICT"));
            return;
          }
          if (
            body.expected_run_revision !== revision ||
            body.groups_id !== groupProposal.groups_id ||
            body.groups_version !== groupProposal.groups_version
          ) {
            send(request, response, 409, example("Error_VERSION_CONFLICT"));
            return;
          }
          groupProposal.state = "confirmed";
          groupProposal.confirmation = {
            confirmation_id: "synthetic-confirmation-001",
            groups_id: groupProposal.groups_id,
            groups_version: groupProposal.groups_version,
            confirmed_at: "2026-10-17T12:02:00-05:00",
            actor: "shared_demo_operator",
          };
          revision++;
          if (operation) operation = makeOperation("succeeded");
          if (scenario === "groups-lost-after-send") {
            request.socket.destroy();
            return;
          }
          send(request, response, 200, {
            data: {
              run_id: runId,
              stage: { state: "complete", reason: null },
              proposal: groupProposal,
            },
          });
          return;
        }
      }
      if (
        segments[5] === "operations" &&
        operation &&
        request.method === "GET"
      ) {
        send(request, response, 200, { data: operation });
        return;
      }
      if (segments[5] === "advance" && request.method === "POST") {
        if (scenario.startsWith("comparison-")) {
          if (
            body.target?.scope !== "comparison" ||
            groupProposal.state !== "confirmed"
          ) {
            send(request, response, 409, example("Error_GROUPS_NOT_CONFIRMED"));
            return;
          }
          const attempts = requests.filter(
            (item) => item.method === "POST" && item.path.endsWith("/advance"),
          );
          revision++;
          const state =
            scenario === "comparison-uncertain"
              ? "uncertain"
              : scenario === "comparison-retry" && attempts.length === 1
                ? "failed"
                : "succeeded";
          operation = makeOperation(
            state,
            state === "uncertain"
              ? "manual_reconciliation_required"
              : state === "failed"
                ? "same_request_after_status_read"
                : "none",
          );
          operation.stage = "comparison";
          operation.item_id = groupProposal.groups_id;
          operation.input_version = String(groupProposal.groups_version);
          operation.last_checkpoint =
            state === "succeeded"
              ? {
                  operation_id: operation.operation_id,
                  stage: "comparison",
                  item_id: operation.item_id,
                  committed_at: "2026-10-17T12:30:00-05:00",
                }
              : null;
          if (state === "succeeded") {
            comparison = example("CompleteComparison").data;
            comparison.comparison_revision = revision;
            comparison.confirmation_id =
              groupProposal.confirmation.confirmation_id;
            comparison.computed_at = "2026-10-17T12:30:00-05:00";
            comparison.limitations = [
              "Escenario sintético de prueba de FE 1.6; no son resultados reales de SENIALON.",
            ];
          }
          if (scenario === "comparison-lost") {
            request.socket.destroy();
            return;
          }
          send(request, response, 200, { data: operation });
          return;
        }
        revision++;
        if (scenario === "lost-after-send") {
          operation = makeOperation(
            "uncertain",
            "manual_reconciliation_required",
          );
          request.socket.destroy();
          return;
        }
        const advances = requests.filter(
          (item) => item.method === "POST" && item.path.endsWith("/advance"),
        );
        operation =
          scenario === "retry" && advances.length === 1
            ? makeOperation("failed", "same_request_after_status_read")
            : makeOperation("succeeded");
        send(request, response, 200, { data: operation });
        return;
      }
    }
    send(request, response, 404, example("Error_NOT_FOUND"));
  } catch {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  }
});
server.listen(
  Number(process.env.SENIALON_SYNTHETIC_PORT ?? "3341"),
  "127.0.0.1",
);
process.on("SIGTERM", () => {
  server.closeAllConnections();
  server.close();
});
