import { Suspense } from "react";
import { readAnalysisAction } from "@/app/analysis-actions";
import { AnalysisPanel } from "@/components/analysis/analysis-panel";
import { Workspace } from "@/components/workspace";
import { parseAnalysisVersion } from "@/lib/analysis/presentation";
import { requirePageAccess } from "@/lib/auth/page-access";
import { resourceSegment } from "@/lib/runs/server";

type Props = {
  params: Promise<{ runId: string; analysisId: string }>;
  searchParams: Promise<{ analysis_version?: string | string[] }>;
};
async function Detail({
  runId,
  analysisId,
  version,
}: {
  runId: string;
  analysisId: string;
  version?: number;
}) {
  const initial = await readAnalysisAction(runId, analysisId, version);
  return (
    <AnalysisPanel
      key={`${runId}:${analysisId}:${version ?? "latest"}`}
      runId={runId}
      analysisId={analysisId}
      version={version}
      initial={initial}
    />
  );
}
export default async function AnalysisPage({ params, searchParams }: Props) {
  await requirePageAccess();
  const [identity, query] = await Promise.all([params, searchParams]);
  const version = parseAnalysisVersion(query.analysis_version);
  try {
    resourceSegment(identity.runId);
    resourceSegment(identity.analysisId);
  } catch {
    return (
      <Workspace>
        <h1>Ficha de publicación</h1>
        <p role="alert">
          La identidad de la ficha no es válida. Vuelve a las publicaciones de
          una ejecución guardada.
        </p>
      </Workspace>
    );
  }
  return (
    <Workspace runId={identity.runId} section="publications">
      {version === null ? (
        <>
          <h1>Ficha de publicación</h1>
          <p role="alert">
            La versión solicitada no es válida. Usa un entero positivo o abre la
            ficha actual desde el catálogo.
          </p>
        </>
      ) : (
        <Suspense
          fallback={
            <div role="status">
              <h1>Ficha de publicación</h1>
              <p>Consultando la versión guardada, sin iniciar análisis…</p>
            </div>
          }
        >
          <Detail {...identity} version={version} />
        </Suspense>
      )}
    </Workspace>
  );
}
