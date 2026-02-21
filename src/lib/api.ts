import type { UploadReportRequest, UploadReportResponse, GetReportResponse, AssignmentPayload, ClaudeVerificationRequest, ClaudeVerificationResponse } from "@/types";

const API_BASE = "";

interface ErrorResponsePayload {
  error?: string;
  code?: string;
  retryable?: boolean;
  requestId?: string;
}

interface ApiErrorOptions {
  code?: string;
  status?: number;
  retryable?: boolean;
  requestId?: string;
}

const ERROR_MESSAGE_BY_CODE: Record<string, string> = {
  OCR_UPSTREAM_TIMEOUT: "OCR timed out. Please try again.",
  OCR_UPSTREAM_FAILURE: "OCR service is temporarily unavailable. Please try again.",
  CLAUDE_UPSTREAM_TIMEOUT: "Claude verification timed out. Please try again.",
  CLAUDE_UPSTREAM_FAILURE: "Claude verification is temporarily unavailable. Please try again.",
  REPORT_STORAGE_FAILURE: "Report storage is temporarily unavailable. Please try again.",
  REQUEST_TIMEOUT: "Request timed out. Please check your connection and try again.",
  RATE_LIMITED: "Too many requests. Please wait a minute and try again.",
};

export class ApiError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId;
  }
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code && ERROR_MESSAGE_BY_CODE[error.code]) {
      return ERROR_MESSAGE_BY_CODE[error.code];
    }
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

export function isRetryableApiError(error: unknown): boolean {
  return error instanceof ApiError ? error.retryable : false;
}

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
      const errorPayload = (await response.json().catch(() => ({ error: "Request failed" }))) as ErrorResponsePayload;
      const headerRequestId = response.headers.get("X-Request-Id") ?? undefined;
      throw new ApiError(errorPayload.error || "Request failed", {
        code: errorPayload.code,
        status: response.status,
        retryable: errorPayload.retryable ?? response.status >= 500,
        requestId: errorPayload.requestId ?? headerRequestId,
      });
    }

    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // Check if it was our timeout or an external abort
      if (controller.signal.aborted && !options.signal?.aborted) {
        throw new ApiError("Request timed out. Please check your connection and try again.", {
          code: "REQUEST_TIMEOUT",
          retryable: true,
        });
      }
      throw new ApiError("Request was cancelled", {
        code: "REQUEST_CANCELLED",
        retryable: false,
      });
    }
    if (err instanceof ApiError) {
      throw err;
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

  // Claude Vision verification for uncertain OCR results
  verifyWithClaude: (data: ClaudeVerificationRequest) =>
    request<ClaudeVerificationResponse>("/api/verify-with-claude", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
