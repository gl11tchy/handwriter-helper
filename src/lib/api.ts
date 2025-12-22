import type { UploadReportRequest, UploadReportResponse, GetReportResponse, AssignmentPayload } from "@/types";

const API_BASE = "";

// Assignment API types
export interface CreateAssignmentRequest {
  requiredLineCount: number;
  expectedStyle: "print" | "cursive";
  paperType?: "ruled" | "blank" | "either";
  numbering?: { required: false } | { required: true; startAt: number; format: "dot" | "paren" | "dash" };
  expectedContent: { mode: "perLine"; lines: string[] };
  notifyEmail?: string;
}

export interface CreateAssignmentResponse {
  assignmentId: string;
  payload: AssignmentPayload;
}

export interface GetAssignmentResponse {
  payload: AssignmentPayload;
  verified: boolean;
}

// OCR API types
export interface OcrRequest {
  imageB64: string;
}

export interface OcrSymbol {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  symbols: OcrSymbol[];
}

export interface OcrResponse {
  text: string;
  confidence: number;
  words: OcrWord[];
}

// Default timeout for API requests (30 seconds)
const DEFAULT_TIMEOUT = 30000;

async function request<T>(
  path: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Combine with any existing signal
  const signal = options.signal
    ? combineSignals(options.signal, controller.signal)
    : controller.signal;

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      signal,
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: "Request failed" }))) as {
        error?: string;
      };
      throw new Error(error.error || "Request failed");
    }

    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // Check if it was our timeout or an external abort
      if (controller.signal.aborted && !options.signal?.aborted) {
        throw new Error("Request timed out. Please check your connection and try again.");
      }
      throw new Error("Request was cancelled");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Combine multiple abort signals into one
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export const api = {
  // Create assignment (server-side signed)
  createAssignment: (data: CreateAssignmentRequest) =>
    request<CreateAssignmentResponse>("/api/assignment", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Get assignment (server-side verified)
  getAssignment: (assignmentId: string) =>
    request<GetAssignmentResponse>(`/api/assignment/${assignmentId}`),

  // Upload report
  uploadReport: (data: UploadReportRequest) =>
    request<UploadReportResponse>("/api/report", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Fetch report
  getReport: (reportId: string) => request<GetReportResponse>(`/api/report/${reportId}`),

  // Health check
  health: () => request<{ status: string }>("/api/health"),

  // OCR - Google Cloud Vision
  ocr: (imageB64: string) =>
    request<OcrResponse>("/api/ocr", {
      method: "POST",
      body: JSON.stringify({ imageB64 }),
    }),
};
