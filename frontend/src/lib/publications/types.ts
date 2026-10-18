import type { Schema } from "@/lib/api/types";
import type { Result } from "@/lib/runs/types";

export type CatalogSnapshot = {
  run: Schema<"Run">;
  publications: Schema<"PublicationsResponse">;
  analyses: Result<Schema<"AnalysesResponse">>;
};
export type PublicationSnapshot = {
  run: Schema<"Run">;
  publication: Schema<"Publication">;
  servedAt: string;
};
export type SelectionPage = {
  run: Schema<"Run">;
  page: Schema<"AnalysesResponse">;
};
export type SavedSelection = Pick<
  Schema<"Analysis">,
  | "run_id"
  | "analysis_id"
  | "analysis_version"
  | "created_at"
  | "version_created_at"
  | "publication"
  | "audiovisual"
> & { decision: Schema<"EditorialReview">["decision"] };
export type SelectionResult = { selection: SavedSelection; servedAt: string };
