"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { readReviewAction, recordReviewAction } from "@/app/review-actions";
import type { Schema } from "@/lib/api/types";
import type { AnalysisSnapshot } from "@/lib/analysis/types";
import {
  analysisPath,
  evidenceAnchor,
  evidenceReviewLabels,
  reviewLabels,
} from "@/lib/analysis/presentation";
import {
  canRecordReview,
  isReviewRequest,
  reviewRequest,
  sameReviewInput,
} from "@/lib/analysis/review";
import {
  clearReceipt,
  readReceipt,
  saveReceipt,
  type CommandReceipt,
} from "@/lib/runs/command";
import { changedReceipt, useReceipt } from "@/lib/runs/use-receipt";
import { connectionNotice, type Notice } from "@/lib/runs/types";
import { dateLabel } from "@/lib/runs/presentation";
import { Feedback } from "@/components/runs/run-detail";
import shared from "@/components/runs/runs.module.css";
import styles from "./review.module.css";

type Receipt = Extract<CommandReceipt, { kind: "record_review" }>;
type Input = Schema<"ReviewRequest">;
const decisions = [
  "pending_review",
  "consider_for_adaptation",
  "discarded",
] as const;
const evidenceStates = [
  "pending_review",
  "verified_against_source",
  "disputed",
  "insufficient_to_verify",
] as const;
const definitive = new Set([
  "AUTH_REQUIRED",
  "ORIGIN_FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "VERSION_CONFLICT",
  "NOT_ELIGIBLE",
]);
function unchangedDraft(input: Input, saved: Schema<"EditorialReview">) {
  return (
    input.expected_review_revision === saved.revision &&
    sameReviewInput(input, { ...saved, reason: saved.reason ?? "" })
  );
}
function inputErrors(input: Input): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.reason.trim())
    errors["review-reason"] =
      "Escribe el motivo de esta decisión, también si vuelve a pendiente.";
  input.evidence_reviews.forEach((item, index) => {
    if (
      (item.state !== "pending_review" && !item.note?.trim()) ||
      (item.note !== null && !item.note.trim())
    )
      errors[`review-note-${index}`] =
        "Describe el contraste o la limitación que respalda este estado.";
  });
  return errors;
}

export function EditorialReview({
  snapshot,
  pinned,
  stale,
  busy,
  perform,
  onSnapshot,
  onConfirmed,
  onDraftChange,
}: {
  snapshot: AnalysisSnapshot;
  pinned: boolean;
  stale: boolean;
  busy: boolean;
  perform: (label: string, work: () => Promise<void>) => Promise<void>;
  onSnapshot: (value: AnalysisSnapshot) => void;
  onConfirmed: (review: Schema<"EditorialReview">) => void;
  onDraftChange: (dirty: boolean) => void;
}) {
  const data = snapshot.response.data,
    saved = data.review;
  const [draft, setDraft] = useState(() => reviewRequest(saved));
  const [baseReviewId, setBaseReviewId] = useState(saved.review_id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [message, setMessage] = useState("");
  const [needsRead, setNeedsRead] = useState(false);
  const [checked, setChecked] = useState<{
    key: string;
    state: "unchanged" | "conflict";
  } | null>(null);
  const storage = useReceipt();
  const pending =
    storage.receipt?.kind === "record_review" &&
    storage.receipt.runId === data.run_id &&
    storage.receipt.analysisId === data.analysis_id
      ? storage.receipt
      : null;
  const input = pending?.request ?? draft;
  const reviewId = pending?.reviewId ?? baseReviewId;
  const different =
    input.expected_analysis_version !== data.analysis_version ||
    input.expected_review_revision !== saved.revision ||
    reviewId !== saved.review_id;
  const editable =
    !pinned && !busy && storage.ready && !storage.error && !storage.receipt;
  const ready =
    editable && !stale && !needsRead && !different && canRecordReview(snapshot);
  const retry =
    !pinned &&
    !stale &&
    !needsRead &&
    !busy &&
    !!pending &&
    checked?.key === pending.key &&
    checked.state === "unchanged" &&
    !different &&
    canRecordReview(snapshot);
  const canClose =
    !!pending &&
    !busy &&
    checked?.key === pending.key &&
    checked.state === "conflict";

  function remember(command: Receipt) {
    saveReceipt(command);
    changedReceipt();
  }
  function forget(key: string) {
    clearReceipt(key);
    changedReceipt();
  }
  function edit(next: Input) {
    setDraft(next);
    setErrors({});
    setNotice(null);
    setMessage("");
    onDraftChange(
      !unchangedDraft(next, saved) || baseReviewId !== saved.review_id,
    );
  }
  function adoptSaved() {
    if (storage.receipt || busy || pinned || stale || needsRead) return;
    setDraft(reviewRequest(saved));
    setBaseReviewId(saved.review_id);
    setErrors({});
    setNotice(null);
    setMessage(
      "Revisión guardada cargada en el formulario. No se ha enviado ningún cambio.",
    );
    onDraftChange(false);
  }
  function confirmed(
    command: Receipt,
    review: Schema<"EditorialReview">,
    recovered: boolean,
  ) {
    setDraft(reviewRequest(review));
    setBaseReviewId(review.review_id);
    setErrors({});
    setChecked(null);
    setNeedsRead(false);
    onConfirmed(review);
    onDraftChange(false);
    forget(command.key);
    setMessage(
      recovered
        ? "Revisión recuperada del servidor. La decisión y la evidencia coinciden con la solicitud; no se repitió el guardado."
        : "Decisión guardada. El servidor confirmó el motivo y la revisión de evidencia para esta versión exacta.",
    );
  }
  async function refresh(command: Receipt | null = pending) {
    const current = await readReviewAction(
      data.run_id,
      data.analysis_id,
      pinned ? data.analysis_version : undefined,
    );
    if (!current.ok) {
      setNotice(current.error);
      setNeedsRead(true);
      return;
    }
    setNeedsRead(false);
    onSnapshot(current.value);
    if (!command) {
      setMessage(
        "Revisión consultada del servidor. El borrador se conserva; cargarla en el formulario es una acción aparte.",
      );
      return;
    }
    const target =
      current.value.response.data.analysis_version ===
      command.request.expected_analysis_version
        ? current
        : await readReviewAction(
            data.run_id,
            data.analysis_id,
            command.request.expected_analysis_version,
          );
    if (!target.ok) {
      setNotice(target.error);
      return;
    }
    const review = target.value.response.data.review;
    const ids = new Set(
      target.value.response.data.evidence.map((item) => item.evidence_id),
    );
    if (
      review.review_id !== command.reviewId ||
      target.value.response.data.publication.video_id !== command.videoId ||
      ids.size !== command.request.evidence_reviews.length ||
      command.request.evidence_reviews.some(
        (item) => !ids.has(item.evidence_id),
      )
    ) {
      setNotice({
        ...connectionNotice,
        code: "STALE_DATA",
        message:
          "La revisión recibida tiene otra identidad o evidencia. Se conserva el borrador para conciliación.",
      });
      setNeedsRead(true);
      return;
    }
    if (
      review.revision === command.request.expected_review_revision + 1 &&
      sameReviewInput(command.request, review)
    ) {
      // Do not splice a historical review into the current analysis.
      if (
        review.analysis_version === current.value.response.data.analysis_version
      ) {
        confirmed(command, review, true);
        onSnapshot(current.value);
      } else {
        setDraft(command.request);
        setBaseReviewId(command.reviewId);
        onDraftChange(true);
        forget(command.key);
        setMessage(
          "La revisión solicitada está guardada y se recuperó sin reenviarla. La ficha consultada corresponde a otra versión; su revisión permanece independiente.",
        );
      }
      return;
    }
    const sameBase =
      review.revision === command.request.expected_review_revision &&
      review.analysis_version === current.value.latestVersion &&
      canRecordReview(current.value);
    setChecked({
      key: command.key,
      state: sameBase ? "unchanged" : "conflict",
    });
    setMessage(
      sameBase
        ? "La consulta aún conserva la revisión original. Puedes reenviar manualmente la misma solicitud, con su cuerpo y clave originales."
        : "El servidor conserva otra revisión o una versión posterior. Este borrador no se confirmó como guardado y no sobrescribirá ese resultado.",
    );
  }
  async function consult() {
    await perform("Consultando revisión editorial…", async () => {
      setNotice(null);
      setMessage("");
      setChecked(null);
      await refresh();
    });
  }
  function closeAttempt() {
    if (!pending || !canClose || readReceipt()?.key !== pending.key) return;
    setDraft(pending.request);
    setBaseReviewId(pending.reviewId);
    onDraftChange(true);
    forget(pending.key);
    setChecked(null);
    setMessage(
      "Intento local cerrado sin escribir en el servidor. El borrador original sigue visible; carga la revisión guardada para preparar otro cambio.",
    );
  }
  async function submit(
    event?: FormEvent<HTMLFormElement>,
    repeated?: Receipt,
  ) {
    event?.preventDefault();
    const issues = inputErrors(input);
    setErrors(issues);
    if (Object.keys(issues).length) {
      const field = document.getElementById(Object.keys(issues)[0]);
      const details = field?.closest("details");
      if (details) details.open = true;
      field?.focus();
      return;
    }
    if (repeated ? !retry : !ready) return;
    if (!isReviewRequest(input)) {
      setNotice({
        ...connectionNotice,
        code: "VALIDATION_ERROR",
        message:
          "Revisa la decisión y las notas de evidencia antes de guardar.",
      });
      return;
    }
    await perform(
      repeated
        ? "Reenviando el mismo guardado editorial…"
        : "Guardando decisión editorial…",
      async () => {
        setNotice(null);
        setMessage("");
        setChecked(null);
        if (repeated ? readReceipt()?.key !== repeated.key : readReceipt())
          return;
        const command: Receipt = repeated ?? {
          version: 1,
          kind: "record_review",
          key: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          operationId: null,
          runId: data.run_id,
          revision: snapshot.run.revision,
          analysisId: data.analysis_id,
          videoId: data.publication.video_id,
          reviewId: baseReviewId,
          request: structuredClone(draft),
        };
        remember(command);
        const result = await recordReviewAction(
          command.runId,
          command.analysisId,
          command.reviewId,
          command.request,
          command.key,
        );
        if (!result.ok) {
          if (definitive.has(result.error.code)) forget(command.key);
          setNeedsRead(true);
          setNotice(result.error);
          setMessage(
            "El borrador se conserva. Consulta la revisión guardada antes de preparar otro envío; no se ha anunciado un guardado confirmado.",
          );
          return;
        }
        confirmed(command, result.value.data, false);
        const latest = await readReviewAction(data.run_id, data.analysis_id);
        if (latest.ok) onSnapshot(latest.value);
        else {
          setNotice(latest.error);
          setMessage(
            "Decisión guardada por el servidor. No se pudo actualizar la ficha después; consulta su estado antes de otro cambio.",
          );
        }
      },
    );
  }

  const disabledReason = pinned
    ? "Esta URL fija una versión de solo lectura. Abre la versión actual para registrar una decisión."
    : storage.error
      ? "No se puede recuperar el registro local. Se conservan las consultas; el guardado está detenido."
      : pending
        ? "Hay un guardado editorial pendiente de confirmar. El formulario conserva exactamente lo enviado; consulta antes de reenviar."
        : storage.receipt
          ? "Hay otra solicitud pendiente de confirmar. Resuélvela antes de guardar esta revisión."
          : stale || needsRead
            ? "Consulta la revisión guardada antes de enviar otro cambio."
            : different
              ? "El borrador pertenece a otra versión o revisión. Su texto sigue visible; consulta el resultado y carga la revisión guardada para preparar un cambio nuevo."
              : !canRecordReview(snapshot)
                ? "El estado recibido no permite registrar una revisión ahora. Consulta la ficha y sus operaciones pendientes."
                : "La decisión, el motivo y las notas se guardan juntos para la versión indicada. Guardar esta revisión no solicita análisis ni consumo de proveedores.";

  return (
    <section
      id="revision-editorial"
      className={styles.section}
      aria-labelledby="editorial-review-title"
    >
      <div className={styles.heading}>
        <h2 id="editorial-review-title">Revisión editorial</h2>
        <button
          className={shared.secondaryButton}
          onClick={consult}
          disabled={busy}
        >
          Consultar revisión guardada
        </button>
      </div>
      <p className={styles.saved}>
        <strong>Estado guardado: {reviewLabels[saved.decision]}.</strong>
      </p>
      <p>
        Versión del análisis {saved.analysis_version} · revisión editorial{" "}
        {saved.revision} · {dateLabel(saved.updated_at)}, hora de Colombia.
      </p>
      {saved.reason ? (
        <p>Motivo guardado: {saved.reason}</p>
      ) : (
        <p className={styles.secondary}>
          Aún no hay un motivo editorial guardado.
        </p>
      )}
      <p className={styles.secondary}>
        Acceso con credencial compartida; el registro corresponde al operador de
        demo y no identifica una persona individual.
      </p>
      <p id="review-help" className={styles.help}>
        {disabledReason}
      </p>
      <p role="status" aria-live="polite" className={styles.live}>
        {message}
      </p>
      {notice ? (
        <Feedback
          notice={notice}
          title="No se pudo confirmar o actualizar la revisión editorial"
        />
      ) : null}
      {canClose ? (
        <button className={shared.secondaryButton} onClick={closeAttempt}>
          Cerrar intento sin sobrescribir la revisión
        </button>
      ) : null}
      <form
        onSubmit={(event) => submit(event)}
        noValidate
        aria-describedby="review-help"
      >
        <p className={styles.context}>
          Borrador para análisis versión {input.expected_analysis_version} ·
          revisión de partida {input.expected_review_revision}.
        </p>
        <fieldset disabled={!editable} className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="review-decision">Decisión editorial</label>
            <select
              id="review-decision"
              value={input.decision}
              onChange={(event) => {
                const decision = decisions.find(
                  (value) => value === event.currentTarget.value,
                );
                if (decision) edit({ ...draft, decision });
              }}
            >
              {decisions.map((value) => (
                <option key={value} value={value}>
                  {reviewLabels[value]}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="review-reason">
              Motivo de la decisión{" "}
              <span className={styles.secondary}>(obligatorio)</span>
            </label>
            <textarea
              id="review-reason"
              value={input.reason}
              rows={4}
              required
              aria-invalid={!!errors["review-reason"]}
              aria-describedby={
                errors["review-reason"]
                  ? "review-reason-help review-reason-error"
                  : "review-reason-help"
              }
              onChange={(event) =>
                edit({ ...draft, reason: event.currentTarget.value })
              }
            />
            <p id="review-reason-help" className={styles.secondary}>
              Explica el criterio para considerar la adaptación, descartarla o
              mantenerla pendiente.
            </p>
            {errors["review-reason"] ? (
              <p id="review-reason-error" className={styles.error} role="alert">
                {errors["review-reason"]}
              </p>
            ) : null}
          </div>
          <details className={styles.evidence}>
            <summary>
              Revisar evidencia antes de guardar ·{" "}
              {input.evidence_reviews.length} registros
            </summary>
            <p className={styles.secondary}>
              Mantener pendiente no confirma una observación. Los demás estados
              requieren una nota de contraste o limitación.
            </p>
            {input.evidence_reviews.map((item, index) => {
              const known = data.evidence.find(
                (e) => e.evidence_id === item.evidence_id,
              );
              const local =
                input.expected_analysis_version === data.analysis_version &&
                !!known;
              const noteId = `review-note-${index}`;
              return (
                <div key={item.evidence_id} className={styles.evidenceRow}>
                  <h3>
                    {known && local
                      ? known.kind === "text"
                        ? "Evidencia textual"
                        : "Observación audiovisual"
                      : "Evidencia de la versión del borrador"}
                  </h3>
                  {local ? (
                    <a
                      href={`#${encodeURIComponent(evidenceAnchor(item.evidence_id))}`}
                    >
                      Contrastar evidencia {index + 1} con el original
                    </a>
                  ) : (
                    <Link
                      prefetch={false}
                      href={`${analysisPath(data.run_id, data.analysis_id, input.expected_analysis_version)}#${encodeURIComponent(evidenceAnchor(item.evidence_id))}`}
                    >
                      Abrir evidencia de la versión del borrador
                    </Link>
                  )}
                  <div className={styles.field}>
                    <label htmlFor={`review-state-${index}`}>
                      Estado de evidencia {index + 1}
                    </label>
                    <select
                      id={`review-state-${index}`}
                      value={item.state}
                      onChange={(event) => {
                        const state = evidenceStates.find(
                          (value) => value === event.currentTarget.value,
                        );
                        if (state)
                          edit({
                            ...draft,
                            evidence_reviews: draft.evidence_reviews.map((e) =>
                              e.evidence_id === item.evidence_id
                                ? { ...e, state }
                                : e,
                            ),
                          });
                      }}
                    >
                      {evidenceStates.map((value) => (
                        <option key={value} value={value}>
                          {evidenceReviewLabels[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={noteId}>
                      Nota de evidencia {index + 1}
                      {item.state !== "pending_review"
                        ? " (obligatoria)"
                        : " (opcional mientras está pendiente)"}
                    </label>
                    <textarea
                      id={noteId}
                      rows={2}
                      value={item.note ?? ""}
                      required={item.state !== "pending_review"}
                      aria-invalid={!!errors[noteId]}
                      aria-describedby={
                        errors[noteId] ? `${noteId}-error` : undefined
                      }
                      onChange={(event) =>
                        edit({
                          ...draft,
                          evidence_reviews: draft.evidence_reviews.map((e) =>
                            e.evidence_id === item.evidence_id
                              ? {
                                  ...e,
                                  note: event.currentTarget.value || null,
                                }
                              : e,
                          ),
                        })
                      }
                    />
                    {errors[noteId] ? (
                      <p
                        id={`${noteId}-error`}
                        className={styles.error}
                        role="alert"
                      >
                        {errors[noteId]}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </details>
        </fieldset>
        <div className={styles.actions}>
          <button
            className={shared.primaryButton}
            type="submit"
            disabled={!ready}
          >
            Guardar decisión
          </button>
          {retry && pending ? (
            <button
              className={shared.secondaryButton}
              type="button"
              onClick={() => submit(undefined, pending)}
              disabled={busy}
            >
              Reenviar el mismo guardado
            </button>
          ) : null}
          {!pinned && !storage.receipt ? (
            <button
              className={shared.secondaryButton}
              type="button"
              onClick={adoptSaved}
              disabled={
                busy ||
                stale ||
                needsRead ||
                (!different && unchangedDraft(draft, saved))
              }
            >
              Cargar revisión guardada en el formulario
            </button>
          ) : null}
        </div>
        <p className={styles.secondary}>
          El texto de una solicitud pendiente se conserva en este navegador
          hasta confirmarla o cerrar el intento. Las revisiones guardadas se
          recuperan del servidor.
        </p>
      </form>
    </section>
  );
}
