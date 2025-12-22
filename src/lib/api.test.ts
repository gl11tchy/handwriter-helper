import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./api";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createMockResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  };
}

describe("api", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("health", () => {
    it("calls /api/health endpoint", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ status: "ok" })
      );

      const result = await api.health();

      expect(mockFetch).toHaveBeenCalledWith("/api/health", expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }));
      expect(result).toEqual({ status: "ok" });
    });
  });

  describe("createAssignment", () => {
    it("calls /api/assignment with POST method", async () => {
      const assignmentData = {
        requiredLineCount: 5,
        expectedStyle: "print" as const,
        paperType: "ruled" as const,
        numbering: { required: false as const },
        expectedContent: { mode: "perLine" as const, lines: ["Line 1", "Line 2"] },
      };

      const responseData = {
        assignmentId: "test-123",
        payload: { ...assignmentData, version: 1 },
      };

      mockFetch.mockResolvedValue(createMockResponse(responseData));

      const result = await api.createAssignment(assignmentData);

      expect(mockFetch).toHaveBeenCalledWith("/api/assignment", expect.objectContaining({
        method: "POST",
        body: JSON.stringify(assignmentData),
        headers: { "Content-Type": "application/json" },
      }));
      expect(result.assignmentId).toBe("test-123");
    });

    it("throws error on failed request", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: "Missing required fields" }, false, 400)
      );

      await expect(
        api.createAssignment({
          requiredLineCount: 0,
          expectedStyle: "print",
          expectedContent: { mode: "perLine", lines: [] },
        })
      ).rejects.toThrow("Missing required fields");
    });
  });

  describe("getAssignment", () => {
    it("calls /api/assignment/:id with GET method", async () => {
      const responseData = {
        payload: {
          version: 1,
          assignmentId: "test-123",
          requiredLineCount: 5,
          expectedStyle: "print",
        },
        verified: true,
      };

      mockFetch.mockResolvedValue(createMockResponse(responseData));

      const result = await api.getAssignment("test-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/assignment/test-123", expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }));
      expect(result.verified).toBe(true);
    });

    it("throws error for non-existent assignment", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: "Assignment not found" }, false, 404)
      );

      await expect(api.getAssignment("nonexistent")).rejects.toThrow(
        "Assignment not found"
      );
    });

    it("throws error for tampered assignment", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(
          { error: "This assignment link is invalid", tampered: true },
          false,
          403
        )
      );

      await expect(api.getAssignment("tampered-id")).rejects.toThrow(
        "This assignment link is invalid"
      );
    });
  });

  describe("uploadReport", () => {
    it("calls /api/report with POST method", async () => {
      const reportData = {
        ciphertextB64: "encrypted-data",
        nonceB64: "nonce-value",
        meta: {
          createdAt: new Date().toISOString(),
          size: 1024,
        },
      };

      mockFetch.mockResolvedValue(
        createMockResponse({ reportId: "report-456" }, true, 201)
      );

      const result = await api.uploadReport(reportData);

      expect(mockFetch).toHaveBeenCalledWith("/api/report", expect.objectContaining({
        method: "POST",
        body: JSON.stringify(reportData),
        headers: { "Content-Type": "application/json" },
      }));
      expect(result.reportId).toBe("report-456");
    });

    it("throws error for invalid report data", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: "Invalid request body" }, false, 400)
      );

      await expect(
        api.uploadReport({
          ciphertextB64: "",
          nonceB64: "",
          meta: { createdAt: "", size: 0 },
        })
      ).rejects.toThrow("Invalid request body");
    });
  });

  describe("getReport", () => {
    it("calls /api/report/:id with GET method", async () => {
      const responseData = {
        ciphertextB64: "encrypted-data",
        nonceB64: "nonce-value",
        meta: {
          createdAt: "2024-01-01T00:00:00Z",
          size: 1024,
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(responseData));

      const result = await api.getReport("report-456");

      expect(mockFetch).toHaveBeenCalledWith("/api/report/report-456", expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }));
      expect(result.ciphertextB64).toBe("encrypted-data");
    });

    it("throws error for non-existent report", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: "Report not found" }, false, 404)
      );

      await expect(api.getReport("nonexistent")).rejects.toThrow(
        "Report not found"
      );
    });
  });

  describe("ocr", () => {
    it("calls /api/ocr with POST method and image data", async () => {
      const imageB64 = "base64-image-data";
      const responseData = {
        text: "Hello World",
        confidence: 0.95,
        words: [
          {
            text: "Hello",
            confidence: 0.96,
            bbox: { x: 0, y: 0, w: 50, h: 20 },
            symbols: [],
          },
        ],
      };

      mockFetch.mockResolvedValue(createMockResponse(responseData));

      const result = await api.ocr(imageB64);

      expect(mockFetch).toHaveBeenCalledWith("/api/ocr", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ imageB64 }),
        headers: { "Content-Type": "application/json" },
      }));
      expect(result.text).toBe("Hello World");
      expect(result.confidence).toBe(0.95);
    });

    it("throws error when OCR service is unavailable", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: "OCR service not configured" }, false, 503)
      );

      await expect(api.ocr("image-data")).rejects.toThrow(
        "OCR service not configured"
      );
    });

    it("throws error for payload too large", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ error: "Payload too large" }, false, 413)
      );

      await expect(api.ocr("very-large-image")).rejects.toThrow(
        "Payload too large"
      );
    });
  });

  describe("error handling", () => {
    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(api.health()).rejects.toThrow("Network error");
    });

    it("handles malformed JSON response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
      });

      await expect(api.health()).rejects.toThrow("Request failed");
    });

    it("handles rate limiting", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(
          { error: "Too many requests. Please try again later." },
          false,
          429
        )
      );

      await expect(api.health()).rejects.toThrow("Too many requests");
    });
  });
});
