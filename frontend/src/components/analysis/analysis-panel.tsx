"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  advanceAnalysisAction,
  readAnalysisAction,
} from "@/app/analysis-actions";
import { readOperationAction } from "@/app/run-actions";
import type { Schema } from "@/lib/api/types";
import type { AnalysisSnapshot } from "@/lib/analysis/types";
import {
  analysisPath,
  analysisStages,
  canAdvanceAnalysis,
} from "@/lib/analysis/presentation";
import {
  clearReceipt,
  readReceipt,
  saveReceipt,
  type CommandReceipt,
} from "@/lib/runs/command";
import { changedReceipt, useReceipt } from "@/lib/runs/use-receipt";
import { connectionNotice, type Notice, type Result } from "@/lib/runs/types";
import { Feedback, OperationView } from "@/components/runs/run-detail";
import shared from "@/components/runs/runs.module.css";
import { AnalysisView } from "./analysis-view";
import styles from "./analysis.module.css";

type Receipt = Extract<CommandReceipt, { kind: "advance_analysis" }>;
const rejections = new Set([
  "AUTH_REQUIRED",
  "ORIGIN_FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "VERSION_CONFLICT",
  "NOT_ELIGIBLE",
]);
function matches(command: Receipt, operation: Schema<"Operation">) {
  return (
    operation.run_id === command.runId &&
    operation.analysis_id === command.analysisId &&
    operation.item_id === command.videoId &&
    operation.input_version === String(command.analysisVersion) &&
    operation.analysis_version !== null &&
    operation.analysis_version >= command.analysisVersion &&
    analysisStages.has(operation.stage)
  );
}

export function AnalysisPanel({
  runId,
  analysisId,
  version,
  initial,
}: {
  runId: string;
  analysisId: string;
  version?: number;
  initial: Result<AnalysisSnapshot>;
}) {
  const [snapshot, setSnapshot] = useState(initial.ok ? initial.value : null);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(
    initial.ok ? null : initial.error,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [operations, setOperations] = useState<
    Record<string, Schema<"Operation">>
  >({});
  const [inspectedKey, setInspectedKey] = useState<string | null>(null);
  const [inspectedOperation, setInspectedOperation] = useState<string | null>(
    null,
  );
  const storage = useReceipt();
  const lock = useRef(false);
  const pinned = version !== undefined;
  const pending =
    storage.receipt?.kind === "advance_analysis" &&
    storage.receipt.runId === runId &&
    storage.receipt.analysisId === analysisId
      ? storage.receipt
      : null;
  const operation = inspectedOperation ? operations[inspectedOperation] : null;
  const retry =
    !pinned &&
    !stale &&
    !!snapshot &&
    !!pending &&
    inspectedKey === pending.key &&
    !!operation &&
    operation.operation_id === pending.operationId &&
    matches(pending, operation) &&
    ["failed", "blocked"].includes(operation.state) &&
    operation.retry_policy === "same_request_after_status_read" &&
    snapshot.run.budget.state === "allowed" &&
    operation.budget.state === "allowed";
  const ready =
    !pinned &&
    !stale &&
    !busy &&
    storage.ready &&
    !storage.error &&
    !storage.receipt &&
    !!snapshot &&
    canAdvanceAnalysis(snapshot);

  function remember(command: Receipt) {
    saveReceipt(command);
    changedReceipt();
  }
  function forget(key: string) {
    clearReceipt(key);
    changedReceipt();
  }
  async function perform(label: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setNotice(null);
    setMessage("");
    try {
      await work();
    } catch {
      setNotice(connectionNotice);
      setStale(true);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  async function readSnapshot() {
    const result = await readAnalysisAction(runId, analysisId, version);
    if (!result.ok) {
      setNotice(result.error);
      setStale(true);
      return null;
    }
    setSnapshot(result.value);
    setStale(false);
    return result.value;
  }
  function record(operation: Schema<"Operation">) {
    setOperations((current) => ({
      ...current,
      [operation.operation_id]: operation,
    }));
    setInspectedOperation(operation.operation_id);
  }
  function reconcile(
    command: Receipt,
    operation: Schema<"Operation">,
    fresh: AnalysisSnapshot,
  ) {
    if (!matches(command, operation)) return;
    record(operation);
    if (operation.state === "succeeded") {
      forget(command.key);
      setMessage(
        "Operación confirmada. Se conserva el resultado guardado; no se repite el consumo.",
      );
      if (fresh.latestVersion <= command.analysisVersion) setStale(true);
    } else {
      remember({ ...command, operationId: operation.operation_id });
      setInspectedKey(command.key);
      setMessage(
        operation.state === "uncertain"
          ? "Resultado incierto: requiere conciliación manual. La reserva y la identidad se conservan; no se reenviará automáticamente."
          : "Operación consultada sin repetir la solicitud.",
      );
    }
  }
  async function recover(fresh: AnalysisSnapshot) {
    const command = readReceipt();
    if (
      command?.kind !== "advance_analysis" ||
      command.runId !== runId ||
      command.analysisId !== analysisId
    )
      return;
    const checkpoint = fresh.run.last_checkpoint;
    const ids = command.operationId
      ? [command.operationId]
      : [
          ...new Set([
            ...fresh.response.operations_to_inspect.map(
              (item) => item.operation_id,
            ),
            ...fresh.run.operations_to_inspect
              .filter((item) => item.analysis_id === analysisId)
              .map((item) => item.operation_id),
            ...(checkpoint &&
            checkpoint.item_id === command.videoId &&
            analysisStages.has(checkpoint.stage)
              ? [checkpoint.operation_id]
              : []),
          ]),
        ];
    const results = await Promise.all(
      ids.map((id) => readOperationAction(runId, id)),
    );
    const matching = results.flatMap((result) =>
      result.ok && matches(command, result.value.data)
        ? [result.value.data]
        : [],
    );
    if (matching.length === 1) {
      reconcile(command, matching[0], fresh);
      return;
    }
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) setNotice(failed.error);
    setMessage(
      "La entrega sigue sin confirmarse con una operación de esta pieza y versión. Conserva la identidad para conciliación; no se solicitará otro análisis.",
    );
  }
  async function load() {
    await perform("Consultando ficha…", async () => {
      setInspectedKey(null);
      const fresh = await readSnapshot();
      if (!fresh) return;
      setMessage(
        "Ficha consultada. Esta lectura no solicita análisis ni guarda una decisión editorial.",
      );
      await recover(fresh);
    });
  }
  async function inspect(id: string) {
    if (!snapshot) return;
    await perform("Consultando operación…", async () => {
      setInspectedKey(null);
      const result = await readOperationAction(runId, id);
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      const current = result.value.data;
      if (
        current.analysis_id !== analysisId ||
        current.item_id !== snapshot.response.data.publication.video_id ||
        !analysisStages.has(current.stage)
      ) {
        setNotice({
          ...connectionNotice,
          code: "STALE_DATA",
          message:
            "La operación no corresponde a esta publicación seleccionada. Consulta su ejecución para conciliarla.",
        });
        return;
      }
      record(current);
      const command = readReceipt();
      if (
        command?.kind === "advance_analysis" &&
        command.runId === runId &&
        command.analysisId === analysisId &&
        matches(command, current)
      ) {
        const fresh = await readSnapshot();
        if (fresh) reconcile(command, current, fresh);
      } else
        setMessage(
          "Estado de la operación recibido, sin solicitar un nuevo paso.",
        );
    });
  }
  async function advance(command?: Receipt) {
    if (!snapshot) return;
    await perform(
      command
        ? "Reenviando la misma solicitud…"
        : "Solicitando paso de análisis…",
      async () => {
        if (
          command
            ? !retry || readReceipt()?.key !== command.key
            : !ready || readReceipt()
        )
          return;
        const delivery: Receipt = command ?? {
          version: 1,
          kind: "advance_analysis",
          key: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          operationId: null,
          runId,
          analysisId,
          revision: snapshot.run.revision,
          analysisVersion: snapshot.response.data.analysis_version,
          videoId: snapshot.response.data.publication.video_id,
        };
        remember(delivery);
        setInspectedKey(null);
        const result = await advanceAnalysisAction(
          delivery.runId,
          delivery.analysisId,
          delivery.revision,
          delivery.analysisVersion,
          delivery.key,
        );
        if (!result.ok) {
          if (result.error.operationId)
            remember({ ...delivery, operationId: result.error.operationId });
          else if (rejections.has(result.error.code)) forget(delivery.key);
          setNotice(result.error);
          setStale(true);
          return;
        }
        const current = result.value.data;
        if (!matches(delivery, current)) {
          remember({ ...delivery, operationId: current.operation_id });
          setStale(true);
          setNotice({
            ...connectionNotice,
            code: "STALE_DATA",
            message:
              "La respuesta no coincide con la publicación y versión solicitadas. Conserva su identidad y consulta antes de continuar.",
          });
          return;
        }
        record(current);
        if (current.state === "succeeded") forget(delivery.key);
        else remember({ ...delivery, operationId: current.operation_id });
        const fresh = await readSnapshot();
        if (fresh && current.state === "succeeded")
          setMessage(
            "Paso guardado por el servidor. Cada nuevo avance requiere otra acción explícita.",
          );
      },
    );
  }

  const refs = snapshot?.response.operations_to_inspect ?? [];
  const ids = [
    ...new Set([
      ...refs.map((item) => item.operation_id),
      ...Object.keys(operations),
      ...(pending?.operationId ? [pending.operationId] : []),
    ]),
  ];
  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h1>Ficha de publicación</h1>
        <div className={styles.toolbar}>
          <button
            className={shared.secondaryButton}
            onClick={load}
            disabled={!!busy}
          >
            Consultar ficha
          </button>
          <button
            className={shared.primaryButton}
            onClick={() => advance()}
            disabled={!ready}
            aria-describedby="analysis-step-help"
          >
            Solicitar paso de análisis
          </button>
        </div>
      </div>
      <p id="analysis-step-help" className={styles.secondary}>
        {pinned
          ? "Esta URL fija una versión de lectura. Abre la versión actual para continuar el análisis."
          : stale
            ? "Consulta el estado actual antes de solicitar otro paso."
            : storage.receipt
              ? "Hay una solicitud sin confirmar. Consulta su operación antes de continuar."
              : snapshot?.run.budget.state !== "allowed"
                ? "El gasto no está autorizado en el estado recibido. Puedes consultar los resultados disponibles."
                : "Cada acción solicita una sola unidad de análisis y guarda su resultado. Abrir o consultar la ficha no solicita trabajo; no se garantiza que continúe al cerrar el navegador."}
      </p>
      <div className={styles.links}>
        <Link
          prefetch={false}
          href={`/?run=${encodeURIComponent(runId)}#publicaciones`}
        >
          Volver a publicaciones de esta ejecución
        </Link>
        {snapshot ? (
          <Link
            prefetch={false}
            href={analysisPath(
              runId,
              analysisId,
              snapshot.response.data.analysis_version,
            )}
          >
            Enlace a esta versión guardada
          </Link>
        ) : null}
      </div>
      {pinned ? (
        <div className={styles.version}>
          <p className={styles.state}>
            {snapshot &&
            snapshot.response.data.analysis_version < snapshot.latestVersion
              ? "Versión anterior · solo lectura"
              : "Versión fijada · solo lectura"}
          </p>
          {snapshot ? (
            <p>
              Versión consultada: {snapshot.response.data.analysis_version}.
              Última versión recibida: {snapshot.latestVersion}.
            </p>
          ) : null}
          <Link
            className={styles.sourceLink}
            prefetch={false}
            href={analysisPath(runId, analysisId)}
          >
            Abrir versión actual
          </Link>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className={styles.live}>
        {busy ?? message}
      </p>
      {notice ? (
        <Feedback
          notice={notice}
          title="No se pudo confirmar la ficha o su operación"
        />
      ) : null}
      {storage.error ? (
        <p className={shared.warning} role="alert">
          No se pudo recuperar el registro local de solicitudes. Puedes
          consultar resultados; los nuevos pasos quedan detenidos para conservar
          su identidad.
        </p>
      ) : null}
      {pending ? (
        <p className={shared.warning}>
          Hay una solicitud de análisis pendiente de confirmar para esta pieza.
          Consulta la ficha y su operación; no se reenvía automáticamente.
        </p>
      ) : storage.receipt ? (
        <div className={shared.warning}>
          <p>
            Hay otra solicitud sin confirmar. Resuélvela antes de solicitar un
            nuevo paso.
          </p>
          {storage.receipt.kind !== "create" ? (
            <Link
              prefetch={false}
              href={
                storage.receipt.kind === "advance_analysis"
                  ? analysisPath(
                      storage.receipt.runId,
                      storage.receipt.analysisId,
                    )
                  : `/?run=${encodeURIComponent(storage.receipt.runId)}`
              }
            >
              Abrir el contexto de esa solicitud
            </Link>
          ) : null}
        </div>
      ) : null}
      {ids.length ? (
        <section
          className={styles.operations}
          aria-labelledby="analysis-operations-title"
        >
          <h2 id="analysis-operations-title">Operaciones del análisis</h2>
          <ul>
            {ids.map((id) => (
              <li key={id}>
                <button
                  className={shared.secondaryButton}
                  onClick={() => inspect(id)}
                  disabled={!!busy}
                >
                  Consultar operación
                  <span className={shared.srOnly}> {id}</span>
                </button>
                {operations[id] ? (
                  <OperationView operation={operations[id]} />
                ) : (
                  <p className={styles.secondary}>
                    Operación recuperable: <code>{id}</code>.
                  </p>
                )}
              </li>
            ))}
          </ul>
          {retry && pending ? (
            <button
              className={shared.secondaryButton}
              onClick={() => advance(pending)}
              disabled={!!busy || storage.error}
            >
              Reenviar la misma solicitud
            </button>
          ) : null}
        </section>
      ) : null}
      {snapshot ? (
        <AnalysisView snapshot={snapshot} stale={stale} />
      ) : (
        <p className={styles.secondary}>
          No hay una ficha validada disponible en esta consulta. Puedes
          consultar de nuevo o volver a las publicaciones; no se ha iniciado un
          análisis desde esta lectura.
        </p>
      )}
    </div>
  );
}
