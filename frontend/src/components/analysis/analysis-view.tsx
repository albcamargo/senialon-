import type { ReactNode } from "react";
import type { Schema } from "@/lib/api/types";
import type { AnalysisSnapshot } from "@/lib/analysis/types";
import {
  dimensionLabels,
  fitLabels,
  pillarLabels,
  reviewLabels,
  valueLabels,
} from "@/lib/analysis/presentation";
import {
  metricLabel,
  shortLabels,
  videoUrl,
} from "@/lib/publications/presentation";
import { sourceLabel } from "@/lib/runs/corpus";
import { dateLabel, stageLabels } from "@/lib/runs/presentation";
import { AnalysisSignal } from "./analysis-signal";
import { EvidenceCatalogue, EvidenceLinks, TraceView } from "./evidence";
import styles from "./analysis.module.css";

function Assessment({
  title,
  assessment,
  labels,
}: {
  title: string;
  assessment:
    | Schema<"ValueAssessment">
    | Schema<"FitAssessment">
    | Schema<"PillarAssessment">;
  labels: Readonly<Record<string, string>>;
}) {
  return (
    <div className={styles.assessment}>
      <h3>{title}</h3>
      <p className={styles.state}>
        {assessment.state === "decided"
          ? labels[assessment.decision]
          : stageLabels[assessment.state]}
      </p>
      <p>
        {assessment.state === "decided"
          ? assessment.explanation
          : assessment.reason}
      </p>
      {assessment.state === "decided" ? (
        <>
          <p className={styles.secondary}>
            Decisión tipada de JEV. Explicación:{" "}
            {assessment.explanation_source === "gemini_synthesis"
              ? "síntesis de Gemini"
              : "resumen de evidencia"}
            .
          </p>
          <EvidenceLinks ids={assessment.evidence_ids} />
        </>
      ) : null}
      <TraceView trace={assessment.trace} />
    </div>
  );
}

function Suggestion({
  label,
  value,
}: {
  label: string;
  value: Schema<"Suggestion"> | null;
}) {
  return (
    <div className={styles.suggestion}>
      <h3>{label}</h3>
      {value ? (
        <>
          <p>{value.text}</p>
          <EvidenceLinks ids={value.based_on_evidence_ids} />
        </>
      ) : (
        <p className={styles.secondary}>No disponible en esta versión.</p>
      )}
    </div>
  );
}

export function AnalysisView({
  snapshot,
  stale,
  children,
}: {
  snapshot: AnalysisSnapshot;
  stale: boolean;
  children?: ReactNode;
}) {
  const data = snapshot.response.data;
  const publication = data.publication;
  const source = snapshot.run.corpus.find(
    (item) => item.source_id === publication.source_id,
  )!;
  return (
    <article className={styles.article} aria-labelledby="publication-title">
      {stale ? (
        <p className={styles.warning}>
          Ficha anterior conservada. No describe necesariamente el estado
          actual; consulta de nuevo antes de solicitar otro paso.
        </p>
      ) : null}
      <h2 id="publication-title">
        {publication.title ?? "Título no disponible"}
      </h2>
      <div className={styles.links}>
        <a
          href={videoUrl(publication.video_id)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver publicación original
          <span className={styles.srOnly}> (abre en otra pestaña)</span>
        </a>
        <a href={source.original_url} target="_blank" rel="noopener noreferrer">
          {sourceLabel(source.original_url)}
          <span className={styles.srOnly}> (abre en otra pestaña)</span>
        </a>
      </div>
      <p className={styles.state}>
        Revisión editorial: {reviewLabels[data.review.decision]}.
      </p>
      {data.review.reason ? (
        <p>Motivo registrado: {data.review.reason}</p>
      ) : null}
      <p className={styles.secondary}>
        Versión {data.analysis_version} · guardada{" "}
        {dateLabel(data.version_created_at)} · consulta{" "}
        {dateLabel(snapshot.response.meta.served_at)}, hora de Colombia.
      </p>
      <nav className={styles.contents} aria-label="Secciones de la ficha">
        {(
          [
            ["metricas", "Métricas"],
            ["senal", "Señal"],
            ["audiovisual", "Audiovisual"],
            ["valor", "Valor"],
            ["afinidad", "Afinidad"],
            ["hipotesis", "Hipótesis"],
            ["adaptacion", "Adaptación"],
            ["evidencia", "Evidencia"],
          ] as const
        ).map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
        {children ? <a href="#revision-editorial">Revisión</a> : null}
      </nav>

      <section
        id="metricas"
        className={styles.section}
        aria-labelledby="metrics-title"
      >
        <h2 id="metrics-title">Métricas originales</h2>
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
        <p>
          Capturadas {dateLabel(publication.captured_at)}, hora de Colombia.
        </p>
        <p className={styles.limitation}>
          Desempeño no evaluable: {data.performance.reason}
        </p>
        <dl className={styles.facts}>
          <div>
            <dt>Publicada · Colombia</dt>
            <dd>
              {publication.published_at
                ? dateLabel(publication.published_at)
                : "No disponible"}
            </dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>
              {publication.duration.state === "known"
                ? `${publication.duration.seconds} segundos`
                : "No disponible"}
            </dd>
          </div>
          <div>
            <dt>Condición</dt>
            <dd>{shortLabels[publication.short_status]}</dd>
          </div>
        </dl>
        {publication.short_status === "confirmed_short" ? (
          <p>Respaldo de confirmación de Short: {publication.short_evidence}</p>
        ) : (
          <p className={styles.secondary}>
            La duración no confirma por sí sola que sea un Short.
          </p>
        )}
        <details className={styles.details}>
          <summary>Descripción y pertinencia de IA conservadas</summary>
          <p>{publication.description ?? "Descripción no disponible."}</p>
          <p>{publication.eligibility_reason}</p>
          <p>
            {publication.ai_relevance.state === "decided"
              ? publication.ai_relevance.explanation
              : publication.ai_relevance.reason}
          </p>
          <TraceView trace={publication.ai_relevance.trace} />
        </details>
      </section>

      <AnalysisSignal snapshot={snapshot} />

      <section
        id="audiovisual"
        className={styles.section}
        aria-labelledby="audiovisual-title"
      >
        <h2 id="audiovisual-title">Observaciones audiovisuales</h2>
        <p className={styles.state}>{stageLabels[data.audiovisual.state]}</p>
        {data.audiovisual.reason ? <p>{data.audiovisual.reason}</p> : null}
        {["failed", "blocked", "uncertain"].includes(data.audiovisual.state) ? (
          <p className={styles.warning}>
            No se completó el análisis audiovisual. Los metadatos y la señal
            temática disponibles se conservan.
          </p>
        ) : null}
        <p className={styles.secondary}>
          Cada descripción remite al material observado. No demuestra que el
          recurso haya causado retención o desempeño.
        </p>
        <div className={styles.dimensions}>
          {data.dimensions.map((dimension) => (
            <div key={dimension.dimension}>
              <h3>{dimensionLabels[dimension.dimension]}</h3>
              <p className={styles.state}>
                {stageLabels[dimension.stage.state]}
              </p>
              {dimension.stage.reason ? <p>{dimension.stage.reason}</p> : null}
              <p>
                {dimension.description ??
                  "Sin observación respaldada disponible para esta dimensión."}
              </p>
              {dimension.evidence_ids.length ? (
                <EvidenceLinks ids={dimension.evidence_ids} />
              ) : null}
            </div>
          ))}
        </div>
        <details className={styles.details}>
          <summary>Material procesado y sus límites</summary>
          {data.material.length ? (
            data.material.map((material) => (
              <div key={material.material_id}>
                <p>
                  {
                    {
                      public_video_url: "Video público",
                      metadata_text: "Metadatos",
                      available_text: "Texto disponible",
                    }[material.kind]
                  }{" "}
                  ·{" "}
                  {material.processed_start_seconds ?? "inicio no determinado"}–
                  {material.processed_end_seconds ?? "fin no determinado"}{" "}
                  segundos.
                </p>
                {material.limitations.map((limit, index) => (
                  <p className={styles.limitation} key={index}>
                    {limit}
                  </p>
                ))}
              </div>
            ))
          ) : (
            <p>No hay material procesado registrado.</p>
          )}
        </details>
      </section>

      <section
        id="valor"
        className={styles.section}
        aria-labelledby="value-title"
      >
        <h2 id="value-title">Valor para la audiencia</h2>
        {data.problem_or_learning ? (
          <>
            <h3>Problema, aprendizaje o aplicación</h3>
            <p>{data.problem_or_learning.text}</p>
            <EvidenceLinks ids={data.problem_or_learning.evidence_ids} />
          </>
        ) : (
          <p className={styles.secondary}>
            Problema o aprendizaje sin respaldo disponible en esta versión.
          </p>
        )}
        <Assessment
          title="Evaluación de valor"
          assessment={data.value}
          labels={valueLabels}
        />
        <p className={styles.limitation}>
          La popularidad y el aumento temático no acreditan valor. Evaluar el
          aporte del contenido no verifica externamente todas sus afirmaciones.
        </p>
      </section>
      <section
        id="afinidad"
        className={styles.section}
        aria-labelledby="affinity-title"
      >
        <h2 id="affinity-title">Afinidad editorial</h2>
        <p>
          Contexto editorial: líderes y equipos de LatAm. No identifica quién
          vio la publicación, su cargo o presupuesto.
        </p>
        <Assessment
          title="Persona destinataria"
          assessment={data.affinity.persona}
          labels={fitLabels}
        />
        <Assessment
          title="Contexto empresarial o de aplicación"
          assessment={data.affinity.company_context}
          labels={fitLabels}
        />
        <Assessment
          title="Pilar editorial"
          assessment={data.affinity.pillar}
          labels={pillarLabels}
        />
      </section>
      <section
        id="hipotesis"
        className={styles.section}
        aria-labelledby="hypotheses-title"
      >
        <h2 id="hypotheses-title">Hipótesis explicativas</h2>
        <p>
          Posibles mecanismos del contenido, separados de las observaciones. No
          son causalidad demostrada.
        </p>
        {data.hypotheses.length ? (
          data.hypotheses.map((hypothesis) => (
            <div className={styles.hypothesis} key={hypothesis.hypothesis_id}>
              <p>{hypothesis.text}</p>
              <EvidenceLinks ids={hypothesis.evidence_ids} />
              <ul className={styles.limitations}>
                {hypothesis.limitations.map((limit, index) => (
                  <li key={index}>{limit}</li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className={styles.secondary}>
            No hay hipótesis respaldadas disponibles en esta versión.
          </p>
        )}
      </section>
      <section
        id="adaptacion"
        className={styles.section}
        aria-labelledby="adaptation-title"
      >
        <h2 id="adaptation-title">Adaptación sugerida</h2>
        <p className={styles.state}>
          {stageLabels[data.adaptation.stage.state]}
        </p>
        {data.adaptation.stage.reason ? (
          <p>{data.adaptation.stage.reason}</p>
        ) : null}
        <p>
          Propuestas para revisar, separadas de los recursos observados y de los
          activos disponibles para el equipo.
        </p>
        <Suggestion label="Ángulo propuesto" value={data.adaptation.angle} />
        <h3>Aporte esperado</h3>
        {data.adaptation.expected_contribution ? (
          <>
            <p>{data.adaptation.expected_contribution.text}</p>
            <EvidenceLinks
              ids={data.adaptation.expected_contribution.evidence_ids}
            />
          </>
        ) : (
          <p className={styles.secondary}>No disponible en esta versión.</p>
        )}
        <Suggestion
          label="Gancho propuesto"
          value={data.adaptation.proposed_hook}
        />
        <h3>Estructura propuesta</h3>
        {data.adaptation.proposed_structure.length ? (
          <ol className={styles.structure}>
            {data.adaptation.proposed_structure.map((item, index) => (
              <li key={index}>
                <p>{item.text}</p>
                <EvidenceLinks ids={item.based_on_evidence_ids} />
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.secondary}>No disponible en esta versión.</p>
        )}
        <Suggestion
          label="CTA propuesto, si aplica"
          value={data.adaptation.proposed_cta}
        />
        <ul className={styles.limitations}>
          {data.adaptation.limitations.map((limit, index) => (
            <li key={index}>{limit}</li>
          ))}
        </ul>
      </section>

      <EvidenceCatalogue data={data} />

      {children}

      <section className={styles.section} aria-labelledby="context-title">
        <h2 id="context-title">Contexto y procedencia</h2>
        <details className={styles.details}>
          <summary>Identidad, criterios y modelos de esta versión</summary>
          <dl className={styles.facts}>
            <div>
              <dt>Ejecución</dt>
              <dd>
                <code>{data.run_id}</code>
              </dd>
            </div>
            <div>
              <dt>Análisis</dt>
              <dd>
                <code>{data.analysis_id}</code> · versión{" "}
                {data.analysis_version}
              </dd>
            </div>
            <div>
              <dt>Captura</dt>
              <dd>
                <code>{publication.capture_id}</code>
              </dd>
            </div>
            <div>
              <dt>Criterios</dt>
              <dd>{data.versions.criteria_version}</dd>
            </div>
            <div>
              <dt>Reglas</dt>
              <dd>{data.versions.rules_version}</dd>
            </div>
            <div>
              <dt>Clasificación</dt>
              <dd>{data.versions.classification_version}</dd>
            </div>
          </dl>
          {data.model_uses.length ? (
            data.model_uses.map((use, index) => (
              <div key={index}>
                <h3>
                  {use.provider} · {use.model}
                </h3>
                <p>
                  Prompt o pregunta: {use.prompt_or_question_version} ·
                  criterios {use.criteria_version}.
                </p>
                <p>
                  Procesamiento informado: {dateLabel(use.processed_at)}, hora
                  de Colombia.
                </p>
                <p>
                  Solicitud del proveedor:{" "}
                  {use.provider_request_id ?? "No disponible"}.
                </p>
                <pre>
                  {use.usage_report ?? "Uso no informado; no se presume cero."}
                </pre>
              </div>
            ))
          ) : (
            <p>No hay usos de modelos registrados en esta versión.</p>
          )}
        </details>
        <p className={styles.secondary}>
          La revisión corresponde a esta versión exacta. No se combinan
          desempeño, señal, valor y afinidad en una puntuación global.
        </p>
      </section>
    </article>
  );
}
