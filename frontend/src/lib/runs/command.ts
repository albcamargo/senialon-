import type { Schema } from "@/lib/api/types";
import { isReviewRequest } from "@/lib/analysis/review";

export const receiptStorageKey = "senialon:command:v1";
export type CommandReceipt = {
  version: 1;
  key: string;
  createdAt: string;
  operationId: string | null;
} & (
  | { kind: "create" }
  | { kind: "advance"; runId: string; revision: number }
  | {
      kind: "record_review";
      runId: string;
      revision: number;
      analysisId: string;
      videoId: string;
      reviewId: string;
      request: Schema<"ReviewRequest">;
    }
  | {
      kind: "advance_analysis";
      runId: string;
      revision: number;
      analysisId: string;
      analysisVersion: number;
      videoId: string;
    }
  | {
      kind: "select_analysis";
      runId: string;
      revision: number;
      videoId: string;
    }
  | {
      kind: "confirm_groups";
      runId: string;
      revision: number;
      groupsId: string;
      groupsVersion: number;
    }
  | {
      kind: "compare";
      runId: string;
      revision: number;
      groupsId: string;
      groupsVersion: number;
      confirmationId: string;
    }
);

// Delivery metadata, plus the operator's exact pending review input, is stored.
// Observations/results, credentials and budget remain on the server. A pending
// attempt never expires into a new request; confirmed review input is removed.
export function parseReceipt(text: string | null): CommandReceipt | null {
  if (text === null) return null;
  if (text.length > 4_010_000) throw new Error("Registro local no válido.");
  const value: unknown = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("key" in value) ||
    typeof value.key !== "string" ||
    !/^[a-zA-Z0-9._:-]{16,128}$/.test(value.key) ||
    !("createdAt" in value) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !("operationId" in value) ||
    (value.operationId !== null &&
      (typeof value.operationId !== "string" ||
        !value.operationId.length ||
        value.operationId.length > 128)) ||
    !("kind" in value)
  )
    throw new Error("Registro local no válido.");
  if (value.kind !== "record_review" && text.length > 2048)
    throw new Error("Registro local no válido.");
  const base = {
    version: 1 as const,
    key: value.key,
    createdAt: value.createdAt,
    operationId: value.operationId,
  };
  if (value.kind === "create" && Object.keys(value).length === 5)
    return { ...base, kind: "create" };
  if (
    (value.kind === "advance" ||
      value.kind === "advance_analysis" ||
      value.kind === "record_review" ||
      value.kind === "select_analysis" ||
      value.kind === "confirm_groups" ||
      value.kind === "compare") &&
    "runId" in value &&
    typeof value.runId === "string" &&
    value.runId.length > 0 &&
    value.runId.length <= 128 &&
    "revision" in value &&
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision > 0
  ) {
    if (
      value.kind === "record_review" &&
      Object.keys(value).length === 11 &&
      value.operationId === null &&
      "analysisId" in value &&
      typeof value.analysisId === "string" &&
      value.analysisId.length > 0 &&
      value.analysisId.length <= 128 &&
      "videoId" in value &&
      typeof value.videoId === "string" &&
      /^[A-Za-z0-9_-]{11}$/.test(value.videoId) &&
      "reviewId" in value &&
      typeof value.reviewId === "string" &&
      value.reviewId.length > 0 &&
      value.reviewId.length <= 128 &&
      "request" in value &&
      isReviewRequest(value.request)
    )
      return {
        ...base,
        kind: "record_review",
        runId: value.runId,
        revision: value.revision,
        analysisId: value.analysisId,
        videoId: value.videoId,
        reviewId: value.reviewId,
        request: value.request,
      };
    if (
      value.kind === "advance_analysis" &&
      Object.keys(value).length === 10 &&
      "analysisId" in value &&
      typeof value.analysisId === "string" &&
      value.analysisId.length > 0 &&
      value.analysisId.length <= 128 &&
      "analysisVersion" in value &&
      typeof value.analysisVersion === "number" &&
      Number.isSafeInteger(value.analysisVersion) &&
      value.analysisVersion > 0 &&
      "videoId" in value &&
      typeof value.videoId === "string" &&
      /^[A-Za-z0-9_-]{11}$/.test(value.videoId)
    )
      return {
        ...base,
        kind: "advance_analysis",
        runId: value.runId,
        revision: value.revision,
        analysisId: value.analysisId,
        analysisVersion: value.analysisVersion,
        videoId: value.videoId,
      };
    if (
      value.kind === "select_analysis" &&
      Object.keys(value).length === 8 &&
      value.operationId === null &&
      "videoId" in value &&
      typeof value.videoId === "string" &&
      /^[A-Za-z0-9_-]{11}$/.test(value.videoId)
    )
      return {
        ...base,
        kind: "select_analysis",
        runId: value.runId,
        revision: value.revision,
        videoId: value.videoId,
      };
    if (value.kind === "advance" && Object.keys(value).length === 7)
      return {
        ...base,
        kind: "advance",
        runId: value.runId,
        revision: value.revision,
      };
    if (
      (value.kind === "confirm_groups" || value.kind === "compare") &&
      Object.keys(value).length === (value.kind === "compare" ? 10 : 9) &&
      "groupsId" in value &&
      typeof value.groupsId === "string" &&
      value.groupsId.length > 0 &&
      value.groupsId.length <= 128 &&
      "groupsVersion" in value &&
      typeof value.groupsVersion === "number" &&
      Number.isSafeInteger(value.groupsVersion) &&
      value.groupsVersion > 0
    ) {
      if (value.kind === "compare") {
        if (
          !("confirmationId" in value) ||
          typeof value.confirmationId !== "string" ||
          !value.confirmationId.length ||
          value.confirmationId.length > 128
        )
          throw new Error("Registro local no válido.");
        return {
          ...base,
          kind: "compare",
          runId: value.runId,
          revision: value.revision,
          groupsId: value.groupsId,
          groupsVersion: value.groupsVersion,
          confirmationId: value.confirmationId,
        };
      }
      return {
        ...base,
        kind: "confirm_groups",
        runId: value.runId,
        revision: value.revision,
        groupsId: value.groupsId,
        groupsVersion: value.groupsVersion,
      };
    }
  }
  throw new Error("Registro local no válido.");
}

export function readReceipt(): CommandReceipt | null {
  return parseReceipt(localStorage.getItem(receiptStorageKey));
}
export function saveReceipt(receipt: CommandReceipt): void {
  // Preserve another tab's unconfirmed delivery instead of silently replacing it.
  const existing = readReceipt();
  if (existing && existing.key !== receipt.key)
    throw new Error("Existe una solicitud pendiente.");
  localStorage.setItem(receiptStorageKey, JSON.stringify(receipt));
}
export function clearReceipt(key: string): void {
  const current = readReceipt();
  if (current?.key === key) localStorage.removeItem(receiptStorageKey);
}
