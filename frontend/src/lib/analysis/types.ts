import type { Schema } from "@/lib/api/types";

export type AnalysisSnapshot = {
  run: Schema<"Run">;
  response: Schema<"AnalysisResponse">;
  latestVersion: number;
};
