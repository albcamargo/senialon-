import type { Schema } from "@/lib/api/types";
import { sourceLabel } from "@/lib/runs/corpus";
import { dateLabel, stageLabels } from "@/lib/runs/presentation";
import {
  metricLabel,
  shortLabels,
  videoUrl,
} from "@/lib/publications/presentation";
import type {
  PublicationSnapshot,
  SelectionResult,
} from "@/lib/publications/types";
import shared from "@/components/runs/runs.module.css";
import styles from "./publications.module.css";

export function CatalogView({
  run,
  page,
  stale,
  busy,
  onInspect,
}: {
  run: Schema<"Run">;
  page: Schema<"PublicationsResponse">;
  stale: boolean;
  busy: boolean;
  onInspect: (videoId: string) => void;
}) {
  return (
    <div>
      {stale ? (
        <p className={shared.warning}>
          Listado anterior conservado. Consulta de nuevo antes de seleccionar o
          cargar otra página.
        </p>
      ) : null}
      <p className={styles.context}>
        {page.items.length}{" "}
        {page.items.length === 1
          ? "publicación elegible cargada"
          : "publicaciones elegibles cargadas"}
        {page.next_cursor
          ? " · quedan páginas por consultar"
          : " · fin del listado recibido"}
        . Consulta: {dateLabel(page.meta.served_at)}, hora de Colombia.
      </p>
      {page.items.length === 0 ? (
        <p className={styles.empty}>
          No hay publicaciones elegibles en el material disponible de esta
          ejecución. Revisa la cobertura: este resultado no demuestra que los
          once canales estén completos ni que no exista contenido de IA.
        </p>
      ) : (
        <ul className={styles.publications}>
          {page.items.map((publication) => {
            const source = run.corpus.find(
              (item) => item.source_id === publication.source_id,
            )!;
            return (
              <li key={publication.video_id}>
                <div className={styles.rowContent}>
                  <h3>{publication.title ?? "Título no disponible"}</h3>
                  <p className={styles.metadata}>
                    {sourceLabel(source.original_url)} ·{" "}
                    {publication.window === "previous"
                      ? "Semana anterior"
                      : "Semana reciente"}
                    {" · "}
                    {publication.duration.state === "known"
                      ? `${publication.duration.seconds} s`
                      : "Duración no disponible"}
                  </p>
                  <p className={styles.metadata}>
                    {shortLabels[publication.short_status]} · Publicada{" "}
                    {publication.published_at
                      ? dateLabel(publication.published_at)
                      : "en fecha no disponible"}
                  </p>
                </div>
                <button
                  className={shared.secondaryButton}
                  onClick={() => onInspect(publication.video_id)}
                  disabled={busy}
                >
                  Inspeccionar publicación
                  <span className={shared.srOnly}>
                    : {publication.title ?? publication.video_id}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PublicationPreview({
  snapshot,
  stale,
}: {
  snapshot: PublicationSnapshot;
  stale: boolean;
}) {
  const { publication, run } = snapshot;
  const source = run.corpus.find(
    (item) => item.source_id === publication.source_id,
  )!;
  return (
    <article
      className={styles.preview}
      aria-labelledby="publication-preview-title"
    >
      <h3 id="publication-preview-title">
        {publication.title ?? "Título no disponible"}
      </h3>
      {stale ? (
        <p className={shared.warning}>
          Detalle anterior conservado. Inspecciona de nuevo para recuperar el
          estado actual de esta publicación.
        </p>
      ) : null}
      <div className={styles.links}>
        <a
          href={videoUrl(publication.video_id)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver publicación en YouTube
          <span className={shared.srOnly}> (abre en otra pestaña)</span>
        </a>
        <a href={source.original_url} target="_blank" rel="noopener noreferrer">
          {sourceLabel(source.original_url)}
          <span className={shared.srOnly}> (abre en otra pestaña)</span>
        </a>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Condición</dt>
          <dd>{shortLabels[publication.short_status]}</dd>
        </div>
        <div>
          <dt>Duración</dt>
          <dd>
            {publication.duration.state === "known"
              ? `${publication.duration.seconds} segundos`
              : `No disponible. ${publication.duration.reason}`}
          </dd>
        </div>
        <div>
          <dt>Publicada · Colombia</dt>
          <dd>
            {publication.published_at
              ? dateLabel(publication.published_at)
              : "No disponible"}
          </dd>
        </div>
        <div>
          <dt>Captura · Colombia</dt>
          <dd>{dateLabel(publication.captured_at)}</dd>
        </div>
      </dl>
      <p className={styles.eligibility}>
        <strong>
          {
            {
              eligible: "Elegible",
              pending: "Elegibilidad pendiente",
              excluded: "Excluida",
            }[publication.eligibility]
          }
          .
        </strong>{" "}
        {publication.eligibility_reason}
      </p>
      <p className={shared.secondary}>
        {publication.short_status === "confirmed_short"
          ? `Respaldo de la confirmación de Short: ${publication.short_evidence}`
          : "La duración por sí sola no confirma que sea un Short."}
      </p>
      <details className={styles.details}>
        <summary>Metadatos y pertinencia de IA</summary>
        <p>{publication.description ?? "Descripción no disponible."}</p>
        <dl className={styles.facts}>
          {(
            [
              ["views", "Vistas"],
              ["likes", "Me gusta"],
              ["comments", "Comentarios"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                {metricLabel(publication.statistics[key])}
                {publication.statistics[key].state === "unknown" ? (
                  <small>{publication.statistics[key].reason}</small>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
        <p className={shared.secondary}>
          Estadísticas de la captura; una sola observación no acredita éxito ni
          crecimiento de audiencia.
        </p>
        <p>
          {publication.ai_relevance.state === "decided"
            ? (publication.ai_relevance.explanation ??
              "Decisión de pertinencia conservada sin explicación adicional.")
            : publication.ai_relevance.reason}
        </p>
        {publication.evidence.length ? (
          <ul className={styles.evidence}>
            {publication.evidence.map((item) => (
              <li key={item.evidence_id}>
                {item.kind === "text" ? item.excerpt : item.observation}
              </li>
            ))}
          </ul>
        ) : (
          <p>No hay evidencia adicional disponible.</p>
        )}
      </details>
      <p className={styles.context}>
        Consulta recibida: {dateLabel(snapshot.servedAt)}, hora de Colombia.
      </p>
    </article>
  );
}

export function SavedSelectionView({ result }: { result: SelectionResult }) {
  const { selection } = result;
  return (
    <div className={styles.selection} aria-labelledby="saved-selection-title">
      <h3 id="saved-selection-title">Selección guardada</h3>
      <p>{selection.publication.title ?? selection.publication.video_id}</p>
      <p className={shared.secondary}>
        Análisis audiovisual: {stageLabels[selection.audiovisual.state]}.
        {selection.audiovisual.reason ? ` ${selection.audiovisual.reason}` : ""}
      </p>
      <p>
        Revisión editorial:{" "}
        {
          {
            pending_review: "Pendiente de revisión",
            consider_for_adaptation: "Considerar para adaptación",
            discarded: "Descartada",
          }[selection.decision]
        }
        .
      </p>
      <p className={styles.context}>
        Versión {selection.analysis_version} · Creada{" "}
        {dateLabel(selection.created_at)} · Consulta{" "}
        {dateLabel(result.servedAt)}, hora de Colombia.
      </p>
      <details className={styles.details}>
        <summary>Identidad de la selección</summary>
        <p>
          Publicación: <code>{selection.publication.video_id}</code>. Análisis:{" "}
          <code>{selection.analysis_id}</code>. Ejecución:{" "}
          <code>{selection.run_id}</code>.
        </p>
      </details>
      <p className={shared.secondary}>
        Guardar o consultar una selección no solicita análisis profundo ni
        aprueba una oportunidad.
      </p>
    </div>
  );
}
