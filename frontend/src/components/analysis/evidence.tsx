import type { Schema } from "@/lib/api/types";
import {
  dimensionLabels,
  evidenceAnchor,
  evidenceReviewLabels,
  timestampLabel,
} from "@/lib/analysis/presentation";
import { videoUrl } from "@/lib/publications/presentation";
import { dateLabel } from "@/lib/runs/presentation";
import styles from "./analysis.module.css";

export function EvidenceLinks({ ids }: { ids: string[] }) {
  return ids.length ? (
    <p className={styles.references}>
      Respaldo:{" "}
      {ids.map((id, index) => (
        <span key={id}>
          {index ? ", " : ""}
          <a href={`#${encodeURIComponent(evidenceAnchor(id))}`}>
            evidencia {id}
          </a>
        </span>
      ))}
    </p>
  ) : (
    <p className={styles.secondary}>
      Sin referencia observada específica; no acredita un hecho del original.
    </p>
  );
}

export function TraceView({
  trace,
}: {
  trace: Schema<"JevTrace"> | Schema<"JevAttemptTrace"> | null;
}) {
  if (!trace)
    return (
      <p className={styles.secondary}>
        No hay una traza JEV disponible para esta dimensión.
      </p>
    );
  return (
    <details className={styles.details}>
      <summary>Procedencia de la decisión o intento JEV</summary>
      <dl className={styles.facts}>
        <div>
          <dt>Modelo informado</dt>
          <dd>{trace.model ?? "No disponible"}</dd>
        </div>
        <div>
          <dt>Criterios</dt>
          <dd>{trace.criteria_version ?? "No disponibles"}</dd>
        </div>
        <div>
          <dt>Versión de pregunta</dt>
          <dd>{trace.question_version ?? "No disponible"}</dd>
        </div>
        <div>
          <dt>Solicitud del proveedor</dt>
          <dd>{trace.provider_request_id ?? "No disponible"}</dd>
        </div>
      </dl>
      <p>
        <strong>Pregunta:</strong> {trace.question ?? "No disponible"}
      </p>
      <p>
        <strong>Material de entrada:</strong>
      </p>
      <pre>{trace.input_text ?? "No disponible"}</pre>
      <p>
        <strong>Respuesta conservada:</strong>
      </p>
      <pre>
        {trace.raw_response_text ?? "No disponible; no se supone una decisión."}
      </pre>
      {"decided_at" in trace ? (
        <p>
          Decisión recibida el {dateLabel(trace.decided_at)}, hora de Colombia.
        </p>
      ) : null}
      {"probabilities" in trace && trace.probabilities ? (
        <>
          <p>
            Probabilidades informadas por el modelo. No son precisión validada
            ni probabilidad de viralidad.
          </p>
          <pre>{JSON.stringify(trace.probabilities, null, 2)}</pre>
        </>
      ) : null}
    </details>
  );
}

export function EvidenceCatalogue({ data }: { data: Schema<"Analysis"> }) {
  const reviews = new Map(
    data.review.evidence_reviews.map((review) => [review.evidence_id, review]),
  );
  return (
    <section
      id="evidencia"
      className={styles.section}
      aria-labelledby="evidence-title"
    >
      <h2 id="evidence-title">Evidencia y revisión</h2>
      <p>
        Observaciones conservadas y su revisión humana. Las marcas de tiempo
        permiten contrastar el original; no demuestran causalidad.
      </p>
      {data.evidence.length ? (
        <ul className={styles.evidenceList}>
          {data.evidence.map((item) => {
            const review = reviews.get(item.evidence_id)!;
            return (
              <li
                key={item.evidence_id}
                id={evidenceAnchor(item.evidence_id)}
                tabIndex={-1}
              >
                <h3>
                  {item.kind === "audiovisual"
                    ? `Observación · ${dimensionLabels[item.dimension]}`
                    : "Evidencia textual"}
                </h3>
                <p>
                  {item.kind === "audiovisual"
                    ? item.observation
                    : item.excerpt}
                </p>
                <a
                  className={styles.sourceLink}
                  href={
                    item.kind === "audiovisual"
                      ? `${videoUrl(item.video_id)}&t=${Math.floor(item.start_seconds)}s`
                      : videoUrl(item.video_id)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.kind === "audiovisual"
                    ? `Contrastar ${timestampLabel(item.start_seconds)}${item.end_seconds === null ? "" : `–${timestampLabel(item.end_seconds)}`} en YouTube`
                    : "Contrastar publicación original"}
                  <span className={styles.srOnly}> (abre en otra pestaña)</span>
                </a>
                {item.kind === "text" ? (
                  <p className={styles.secondary}>
                    Campo de origen:{" "}
                    {
                      {
                        title: "título",
                        description: "descripción",
                        available_text: "texto disponible",
                      }[item.field]
                    }
                    .
                  </p>
                ) : null}
                <p>
                  <strong>Revisión:</strong>{" "}
                  {evidenceReviewLabels[review.state]}.
                </p>
                {review.note ? <p>Nota de revisión: {review.note}</p> : null}
                <details className={styles.details}>
                  <summary>Identidad y captura de esta evidencia</summary>
                  <p>
                    <code>{item.evidence_id}</code> · Video{" "}
                    <code>{item.video_id}</code>.
                  </p>
                  <p>
                    Capturada {dateLabel(item.captured_at)}, hora de Colombia.
                  </p>
                  <p>Referencia recibida: {item.source_url}</p>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.secondary}>
          No hay evidencia disponible en esta versión. Las dimensiones
          pendientes permanecen identificadas.
        </p>
      )}
    </section>
  );
}
