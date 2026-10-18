"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  advanceRunAction,
  createRunAction,
  listRunsAction,
  readOperationAction,
  readRunAction,
} from "@/app/run-actions";
import type { Schema } from "@/lib/api/types";
import {
  clearReceipt,
  readReceipt,
  saveReceipt,
  type CommandReceipt,
} from "@/lib/runs/command";
import { changedReceipt, useReceipt } from "@/lib/runs/use-receipt";
import { GroupPanel } from "@/components/groups/group-panel";
import { ComparisonPanel } from "@/components/comparison/comparison-panel";
import { PublicationsPanel } from "@/components/publications/publications-panel";
import { expectedCorpus, sourceLabel } from "@/lib/runs/corpus";
import {
  canAdvance,
  dateLabel,
  phaseLabel,
  stageLabels,
} from "@/lib/runs/presentation";
import {
  connectionNotice,
  type Notice,
  type Result,
  type RunSnapshot,
} from "@/lib/runs/types";
import {
  CoverageView,
  Feedback,
  OperationView,
  RunContext,
} from "./run-detail";
import styles from "./runs.module.css";

const definitiveRejections = new Set([
  "AUTH_REQUIRED",
  "ORIGIN_FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "VERSION_CONFLICT",
  "GROUPS_NOT_CONFIRMED",
  "NOT_ELIGIBLE",
]);

export function RunsConsole({
  initialList,
  initialSnapshot,
  selectedId,
}: {
  initialList: Result<Schema<"RunsResponse">>;
  initialSnapshot: RunSnapshot | null;
  selectedId: string | null;
}) {
  const router = useRouter();
  const [list, setList] = useState(initialList);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [retainedCoverage, setRetainedCoverage] = useState(
    initialSnapshot?.coverage.ok ? initialSnapshot : null,
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [stale, setStale] = useState(false);
  const [listStale, setListStale] = useState(false);
  const [operations, setOperations] = useState<
    Record<string, Schema<"Operation">>
  >({});
  const [inspected, setInspected] = useState<string | null>(null);
  const lock = useRef(false);
  const storage = useReceipt();
  const run = snapshot?.run.ok ? snapshot.run.value.data : null;
  const receipt = storage.receipt;

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

  function remember(command: CommandReceipt) {
    saveReceipt(command);
    changedReceipt();
  }
  function forget(key: string) {
    clearReceipt(key);
    changedReceipt();
  }

  async function refreshRun() {
    if (!selectedId) return;
    const fresh = await readRunAction(selectedId);
    if (fresh.run.ok) {
      setSnapshot(fresh);
      setStale(false);
      if (fresh.coverage.ok) setRetainedCoverage(fresh);
    } else {
      setNotice(fresh.run.error);
      setStale(true);
    }
  }

  async function refresh() {
    await perform("Consultando estado…", async () => {
      const [fresh] = await Promise.all([listRunsAction(), refreshRun()]);
      if (fresh.ok) {
        setList(fresh);
        setListStale(false);
      } else {
        setNotice(fresh.error);
        setListStale(true);
      }
      setInspected(null);
      setMessage("Consulta terminada. Esta lectura no solicita un avance.");
    });
  }

  async function more() {
    if (!list.ok || !list.value.next_cursor || listStale) return;
    const previous = list.value;
    await perform("Consultando ejecuciones anteriores…", async () => {
      const next = await listRunsAction(previous.next_cursor ?? undefined);
      if (!next.ok) {
        setNotice(next.error);
        setListStale(true);
        return;
      }
      if (
        next.value.snapshot_revision !== previous.snapshot_revision ||
        next.value.items.some((item) =>
          previous.items.some((old) => old.run_id === item.run_id),
        )
      ) {
        setNotice({
          ...connectionNotice,
          code: "STALE_DATA",
          message:
            "El listado cambió. Actualiza para consultar una sola versión sin mezclar páginas.",
        });
        setListStale(true);
        return;
      }
      setList({
        ok: true,
        value: {
          ...next.value,
          items: [...previous.items, ...next.value.items],
        },
      });
    });
  }

  async function commandError(error: Notice, command: CommandReceipt) {
    setNotice(error);
    setStale(true);
    if (error.operationId)
      remember({ ...command, operationId: error.operationId });
    else if (definitiveRejections.has(error.code)) forget(command.key);
  }

  async function create() {
    await perform("Creando ejecución…", async () => {
      if (readReceipt()) return;
      const command: CommandReceipt = {
        version: 1,
        kind: "create",
        key: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        operationId: null,
      };
      remember(command);
      const result = await createRunAction(command.key);
      if (!result.ok) {
        await commandError(result.error, command);
        return;
      }
      setNavigating(true);
      forget(command.key);
      router.push(`/?run=${encodeURIComponent(result.value.data.run_id)}`);
    });
  }

  async function advance(command?: CommandReceipt) {
    if (!run) return;
    await perform(
      command ? "Reenviando la misma solicitud…" : "Solicitando un paso…",
      async () => {
        const delivery: CommandReceipt = command ?? {
          version: 1,
          kind: "advance",
          key: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          operationId: null,
          runId: run.run_id,
          revision: run.revision,
        };
        if (delivery.kind !== "advance" || delivery.runId !== run.run_id)
          return;
        if (!command && (readReceipt() || !canAdvance(run) || stale)) return;
        remember(delivery);
        const result = await advanceRunAction(
          delivery.runId,
          delivery.revision,
          delivery.key,
        );
        setInspected(null);
        if (!result.ok) {
          await commandError(result.error, delivery);
          return;
        }
        const operation = result.value.data;
        setOperations((current) => ({
          ...current,
          [operation.operation_id]: operation,
        }));
        if (operation.state === "succeeded") forget(delivery.key);
        else remember({ ...delivery, operationId: operation.operation_id });
        setStale(true);
        await refreshRun();
        setMessage(
          "Respuesta del paso recibida. Cada nuevo avance requiere otra acción explícita.",
        );
      },
    );
  }

  async function inspect(operationId: string) {
    if (!run) return;
    await perform("Consultando operación…", async () => {
      setInspected(null);
      const result = await readOperationAction(run.run_id, operationId);
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      const operation = result.value.data;
      setOperations((current) => ({ ...current, [operationId]: operation }));
      setInspected(operationId);
      if (
        receipt?.kind === "advance" &&
        receipt.runId === run.run_id &&
        receipt.operationId === operationId &&
        operation.state === "succeeded"
      )
        forget(receipt.key);
      setMessage(
        "Estado de la operación consultado. No se ha vuelto a enviar el paso.",
      );
    });
  }

  const references = run?.operations_to_inspect ?? [];
  const operationIds = [
    ...new Set([
      ...references.map((operation) => operation.operation_id),
      ...Object.keys(operations),
      ...(receipt?.kind === "advance" &&
      receipt.runId === run?.run_id &&
      receipt.operationId
        ? [receipt.operationId]
        : []),
    ]),
  ];
  const currentOperation = inspected ? operations[inspected] : null;
  const retry =
    receipt?.kind === "advance" &&
    receipt.runId === run?.run_id &&
    receipt.operationId === inspected &&
    currentOperation?.retry_policy === "same_request_after_status_read" &&
    ["failed", "blocked"].includes(currentOperation.state);
  const mutationReady =
    storage.ready && !storage.error && !receipt && !busy && !navigating;

  return (
    <>
      <div className={styles.heading}>
        <div>
          <h1>Ejecuciones</h1>
          <p className={styles.secondary}>
            Del contenido publicado a una oportunidad con evidencia.
          </p>
        </div>
        <div className={styles.toolbar}>
          <button
            className={styles.secondaryButton}
            onClick={refresh}
            disabled={!!busy}
          >
            Actualizar estado
          </button>
          <button
            className={styles.primaryButton}
            onClick={create}
            disabled={!mutationReady || !list.ok || listStale}
            aria-describedby="create-help"
          >
            Crear ejecución
          </button>
        </div>
      </div>
      <p id="create-help" className={styles.help}>
        Crear guarda una ejecución. La recolección se solicita después, paso a
        paso.
        {!list.ok
          ? " Primero debe estar disponible la consulta de ejecuciones."
          : ""}
      </p>
      <div className={styles.scope} aria-label="Alcance previsto del radar">
        <p>
          <span>Corpus previsto</span>
          <strong>11 canales de YouTube</strong>
        </p>
        <p>
          <span>Publicaciones</span>
          <strong>IA · hasta 3 minutos</strong>
        </p>
        <p>
          <span>Comparación</span>
          <strong>7 días frente a los 7 anteriores</strong>
        </p>
        <p>
          <span>Corte de cada día</span>
          <strong>America/Bogota · UTC−5</strong>
        </p>
      </div>
      <p role="status" aria-live="polite" className={styles.live}>
        {busy ?? (navigating ? "Abriendo la ejecución guardada…" : message)}
      </p>
      {notice ? <Feedback notice={notice} /> : null}
      {storage.error ? (
        <p className={styles.warning} role="alert">
          No se pudo recuperar el registro local de solicitudes. Puedes
          consultar resultados; las nuevas solicitudes quedan detenidas para no
          perder su identidad.
        </p>
      ) : null}
      {receipt ? (
        <div className={styles.notice}>
          <strong>Solicitud pendiente de confirmar</strong>
          <p>
            Conserva su identidad y consulta el estado. No se volverá a enviar
            automáticamente.
          </p>
          {receipt.kind !== "create" ? (
            <Link
              href={`/?run=${encodeURIComponent(receipt.runId)}`}
              prefetch={false}
            >
              Abrir la ejecución de esta solicitud
            </Link>
          ) : (
            <p>
              Actualiza las ejecuciones guardadas antes de intentar otra
              creación. Si la respuesta no se puede recuperar, requiere
              conciliación.
            </p>
          )}
          <p className={styles.secondary}>
            Solicitada el {dateLabel(receipt.createdAt)}, hora de Colombia.
          </p>
        </div>
      ) : null}

      <section className={styles.history} aria-labelledby="history-title">
        <h2 id="history-title">Ejecuciones guardadas</h2>
        {!list.ok ? (
          <Feedback notice={list.error} />
        ) : (
          <>
            {listStale ? (
              <p className={styles.warning}>
                Listado anterior conservado. Actualiza antes de cargar otra
                página.
              </p>
            ) : null}
            {list.value.items.length === 0 ? (
              <p className={styles.secondary}>
                Todavía no hay ejecuciones guardadas. Crea una para reunir las
                publicaciones de ambas semanas.
              </p>
            ) : (
              <ul className={styles.runList}>
                {list.value.items.map((item) => (
                  <li key={item.run_id}>
                    <div>
                      <strong>{dateLabel(item.started_at)}</strong>
                      <span>
                        {phaseLabel(item.current_stage)} ·{" "}
                        {stageLabels[item.workflow.state]}
                      </span>
                    </div>
                    {item.run_id === selectedId ? (
                      <span className={styles.selected}>Seleccionada</span>
                    ) : (
                      <Link
                        href={`/?run=${encodeURIComponent(item.run_id)}`}
                        prefetch={false}
                      >
                        Abrir ejecución
                        <span className={styles.srOnly}>
                          {" "}
                          del {dateLabel(item.started_at)} · {item.run_id}
                        </span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.secondary}>
              Consulta recibida: {dateLabel(list.value.meta.served_at)}, hora de
              Colombia.
            </p>
            {list.value.next_cursor ? (
              <button
                className={styles.secondaryButton}
                onClick={more}
                disabled={!!busy || listStale}
              >
                Ver más ejecuciones
              </button>
            ) : null}
          </>
        )}
      </section>

      {snapshot && !snapshot.run.ok ? (
        <Feedback
          notice={snapshot.run.error}
          title="No se pudo recuperar la ejecución seleccionada"
        />
      ) : null}
      {run ? (
        <>
          <RunContext run={run} previous={true} stale={stale} />
          <GroupPanel
            run={run}
            disabled={!!busy || stale || navigating}
            refreshContext={async () => {
              setStale(true);
              await refreshRun();
            }}
          />
          <ComparisonPanel
            run={run}
            disabled={!!busy || stale || navigating}
            refreshContext={async () => {
              setStale(true);
              await refreshRun();
            }}
          />
          <PublicationsPanel
            run={run}
            disabled={!!busy || stale || navigating}
            refreshContext={async () => {
              setStale(true);
              await refreshRun();
            }}
          />
          <section className={styles.advance} aria-labelledby="advance-title">
            <div>
              <h2 id="advance-title">Continuar desde el último paso</h2>
              <p className={styles.secondary}>
                Consultar o recargar no inicia análisis. No se garantiza trabajo
                activo cuando cierres el navegador.
              </p>
            </div>
            <button
              className={styles.primaryButton}
              onClick={() => advance()}
              disabled={!mutationReady || stale || !canAdvance(run)}
              aria-describedby="advance-help"
            >
              Solicitar siguiente paso
            </button>
            <p id="advance-help" className={styles.help}>
              {stale
                ? "Actualiza el estado antes de continuar."
                : receipt
                  ? "Hay una solicitud sin confirmar; consulta su estado."
                  : !canAdvance(run)
                    ? "No hay un avance de recolección autorizado en el estado recibido. Revisa la etapa y las operaciones pendientes."
                    : "Solicita una sola unidad de recolección o clasificación. El servidor verifica el estado y el gasto antes de ejecutarla."}
            </p>
            <p className={styles.secondary}>
              Control de gasto:{" "}
              {
                {
                  check_required: "pendiente de verificar",
                  allowed: "disponible según la última lectura",
                  blocked: "bloqueado",
                  uncertain: "incierto",
                }[run.budget.state]
              }
              .{run.budget.reason ? ` ${run.budget.reason}` : ""}
            </p>
            <details className={styles.technical}>
              <summary>Importes informados</summary>
              <p>
                Límite incremental: {run.budget.incremental_limit} USD. Cargos
                confirmados:{" "}
                {run.budget.confirmed_new_charges ?? "no determinados"}.
                Reservas: {run.budget.reserved ?? "no determinadas"}. Disponible
                para nuevas llamadas:{" "}
                {run.budget.available_for_new_calls ?? "no determinado"}. No
                incluye el abono Vercel existente.
              </p>
            </details>
          </section>
          {operationIds.length ? (
            <section
              className={styles.operations}
              aria-labelledby="operations-title"
            >
              <h2 id="operations-title">Operaciones para revisar</h2>
              <p className={styles.secondary}>
                Se recuperan desde la ejecución, incluso sin un paso confirmado
                o después de perder una respuesta.
              </p>
              <ul>
                {operationIds.map((id) => {
                  const reference = references.find(
                    (item) => item.operation_id === id,
                  );
                  return (
                    <li key={id}>
                      <div className={styles.sectionHeading}>
                        <strong>
                          {reference
                            ? `${phaseLabel(reference.stage)} · ${{ running: "En proceso", uncertain: "Resultado incierto", failed: "Error", blocked: "Bloqueado" }[reference.state]}`
                            : "Operación de la solicitud"}
                        </strong>
                        <button
                          className={styles.secondaryButton}
                          disabled={!!busy}
                          onClick={() => inspect(id)}
                        >
                          Consultar operación
                          <span className={styles.srOnly}> {id}</span>
                        </button>
                      </div>
                      {reference?.analysis_id ? (
                        <p className={styles.secondary}>
                          Pieza seleccionada:{" "}
                          <code>{reference.analysis_id}</code>. Su estado es
                          independiente de la cobertura temática.
                        </p>
                      ) : null}
                      {operations[id] ? (
                        <OperationView operation={operations[id]} />
                      ) : (
                        <p className={styles.secondary}>
                          Referencia: <code>{id}</code>. Consulta su detalle
                          para revisar el estado.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {retry ? (
                <button
                  className={styles.secondaryButton}
                  onClick={() => advance(receipt)}
                  disabled={!!busy}
                >
                  Reenviar la misma solicitud
                </button>
              ) : null}
            </section>
          ) : null}
          {snapshot ? (
            <CoverageView run={run} result={snapshot.coverage} />
          ) : null}
          {snapshot &&
          !snapshot.coverage.ok &&
          retainedCoverage?.run.ok &&
          retainedCoverage.coverage.ok ? (
            <details className={styles.retained}>
              <summary>
                Última cobertura recibida · revisión{" "}
                {retainedCoverage.run.value.data.revision}
              </summary>
              <p className={styles.warning}>
                Lectura anterior conservada. No describe necesariamente el
                estado actual.
              </p>
              <CoverageView
                run={retainedCoverage.run.value.data}
                result={retainedCoverage.coverage}
              />
            </details>
          ) : null}
        </>
      ) : null}

      {!run ? (
        <section
          id="publicaciones"
          className={styles.context}
          aria-labelledby="publications-empty-title"
        >
          <h2 id="publications-empty-title">Publicaciones elegibles</h2>
          <p className={styles.secondary}>
            Selecciona una ejecución guardada para consultar sus publicaciones.
            El catálogo no requiere grupos confirmados ni comparación temática
            disponible.
          </p>
        </section>
      ) : null}
      {!run ? (
        <section
          id="comparacion"
          className={styles.context}
          aria-labelledby="comparison-empty-title"
        >
          <h2 id="comparison-empty-title">Comparación temática</h2>
          <p className={styles.secondary}>
            Selecciona una ejecución guardada para consultar sus grupos y su
            comparación. Sin una ejecución no se presumen conteos ni resultados.
          </p>
        </section>
      ) : null}
      <details className={styles.sources}>
        <summary>Ver los 11 canales previstos</summary>
        <p className={styles.secondary}>
          Fuentes configuradas; no acredita que se hayan consultado.
        </p>
        <ul>
          {expectedCorpus.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {sourceLabel(url)}
                <span className={styles.srOnly}> (abre en otra pestaña)</span>
              </a>
            </li>
          ))}
        </ul>
      </details>
      <p className={styles.interpretation}>
        Más publicaciones no significa más valor. La señal temática y la
        utilidad se revisan por separado.
      </p>
    </>
  );
}
