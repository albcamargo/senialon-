"use client";

import { useRef, useState } from "react";
import {
  morePublicationsAction,
  moreSelectionsAction,
  readCatalogAction,
  readPublicationAction,
  readSelectionAction,
  selectPublicationAction,
} from "@/app/publication-actions";
import type { Schema } from "@/lib/api/types";
import {
  mergePublications,
  mergeSelections,
} from "@/lib/publications/presentation";
import type {
  CatalogSnapshot,
  PublicationSnapshot,
  SelectionResult,
} from "@/lib/publications/types";
import {
  clearReceipt,
  readReceipt,
  saveReceipt,
  type CommandReceipt,
} from "@/lib/runs/command";
import { changedReceipt, useReceipt } from "@/lib/runs/use-receipt";
import { connectionNotice, type Notice } from "@/lib/runs/types";
import { dateLabel, stageLabels } from "@/lib/runs/presentation";
import { Feedback } from "@/components/runs/run-detail";
import shared from "@/components/runs/runs.module.css";
import {
  CatalogView,
  PublicationPreview,
  SavedSelectionView,
} from "./publication-view";
import styles from "./publications.module.css";

type Receipt = Extract<CommandReceipt, { kind: "select_analysis" }>;
const rejections = new Set([
  "AUTH_REQUIRED",
  "ORIGIN_FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "VERSION_CONFLICT",
  "NOT_ELIGIBLE",
]);

export function PublicationsPanel({
  run,
  disabled,
  refreshContext,
}: {
  run: Schema<"Run">;
  disabled: boolean;
  refreshContext: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [preview, setPreview] = useState<PublicationSnapshot | null>(null);
  const [selection, setSelection] = useState<SelectionResult | null>(null);
  const [viewStale, setViewStale] = useState(false);
  const [previewStale, setPreviewStale] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [inspectedKey, setInspectedKey] = useState<string | null>(null);
  const storage = useReceipt();
  const lock = useRef(false);
  const pending =
    storage.receipt?.kind === "select_analysis" &&
    storage.receipt.runId === run.run_id
      ? storage.receipt
      : null;
  const stale =
    viewStale || (!!snapshot && snapshot.run.revision !== run.revision);
  const detailStale =
    previewStale || (!!preview && preview.run.revision !== run.revision);
  const analyses = snapshot?.analyses.ok ? snapshot.analyses.value : null;
  const existing = analyses?.items.find(
    (item) => item.video_id === preview?.publication.video_id,
  );
  const mutationReady =
    storage.ready &&
    !storage.error &&
    !storage.receipt &&
    !busy &&
    !disabled &&
    !stale &&
    !detailStale &&
    !!preview &&
    preview.publication.eligibility === "eligible" &&
    preview.run.allowed_actions.includes("select_analysis");
  const retry =
    !!pending &&
    !!snapshot &&
    !!analyses &&
    !stale &&
    inspectedKey === pending.key &&
    analyses.next_cursor === null &&
    snapshot.run.revision === pending.revision &&
    snapshot.run.allowed_actions.includes("select_analysis") &&
    !analyses.items.some((item) => item.video_id === pending.videoId);

  function forget(key: string) {
    clearReceipt(key);
    changedReceipt();
  }
  function remember(command: Receipt) {
    saveReceipt(command);
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
      setViewStale(true);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  async function recover(page: Schema<"AnalysesResponse">) {
    const command = readReceipt();
    if (command?.kind !== "select_analysis" || command.runId !== run.run_id)
      return;
    const found = page.items.find((item) => item.video_id === command.videoId);
    if (found) {
      const result = await readSelectionAction(
        run.run_id,
        found.analysis_id,
        found.video_id,
      );
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      setSelection(result.value);
      forget(command.key);
      setMessage(
        "Selección recuperada desde el servidor. No se volvió a enviar la solicitud ni se inició análisis.",
      );
    } else {
      setInspectedKey(command.key);
      setMessage(
        page.next_cursor
          ? "La selección pendiente no aparece en esta página. Consulta las siguientes selecciones guardadas; no se reenviará automáticamente."
          : "La selección pendiente no aparece en el listado recibido. Solo se permite reenviar la misma selección si la revisión sigue vigente; en otro caso requiere conciliación.",
      );
    }
  }

  async function fetchCatalog() {
    const result = await readCatalogAction(run.run_id);
    if (!result.ok) {
      setNotice(result.error);
      setViewStale(true);
      return null;
    }
    setSnapshot(result.value);
    setViewStale(false);
    return result.value;
  }
  async function load() {
    await perform("Consultando publicaciones…", async () => {
      setInspectedKey(null);
      const fresh = await fetchCatalog();
      if (!fresh) return;
      setMessage(
        "Publicaciones y selecciones consultadas. Esta lectura no solicita análisis.",
      );
      if (fresh.analyses.ok) await recover(fresh.analyses.value);
      await refreshContext();
    });
  }
  async function morePublications() {
    if (!snapshot?.publications.next_cursor || stale) return;
    const current = snapshot;
    await perform("Consultando más publicaciones…", async () => {
      const next = await morePublicationsAction(
        run.run_id,
        current.publications.next_cursor!,
      );
      if (!next.ok) {
        setNotice(next.error);
        setViewStale(true);
        return;
      }
      setSnapshot({
        ...current,
        publications: mergePublications(current.publications, next.value),
      });
    });
  }
  async function moreSelections() {
    if (!snapshot || !analyses?.next_cursor || stale) return;
    const current = snapshot;
    const previous = analyses;
    await perform("Consultando más selecciones guardadas…", async () => {
      const next = await moreSelectionsAction(
        run.run_id,
        previous.next_cursor!,
      );
      if (!next.ok) {
        setNotice(next.error);
        setViewStale(true);
        return;
      }
      const page = mergeSelections(previous, next.value.page);
      setSnapshot({ ...current, analyses: { ok: true, value: page } });
      await recover(page);
    });
  }
  async function inspect(videoId: string) {
    await perform("Consultando publicación…", async () => {
      const result = await readPublicationAction(run.run_id, videoId);
      if (!result.ok) {
        setNotice(result.error);
        setPreviewStale(true);
        return;
      }
      setPreview(result.value);
      setPreviewStale(false);
      setMessage(
        "Publicación consultada. Inspeccionarla no la selecciona ni inicia análisis.",
      );
      await refreshContext();
    });
  }
  async function openSelection(reference: Schema<"AnalysisRef">) {
    await perform("Consultando selección guardada…", async () => {
      const result = await readSelectionAction(
        run.run_id,
        reference.analysis_id,
        reference.video_id,
      );
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      setSelection(result.value);
      const command = readReceipt();
      if (
        command?.kind === "select_analysis" &&
        command.runId === run.run_id &&
        command.videoId === reference.video_id
      )
        forget(command.key);
      setMessage("Selección consultada sin solicitar trabajo de análisis.");
    });
  }
  async function select(command?: Receipt) {
    if (!command && existing) {
      await openSelection(existing);
      return;
    }
    if (!command && !preview) return;
    await perform(
      command ? "Reenviando la misma selección…" : "Guardando selección…",
      async () => {
        if (
          command
            ? !retry || readReceipt()?.key !== command.key
            : !mutationReady || readReceipt()
        )
          return;
        const delivery: Receipt = command ?? {
          version: 1,
          kind: "select_analysis",
          key: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          operationId: null,
          runId: run.run_id,
          revision: preview!.run.revision,
          videoId: preview!.publication.video_id,
        };
        remember(delivery);
        setInspectedKey(null);
        const result = await selectPublicationAction(
          delivery.runId,
          delivery.videoId,
          delivery.revision,
          delivery.key,
        );
        if (!result.ok) {
          if (rejections.has(result.error.code)) forget(delivery.key);
          setNotice(result.error);
          setViewStale(true);
          await refreshContext();
          return;
        }
        setSelection(result.value);
        forget(delivery.key);
        setPreviewStale(true);
        await Promise.all([fetchCatalog(), refreshContext()]);
        setMessage(
          "Selección guardada por el servidor. No se solicitó análisis profundo ni revisión editorial.",
        );
      },
    );
  }

  return (
    <section
      id="publicaciones"
      className={styles.panel}
      aria-labelledby="publications-title"
    >
      <div className={shared.sectionHeading}>
        <h2 id="publications-title">Publicaciones elegibles</h2>
        <button
          className={shared.secondaryButton}
          onClick={load}
          disabled={!!busy || disabled}
        >
          Consultar publicaciones
        </button>
      </div>
      <p className={shared.secondary}>
        Elige cualquier pieza disponible para analizarla después, aunque su tema
        no aumente o la comparación esté pendiente.
      </p>
      <p role="status" aria-live="polite" className={styles.live}>
        {busy ?? message}
      </p>
      {notice ? (
        <Feedback
          notice={notice}
          title="No se pudo confirmar la consulta o selección"
        />
      ) : null}
      {snapshot ? (
        <>
          <CatalogView
            run={snapshot.run}
            page={snapshot.publications}
            stale={stale}
            busy={!!busy || disabled}
            onInspect={inspect}
          />
          {snapshot.publications.next_cursor ? (
            <button
              className={shared.secondaryButton}
              disabled={!!busy || disabled || stale}
              onClick={morePublications}
            >
              Ver más publicaciones
            </button>
          ) : null}
          <details className={styles.details}>
            <summary>Ventanas y contexto del catálogo</summary>
            <p>America/Bogota · se excluye el día en curso.</p>
            <p>
              Semana anterior: desde{" "}
              {dateLabel(snapshot.run.windows.previous.start_inclusive)}{" "}
              inclusive hasta{" "}
              {dateLabel(snapshot.run.windows.previous.end_exclusive)}{" "}
              exclusivo.
            </p>
            <p>
              Semana reciente: desde{" "}
              {dateLabel(snapshot.run.windows.recent.start_inclusive)} inclusive
              hasta {dateLabel(snapshot.run.windows.recent.end_exclusive)}{" "}
              exclusivo.
            </p>
            <p>
              La paginación informa lo cargado; consulta la cobertura de
              adquisición y clasificación para conocer los faltantes de los 11
              canales previstos.
            </p>
            <p>
              Ejecución <code>{snapshot.run.run_id}</code> · revisión{" "}
              {snapshot.run.revision}.
            </p>
          </details>
          {!snapshot.analyses.ok ? (
            <Feedback
              notice={snapshot.analyses.error}
              title="No se pudieron recuperar las selecciones guardadas; el catálogo disponible se conserva"
            />
          ) : null}
          {analyses ? (
            <details
              className={styles.details}
              open={pending ? true : undefined}
            >
              <summary>
                Selecciones guardadas · {analyses.items.length} cargadas
                {analyses.next_cursor ? " · quedan páginas" : ""}
              </summary>
              {analyses.items.length ? (
                <ul className={styles.savedList}>
                  {analyses.items.map((item) => (
                    <li key={item.analysis_id}>
                      <div>
                        <strong>
                          {snapshot.publications.items.find(
                            (publication) =>
                              publication.video_id === item.video_id,
                          )?.title ?? item.video_id}
                        </strong>
                        <p className={styles.metadata}>
                          Versión {item.analysis_version} ·{" "}
                          {stageLabels[item.audiovisual.state]} ·{" "}
                          {dateLabel(item.created_at)}
                        </p>
                      </div>
                      <button
                        className={shared.secondaryButton}
                        onClick={() => openSelection(item)}
                        disabled={!!busy || disabled}
                      >
                        Consultar selección
                        <span className={shared.srOnly}> {item.video_id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No hay selecciones en la página recibida.
                  {analyses.next_cursor
                    ? " Consulta las páginas restantes."
                    : ""}
                </p>
              )}
              {analyses.next_cursor ? (
                <button
                  className={shared.secondaryButton}
                  disabled={!!busy || disabled || stale}
                  onClick={moreSelections}
                >
                  Ver más selecciones guardadas
                </button>
              ) : (
                <p className={styles.context}>
                  Fin del listado de selecciones recibido.
                </p>
              )}
            </details>
          ) : null}
        </>
      ) : (
        <p className={styles.empty}>
          Consulta las publicaciones de esta ejecución. Se recupera el material
          elegible guardado; no se recolectan ni analizan videos desde esta
          lectura.
        </p>
      )}
      {preview ? (
        <>
          <PublicationPreview snapshot={preview} stale={detailStale} />
          <button
            className={shared.primaryButton}
            onClick={() => select()}
            disabled={existing ? !!busy || disabled : !mutationReady}
            aria-describedby="publication-select-help"
          >
            {existing
              ? "Consultar selección guardada"
              : "Seleccionar para análisis"}
          </button>
          <p id="publication-select-help" className={shared.help}>
            {existing
              ? "Esta pieza ya tiene selección; se consulta la misma identidad sin reprocesarla."
              : detailStale || stale
                ? "Actualiza el catálogo e inspecciona la publicación antes de seleccionar."
                : preview.publication.eligibility !== "eligible"
                  ? "Solo se pueden seleccionar publicaciones con elegibilidad confirmada."
                  : !preview.run.allowed_actions.includes("select_analysis")
                    ? "El servidor no autoriza una nueva selección en el estado recibido. Revisa las operaciones pendientes."
                    : "Esta acción guarda la selección. No inicia el análisis audiovisual ni consume inferencias; el avance se solicita por separado."}
          </p>
        </>
      ) : null}
      {storage.error ? (
        <p className={shared.warning} role="alert">
          No se pudo recuperar el registro local de solicitudes. Puedes
          consultar resultados; las nuevas selecciones quedan detenidas para
          conservar su identidad.
        </p>
      ) : null}
      {pending ? (
        <p className={shared.warning}>
          Hay una selección pendiente de confirmar para la publicación{" "}
          <code>{pending.videoId}</code>. Consulta las selecciones guardadas
          antes de reenviar; no se repite automáticamente.
        </p>
      ) : storage.receipt ? (
        <p className={shared.warning}>
          Hay otra solicitud sin confirmar. Resuélvela en su ejecución antes de
          guardar una selección nueva.
        </p>
      ) : null}
      {retry && pending ? (
        <button
          className={shared.secondaryButton}
          disabled={!!busy || disabled || storage.error}
          onClick={() => select(pending)}
        >
          Reenviar la misma selección
        </button>
      ) : null}
      {selection ? <SavedSelectionView result={selection} /> : null}
    </section>
  );
}
