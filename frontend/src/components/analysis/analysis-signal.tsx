import Link from "next/link";
import type { Schema } from "@/lib/api/types";
import type { AnalysisSnapshot } from "@/lib/analysis/types";
import { countLabel, signalLabels } from "@/lib/comparison/presentation";
import { videoUrl } from "@/lib/publications/presentation";
import { sourceLabel } from "@/lib/runs/corpus";
import { dateLabel } from "@/lib/runs/presentation";
import styles from "./analysis.module.css";

function Count({ count }: { count: Schema<"Count"> }) {
  return (
    <>
      <strong>{countLabel(count)}</strong>
      {count.state === "unknown" ? (
        <>
          <p>{count.observed_count} publicaciones observadas.</p>
          <p>{count.reason}</p>
        </>
      ) : null}
    </>
  );
}

export function AnalysisSignal({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const { data } = snapshot.response;
  const signal = data.signal.signal;
  const labels = signal
    ? signalLabels(signal, signal.kind !== "comparison_pending")
    : null;
  return (
    <section
      id="senal"
      className={styles.section}
      aria-labelledby="signal-title"
    >
      <h2 id="signal-title">Señal temática</h2>
      <p>
        Contexto conservado con esta versión del análisis. Describe
        publicaciones del corpus; no acredita crecimiento de audiencia ni valor
        editorial.
      </p>
      <div className={styles.windows}>
        {(["previous", "recent"] as const).map((window) => (
          <div key={window}>
            <h3>
              {window === "previous" ? "Semana anterior" : "Semana reciente"}
            </h3>
            <p>{dateLabel(data.windows[window].start_inclusive)} inclusive</p>
            <p>{dateLabel(data.windows[window].end_exclusive)} exclusivo</p>
          </div>
        ))}
      </div>
      <p className={styles.secondary}>
        {data.windows.timezone} · se excluye el día en curso.
      </p>
      {signal && labels ? (
        <>
          <p className={styles.state}>{labels.label}</p>
          <div
            className={styles.tableScroll}
            tabIndex={0}
            role="region"
            aria-label="Comparación guardada; tabla desplazable horizontalmente"
          >
            <table>
              <caption>Conteos y variación recibidos del servidor</caption>
              <thead>
                <tr>
                  <th>Anterior</th>
                  <th>Reciente</th>
                  <th>Diferencia</th>
                  <th>Variación</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <Count count={signal.previous} />
                  </td>
                  <td>
                    <Count count={signal.recent} />
                  </td>
                  <td>{labels.delta}</td>
                  <td>{labels.percentage}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className={styles.secondary}>
            En pantallas estrechas puedes desplazar la tabla horizontalmente.
          </p>
          {labels.reason ? (
            <p className={styles.limitation}>{labels.reason}</p>
          ) : null}
          <details className={styles.details}>
            <summary>
              Publicaciones y contribución por canal de la señal
            </summary>
            {(["previous", "recent"] as const).map((window) => (
              <div key={window}>
                <h3>
                  {window === "previous"
                    ? "Semana anterior"
                    : "Semana reciente"}
                </h3>
                {signal[window].by_source.length ? (
                  <ul className={styles.backing}>
                    {signal[window].by_source.map((source) => (
                      <li key={source.source_id}>
                        <strong>
                          {sourceLabel(
                            snapshot.run.corpus.find(
                              (item) => item.source_id === source.source_id,
                            )!.original_url,
                          )}
                        </strong>
                        <p>
                          {source.video_ids.length} identificadores de respaldo
                          recibidos.
                        </p>
                        <ul>
                          {source.video_ids.map((id) => (
                            <li key={id}>
                              <a
                                className={styles.sourceLink}
                                href={videoUrl(id)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Ver publicación {id}
                                <span className={styles.srOnly}>
                                  {" "}
                                  (abre en otra pestaña)
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Sin identificadores de respaldo disponibles en esta ventana.
                  </p>
                )}
              </div>
            ))}
            <p>Un tema principal por video; los secundarios no se suman.</p>
          </details>
        </>
      ) : (
        <p className={styles.state}>
          {data.signal.state === "unassigned"
            ? "Tema principal sin asignar en esta versión."
            : "Comparación pendiente en esta versión."}{" "}
          La pieza puede analizarse sin una señal creciente.
        </p>
      )}
      <details className={styles.details}>
        <summary>Identidad temática de esta versión</summary>
        <p>Tema principal: {data.publication.main_topic_id ?? "Pendiente"}.</p>
        <p>
          Secundarios sin conteo:{" "}
          {data.publication.secondary_topic_ids.join(", ") ||
            "Ninguno informado"}
          .
        </p>
        <p>
          Grupos: {data.groups_id ?? "No disponibles"} · versión{" "}
          {data.groups_version ?? "no disponible"}. Revisión de comparación:{" "}
          {data.signal.comparison_revision ?? "no disponible"}.
        </p>
      </details>
      <Link
        className={styles.sourceLink}
        prefetch={false}
        href={`/?run=${encodeURIComponent(data.run_id)}#comparacion`}
      >
        Consultar comparación de la ejecución
      </Link>
    </section>
  );
}
