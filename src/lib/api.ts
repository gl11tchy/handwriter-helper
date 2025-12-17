import type { UploadReportRequest, UploadReportResponse, GetReportResponse } from "@/types";

const API_BASE = "";

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: "Request failed" }))) as {
      error?: string;
    };
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

export const api = {
  // Upload encrypted report blob
  uploadReport: (data: UploadReportRequest) =>
    request<UploadReportResponse>("/api/report", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Fetch encrypted report blob
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
