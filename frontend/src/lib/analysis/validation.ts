import "server-only";
import type { Schema } from "@/lib/api/types";
import {
  consistentPublication,
  consistentSelection,
} from "@/lib/publications/validation";
import type { AnalysisSnapshot } from "./types";

function sameWindows(a: Schema<"Windows">, b: Schema<"Windows">) {
  return (
    a.timezone === b.timezone &&
    (["previous", "recent"] as const).every(
      (window) =>
        Date.parse(a[window].start_inclusive) ===
          Date.parse(b[window].start_inclusive) &&
        Date.parse(a[window].end_exclusive) ===
          Date.parse(b[window].end_exclusive),
    )
  );
}

function consistentSignal(run: Schema<"Run">, data: Schema<"Analysis">) {
  const reference = data.signal;
  if (reference.state !== "available")
    return (
      reference.topic_id === null ||
      reference.topic_id === data.publication.main_topic_id
    );
  const signal = reference.signal;
  if (
    !signal ||
    reference.topic_id !== data.publication.main_topic_id ||
    signal.topic_id !== reference.topic_id ||
    signal.groups_id !== data.groups_id ||
    signal.groups_version !== data.groups_version
  )
    return false;
  const sources = new Set(run.corpus.map((item) => item.source_id));
  const counted = new Set<string>();
  return [signal.previous, signal.recent].every((count) => {
    const sourceIds = new Set(count.by_source.map((item) => item.source_id));
    const ids = count.by_source.flatMap((item) => item.video_ids);
    if (
      sourceIds.size !== count.by_source.length ||
      count.by_source.some((item) => !sources.has(item.source_id)) ||
      ids.length !== new Set(ids).size ||
      ids.length !== count.video_ids.length ||
      ids.some((id) => !count.video_ids.includes(id) || counted.has(id)) ||
      (count.state === "known" && count.total_count !== count.video_ids.length)
    )
      return false;
    ids.forEach((id) => counted.add(id));
    return true;
  });
}

export function consistentAnalysis(snapshot: AnalysisSnapshot): boolean {
  const { run, response, latestVersion } = snapshot;
  const data = response.data;
  const evidence = new Map(
    data.evidence.map((item) => [item.evidence_id, item]),
  );
  const linked = (ids: string[]) => ids.every((id) => evidence.has(id));
  const statements = [
    data.problem_or_learning,
    data.adaptation.expected_contribution,
  ];
  const suggestions = [
    data.adaptation.angle,
    data.adaptation.proposed_hook,
    data.adaptation.proposed_cta,
    ...data.adaptation.proposed_structure,
  ];
  const assessments = [data.value, ...Object.values(data.affinity)];
  if (
    !consistentSelection(run.run_id, data.publication.video_id, response) ||
    !consistentPublication(run, data.publication, true) ||
    !sameWindows(run.windows, data.windows) ||
    data.analysis_version > latestVersion ||
    (data.analysis_version < latestVersion &&
      (response.current_actions.length > 0 ||
        response.operations_to_inspect.length > 0)) ||
    (data.groups_id === null) !== (data.groups_version === null) ||
    !consistentSignal(run, data) ||
    statements.some((item) => item !== null && !linked(item.evidence_ids)) ||
    suggestions.some(
      (item) => item !== null && !linked(item.based_on_evidence_ids),
    ) ||
    assessments.some((item) => !linked(item.evidence_ids)) ||
    new Set(data.hypotheses.map((item) => item.hypothesis_id)).size !==
      data.hypotheses.length ||
    data.hypotheses.some((item) => !linked(item.evidence_ids))
  )
    return false;
  for (const item of data.evidence) {
    if (item.kind !== "audiovisual") continue;
    const end = item.end_seconds ?? item.start_seconds;
    if (
      end < item.start_seconds ||
      (data.publication.duration.state === "known" &&
        end > data.publication.duration.seconds) ||
      !data.material.some(
        (material) =>
          material.kind === "public_video_url" &&
          material.processed_start_seconds !== null &&
          material.processed_end_seconds !== null &&
          material.processed_start_seconds <= item.start_seconds &&
          material.processed_end_seconds >= end,
      )
    )
      return false;
  }
  return data.dimensions.every(
    (dimension) =>
      linked(dimension.evidence_ids) &&
      dimension.evidence_ids.every((id) => {
        const item = evidence.get(id);
        return (
          item?.kind === "audiovisual" && item.dimension === dimension.dimension
        );
      }) &&
      (dimension.description === null || dimension.evidence_ids.length > 0),
  );
}
