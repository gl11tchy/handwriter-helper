import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "./index";
import type { Env } from "./env";

// Response types for type assertions
type HealthResponse = { status: string; timestamp: string };
type ErrorResponse = {
  error: string;
  code?: string;
  retryable?: boolean;
  tampered?: boolean;
  requestId?: string;
};
type AssignmentCreateResponse = {
  assignmentId: string;
  payload: { requiredLineCount: number; expectedStyle: string; assignmentId: string };
};
type AssignmentGetResponse = {
  payload: { assignmentId: string };
  verified: boolean;
};
type ReportCreateResponse = { reportId: string };
type ReportGetResponse = {
  ciphertextB64: string;
  nonceB64: string;
  meta: { size: number };
};
type OcrResponse = { text: string; words: unknown[] };
type ClaudeVerificationResponse = {
  transcription: string;
  matchesExpected: boolean;
  confidence: "high" | "medium" | "low";
  reasoning?: string;
};

// Mock R2 storage
function createMockR2(): R2Bucket {
  const storage = new Map<string, string>();

  return {
    put: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
      return {} as R2Object;
    }),
    get: vi.fn(async (key: string) => {
      const value = storage.get(key);
      if (!value) return null;
      return {
        text: async () => value,
        json: async () => JSON.parse(value),
      } as R2ObjectBody;
    }),
    delete: vi.fn(),
    list: vi.fn(),
    head: vi.fn(),
  } as unknown as R2Bucket;
}

// Mock ASSETS Fetcher for SPA routing
function createMockAssets(): Fetcher {
  return {
    fetch: vi.fn(async () => {
      // Return a mock HTML response for SPA routes
      return new Response("<!DOCTYPE html><html><body>SPA</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }),
    connect: vi.fn(),
  } as unknown as Fetcher;
}

// Create mock environment
function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    STORAGE: createMockR2(),
    ASSETS: createMockAssets(),
    APP_URL: "https://example.com",
    ENVIRONMENT: "test",
    GOOGLE_CLOUD_API_KEY: "test-api-key",
    SIGNING_SECRET: "test-signing-secret",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    ...overrides,
  };
}

// Create mock request
let requestCounter = 1;
function createRequest(
  url: string,
  options: RequestInit = {}
): Request {
  const headers = new Headers(options.headers ?? {});
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  headers.set("CF-Connecting-IP", headers.get("CF-Connecting-IP") ?? `127.0.0.${requestCounter}`);
  if (typeof options.body === "string" && !headers.has("Content-Length")) {
    headers.set("Content-Length", String(options.body.length));
  }
  requestCounter = requestCounter >= 250 ? 1 : requestCounter + 1;

  return new Request(`https://example.com${url}`, {
    ...options,
    headers,
  });
}

describe("Worker", () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe("CORS", () => {
    it("handles OPTIONS preflight requests", async () => {
      const request = createRequest("/api/health", { method: "OPTIONS" });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://example.com"
      );
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "GET"
      );
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "POST"
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
        "X-Request-Id"
      );
    });

    it("includes CORS headers in all responses", async () => {
      const request = createRequest("/api/health");
      const response = await worker.fetch(request, env);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://example.com"
      );
    });
  });

  describe("Health endpoint", () => {
    it("returns ok status", async () => {
      const request = createRequest("/api/health");
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as HealthResponse;

      expect(response.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeDefined();
    });
  });

  describe("Request correlation", () => {
    it("echoes incoming X-Request-Id in headers and error payload", async () => {
      const request = createRequest("/api/ocr", {
        method: "POST",
        headers: {
          "X-Request-Id": "test-request-id-123",
        },
        body: JSON.stringify({}),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(response.headers.get("X-Request-Id")).toBe("test-request-id-123");
      expect(data.requestId).toBe("test-request-id-123");
    });

    it("generates X-Request-Id when missing", async () => {
      const request = createRequest("/api/ocr", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(response.headers.get("X-Request-Id")).toMatch(/^req-/);
      expect(data.requestId).toMatch(/^req-/);
    });

    it("writes structured failure logs with requestId", async () => {
      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("timeout while calling OCR provider"))
      );

      const request = createRequest("/api/ocr", {
        method: "POST",
        headers: {
          "X-Request-Id": "req-log-check",
          "CF-Connecting-IP": "192.168.30.1",
        },
        body: JSON.stringify({ imageB64: "test-image" }),
      });

      await worker.fetch(request, env);

      expect(logSpy).toHaveBeenCalledWith(
        "api_failure",
        expect.objectContaining({
          route: "/api/ocr",
          failureType: "ocr_upstream_failure",
          requestId: "req-log-check",
        })
      );

      logSpy.mockRestore();
    });
  });

  describe("Assignment endpoints", () => {
    it("creates an assignment", async () => {
      const request = createRequest("/api/assignment", {
        method: "POST",
        body: JSON.stringify({
          requiredLineCount: 5,
          expectedStyle: "print",
          paperType: "ruled",
          numbering: { required: false },
          expectedContent: { mode: "perLine", lines: ["Line 1", "Line 2"] },
        }),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as AssignmentCreateResponse;

      expect(response.status).toBe(201);
      expect(data.assignmentId).toBeDefined();
      expect(data.payload.requiredLineCount).toBe(5);
      expect(data.payload.expectedStyle).toBe("print");
      expect(env.STORAGE.put).toHaveBeenCalled();
    });

    it("rejects assignment with missing fields", async () => {
      const request = createRequest("/api/assignment", {
        method: "POST",
        body: JSON.stringify({
          expectedStyle: "print",
          // missing requiredLineCount and expectedContent
        }),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toContain("Missing required fields");
    });

    it("retrieves an assignment and verifies signature", async () => {
      // First create an assignment
      const assignmentCreateReq = new Request("https://example.com/api/assignment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "127.0.0.1",
        },
        body: JSON.stringify({
          requiredLineCount: 3,
          expectedStyle: "cursive",
          expectedContent: { mode: "perLine", lines: ["Test line"] },
        }),
      });

      const createResponse = await worker.fetch(assignmentCreateReq, env);
      const { assignmentId } = (await createResponse.json()) as AssignmentCreateResponse;

      // Then retrieve it
      const getRequest = createRequest(`/api/assignment/${assignmentId}`);
      const getResponse = await worker.fetch(getRequest, env);
      const getData = (await getResponse.json()) as AssignmentGetResponse;

      expect(getResponse.status).toBe(200);
      expect(getData.verified).toBe(true);
      expect(getData.payload.assignmentId).toBe(assignmentId);
    });

    it("returns 404 for non-existent assignment", async () => {
      const request = createRequest("/api/assignment/nonexistent-id");
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(404);
      expect(data.error).toBe("Assignment not found");
      expect(data.code).toBe("ASSIGNMENT_NOT_FOUND");
    });

    it("returns 400 for invalid assignment ID format", async () => {
      const request = createRequest("/api/assignment/invalid!@#id");
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid assignment ID format");
      expect(data.code).toBe("ASSIGNMENT_INVALID_ID");
    });

    it("returns 503 when signing secret is not configured", async () => {
      const envWithoutSecret = createMockEnv({ SIGNING_SECRET: "" });
      const request = createRequest("/api/assignment", {
        method: "POST",
        body: JSON.stringify({
          requiredLineCount: 5,
          expectedStyle: "print",
          expectedContent: { mode: "perLine", lines: ["Line 1"] },
        }),
      });

      const response = await worker.fetch(request, envWithoutSecret);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(503);
      expect(data.error).toBe("Signing service not configured");
      expect(data.code).toBe("SIGNING_SERVICE_UNAVAILABLE");
    });

    it("returns 503 when signing secret is missing during GET", async () => {
      // First create an assignment with a valid env
      const createResponse = await worker.fetch(
        createRequest("/api/assignment", {
          method: "POST",
          body: JSON.stringify({
            requiredLineCount: 3,
            expectedStyle: "cursive",
            expectedContent: { mode: "perLine", lines: ["Test line"] },
          }),
        }),
        env
      );
      const { assignmentId } = (await createResponse.json()) as AssignmentCreateResponse;

      // Try to retrieve with missing signing secret
      const envWithoutSecret = { ...env, SIGNING_SECRET: "" };
      const getRequest = createRequest(`/api/assignment/${assignmentId}`);
      const getResponse = await worker.fetch(getRequest, envWithoutSecret);
      const getData = (await getResponse.json()) as ErrorResponse;

      expect(getResponse.status).toBe(503);
      expect(getData.error).toBe("Signing service not configured");
      expect(getData.code).toBe("SIGNING_SERVICE_UNAVAILABLE");
    });

    it("handles corrupted JSON in storage gracefully", async () => {
      // Manually put corrupted data in storage
      const assignmentId = "test-corrupted-json";
      await env.STORAGE.put(
        `assignments/${assignmentId}.json`,
        "not valid json {{{",
        { httpMetadata: { contentType: "application/json" } }
      );

      const request = createRequest(`/api/assignment/${assignmentId}`);
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(500);
      expect(data.error).toContain("corrupted");
    });

    it("handles missing payload in stored data", async () => {
      // Manually put data missing the payload field
      const assignmentId = "test-missing-payload";
      await env.STORAGE.put(
        `assignments/${assignmentId}.json`,
        JSON.stringify({ signature: "some-signature" }),
        { httpMetadata: { contentType: "application/json" } }
      );

      const request = createRequest(`/api/assignment/${assignmentId}`);
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(500);
      expect(data.error).toContain("incomplete");
    });

    it("handles missing signature in stored data", async () => {
      // Manually put data missing the signature field
      const assignmentId = "test-missing-signature";
      await env.STORAGE.put(
        `assignments/${assignmentId}.json`,
        JSON.stringify({ payload: { assignmentId: "test", version: 1 } }),
        { httpMetadata: { contentType: "application/json" } }
      );

      const request = createRequest(`/api/assignment/${assignmentId}`);
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(500);
      expect(data.error).toContain("incomplete");
    });

    it("returns 403 for tampered payload", async () => {
      // First create a valid assignment
      const createResponse = await worker.fetch(
        createRequest("/api/assignment", {
          method: "POST",
          body: JSON.stringify({
            requiredLineCount: 3,
            expectedStyle: "cursive",
            expectedContent: { mode: "perLine", lines: ["Test line"] },
          }),
        }),
        env
      );
      const { assignmentId } = (await createResponse.json()) as AssignmentCreateResponse;

      // Get the stored data and tamper with it
      const stored = await env.STORAGE.get(`assignments/${assignmentId}.json`);
      const data = await stored!.json() as { payload: Record<string, unknown>; signature: string };

      // Modify the payload but keep the original signature
      data.payload.requiredLineCount = 999;
      await env.STORAGE.put(
        `assignments/${assignmentId}.json`,
        JSON.stringify(data),
        { httpMetadata: { contentType: "application/json" } }
      );

      const request = createRequest(`/api/assignment/${assignmentId}`);
      const response = await worker.fetch(request, env);
      const responseData = (await response.json()) as ErrorResponse & { tampered?: boolean };

      expect(response.status).toBe(403);
      expect(responseData.tampered).toBe(true);
      expect(responseData.error).toContain("invalid");
      expect(responseData.code).toBe("ASSIGNMENT_TAMPERED");
    });

    it("returns 403 for invalid base64 signature", async () => {
      // Manually put data with an invalid signature (not valid base64)
      const assignmentId = "test-invalid-sig";
      await env.STORAGE.put(
        `assignments/${assignmentId}.json`,
        JSON.stringify({
          payload: {
            version: 1,
            assignmentId: "test-invalid-sig",
            createdAt: new Date().toISOString(),
            requiredLineCount: 3,
            expectedStyle: "print",
            paperType: "ruled",
            numbering: { required: false },
            expectedContent: { mode: "perLine", lines: ["Test"] },
            precisionMode: "max",
          },
          signature: "!!!not-valid-base64!!!",
        }),
        { httpMetadata: { contentType: "application/json" } }
      );

      const request = createRequest(`/api/assignment/${assignmentId}`);
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse & { tampered?: boolean };

      expect(response.status).toBe(403);
      expect(data.tampered).toBe(true);
      expect(data.code).toBe("ASSIGNMENT_TAMPERED");
    });

    it("handles storage errors gracefully", async () => {
      // Create an env with a failing storage
      const failingStorage = {
        ...createMockR2(),
        get: vi.fn().mockRejectedValue(new Error("Storage unavailable")),
      } as unknown as R2Bucket;
      const envWithFailingStorage = createMockEnv({ STORAGE: failingStorage });

      const request = createRequest("/api/assignment/some-id");
      const response = await worker.fetch(request, envWithFailingStorage);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(503);
      expect(data.error).toContain("storage");
      expect(data.code).toBe("ASSIGNMENT_STORAGE_FAILURE");
      expect(data.retryable).toBe(true);
    });

    it("returns 503 when assignment storage fails during create", async () => {
      const failingStorage = {
        ...createMockR2(),
        put: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
      } as unknown as R2Bucket;
      const envWithFailingStorage = createMockEnv({ STORAGE: failingStorage });

      const request = createRequest("/api/assignment", {
        method: "POST",
        body: JSON.stringify({
          requiredLineCount: 5,
          expectedStyle: "print",
          expectedContent: { mode: "perLine", lines: ["Line 1"] },
        }),
      });

      const response = await worker.fetch(request, envWithFailingStorage);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(503);
      expect(data.code).toBe("ASSIGNMENT_STORAGE_FAILURE");
      expect(data.retryable).toBe(true);
    });

    it("verifies signature correctly when payload has all fields", async () => {
      // Create assignment with all optional fields
      const createResponse = await worker.fetch(
        createRequest("/api/assignment", {
          method: "POST",
          body: JSON.stringify({
            requiredLineCount: 5,
            expectedStyle: "print",
            paperType: "ruled",
            numbering: { required: true, startAt: 1, format: "dot" },
            expectedContent: { mode: "perLine", lines: ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5"] },
          }),
        }),
        env
      );

      expect(createResponse.status).toBe(201);
      const { assignmentId, payload } = (await createResponse.json()) as AssignmentCreateResponse & { payload: Record<string, unknown> };

      // Verify all fields are present in payload
      expect(payload.version).toBe(1);
      expect(payload.assignmentId).toBe(assignmentId);
      expect(payload.requiredLineCount).toBe(5);
      expect(payload.expectedStyle).toBe("print");
      expect(payload.paperType).toBe("ruled");
      expect(payload.precisionMode).toBe("max");

      // Now retrieve it
      const getResponse = await worker.fetch(
        createRequest(`/api/assignment/${assignmentId}`),
        env
      );

      expect(getResponse.status).toBe(200);
      const getData = (await getResponse.json()) as AssignmentGetResponse;
      expect(getData.verified).toBe(true);
    });

    it("rejects assignment with empty lines array", async () => {
      const request = createRequest("/api/assignment", {
        method: "POST",
        body: JSON.stringify({
          requiredLineCount: 5,
          expectedStyle: "print",
          expectedContent: { mode: "perLine", lines: [] },
        }),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toBe("Missing required fields");
    });
  });

  describe("Report endpoints", () => {
    it("uploads an encrypted report", async () => {
      const request = createRequest("/api/report", {
        method: "POST",
        body: JSON.stringify({
          ciphertextB64: "encrypted-data-here",
          nonceB64: "nonce-value-here",
          meta: {
            createdAt: new Date().toISOString(),
            size: 1024,
          },
        }),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ReportCreateResponse;

      expect(response.status).toBe(201);
      expect(data.reportId).toBeDefined();
      expect(env.STORAGE.put).toHaveBeenCalled();
    });

    it("rejects report with missing fields", async () => {
      const request = createRequest("/api/report", {
        method: "POST",
        body: JSON.stringify({
          ciphertextB64: "data",
          // missing nonceB64 and meta
        }),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid request body");
      expect(data.code).toBe("REPORT_INVALID_REQUEST");
    });

    it("retrieves an encrypted report", async () => {
      // First upload a report
      const uploadRequest = createRequest("/api/report", {
        method: "POST",
        body: JSON.stringify({
          ciphertextB64: "test-encrypted-data",
          nonceB64: "test-nonce",
          meta: {
            createdAt: "2024-01-01T00:00:00Z",
            size: 512,
          },
        }),
      });

      const uploadResponse = await worker.fetch(uploadRequest, env);
      const { reportId } = (await uploadResponse.json()) as ReportCreateResponse;

      // Then retrieve it
      const getRequest = createRequest(`/api/report/${reportId}`);
      const getResponse = await worker.fetch(getRequest, env);
      const getData = (await getResponse.json()) as ReportGetResponse;

      expect(getResponse.status).toBe(200);
      expect(getData.ciphertextB64).toBe("test-encrypted-data");
      expect(getData.nonceB64).toBe("test-nonce");
      expect(getData.meta.size).toBe(512);
    });

    it("returns 404 for non-existent report", async () => {
      const request = createRequest("/api/report/nonexistent-id");
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(404);
      expect(data.error).toBe("Report not found");
      expect(data.code).toBe("REPORT_NOT_FOUND");
    });

    it("returns 400 for invalid report ID format", async () => {
      const request = createRequest("/api/report/invalid!@#id");
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid report ID");
      expect(data.code).toBe("REPORT_INVALID_ID");
    });

    it("returns 503 when report storage fails during upload", async () => {
      const failingStorage = {
        ...createMockR2(),
        put: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
      } as unknown as R2Bucket;
      const envWithFailingStorage = createMockEnv({ STORAGE: failingStorage });

      const request = createRequest("/api/report", {
        method: "POST",
        body: JSON.stringify({
          ciphertextB64: "data",
          nonceB64: "nonce",
          meta: {
            createdAt: new Date().toISOString(),
            size: 256,
          },
        }),
      });

      const response = await worker.fetch(request, envWithFailingStorage);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(503);
      expect(data.code).toBe("REPORT_STORAGE_FAILURE");
      expect(data.retryable).toBe(true);
    });

    it("returns 411 when report upload Content-Length header is missing", async () => {
      const request = createRequest("/api/report", {
        method: "POST",
        body: JSON.stringify({
          ciphertextB64: "data",
          nonceB64: "nonce",
          meta: {
            createdAt: new Date().toISOString(),
            size: 256,
          },
        }),
      });
      request.headers.delete("Content-Length");

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(411);
      expect(data.code).toBe("REPORT_CONTENT_LENGTH_REQUIRED");
    });

    it("returns 400 when report upload Content-Length header is invalid", async () => {
      const request = createRequest("/api/report", {
        method: "POST",
        headers: { "Content-Length": "-1" },
        body: JSON.stringify({
          ciphertextB64: "data",
          nonceB64: "nonce",
          meta: {
            createdAt: new Date().toISOString(),
            size: 256,
          },
        }),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.code).toBe("REPORT_INVALID_CONTENT_LENGTH");
    });
  });

  describe("OCR endpoint", () => {
    beforeEach(() => {
      // Mock global fetch for Google Vision API
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            responses: [
              {
                fullTextAnnotation: {
                  text: "Hello World",
                  pages: [
                    {
                      blocks: [
                        {
                          paragraphs: [
                            {
                              words: [
                                {
                                  symbols: [
                                    {
                                      text: "H",
                                      confidence: 0.99,
                                      boundingBox: {
                                        vertices: [
                                          { x: 0, y: 0 },
                                          { x: 10, y: 0 },
                                          { x: 10, y: 20 },
                                          { x: 0, y: 20 },
                                        ],
                                      },
                                    },
                                  ],
                                  confidence: 0.99,
                                  boundingBox: {
                                    vertices: [
                                      { x: 0, y: 0 },
                                      { x: 50, y: 0 },
                                      { x: 50, y: 20 },
                                      { x: 0, y: 20 },
                                    ],
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          }),
        })
      );
    });

    it("processes OCR request successfully", async () => {
      const request = createRequest("/api/ocr", {
        method: "POST",
        headers: { "CF-Connecting-IP": "192.168.20.1" },
        body: JSON.stringify({
          imageB64: "base64-image-data",
        }),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as OcrResponse;

      expect(response.status).toBe(200);
      expect(data.text).toBe("Hello World");
      expect(data.words).toBeDefined();
    });

    it("returns 400 for missing image data", async () => {
      const request = createRequest("/api/ocr", {
        method: "POST",
        headers: { "CF-Connecting-IP": "192.168.20.2" },
        body: JSON.stringify({}),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toBe("Missing imageB64 in request body");
      expect(data.code).toBe("OCR_INVALID_REQUEST");
    });

    it("returns 503 when API key is not configured", async () => {
      const envWithoutKey = createMockEnv({ GOOGLE_CLOUD_API_KEY: "" });
      const request = createRequest("/api/ocr", {
        method: "POST",
        headers: { "CF-Connecting-IP": "192.168.20.3" },
        body: JSON.stringify({ imageB64: "test" }),
      });

      const response = await worker.fetch(request, envWithoutKey);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(503);
      expect(data.error).toBe("OCR service not configured");
      expect(data.code).toBe("OCR_SERVICE_UNAVAILABLE");
    });

    it("returns 411 when Content-Length header is missing", async () => {
      const request = createRequest("/api/ocr", {
        method: "POST",
        headers: { "CF-Connecting-IP": "192.168.20.31" },
        body: JSON.stringify({ imageB64: "test-image" }),
      });
      request.headers.delete("Content-Length");

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(411);
      expect(data.code).toBe("OCR_CONTENT_LENGTH_REQUIRED");
    });

    it("returns structured retryable code on OCR upstream failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => "upstream failure",
        })
      );

      const request = createRequest("/api/ocr", {
        method: "POST",
        headers: { "CF-Connecting-IP": "192.168.20.4" },
        body: JSON.stringify({ imageB64: "test-image" }),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(502);
      expect(data.code).toBe("OCR_UPSTREAM_FAILURE");
      expect(data.retryable).toBe(true);
    });

    it("returns timeout code on OCR upstream timeout", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("timeout while calling OCR provider"))
      );

      const request = createRequest("/api/ocr", {
        method: "POST",
        headers: { "CF-Connecting-IP": "192.168.20.5" },
        body: JSON.stringify({ imageB64: "test-image" }),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(504);
      expect(data.code).toBe("OCR_UPSTREAM_TIMEOUT");
      expect(data.retryable).toBe(true);
    });
  });

  describe("Claude verification endpoint", () => {
    beforeEach(() => {
      // Mock global fetch for Anthropic API
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  transcription: "Hello World",
                  matchesExpected: true,
                  confidence: "high",
                }),
              },
            ],
            stop_reason: "end_turn",
          }),
        })
      );
    });

    // Helper to create requests with unique IPs to avoid rate limiting
    function createClaudeRequest(body: unknown, ip: string, includeContentLength = true) {
      const bodyStr = JSON.stringify(body);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "CF-Connecting-IP": ip,
      };
      if (includeContentLength) {
        headers["Content-Length"] = String(bodyStr.length);
      }
      return new Request("https://example.com/api/verify-with-claude", {
        method: "POST",
        headers,
        body: bodyStr,
      });
    }

    it("processes Claude verification request successfully", async () => {
      const request = createClaudeRequest({
        imageB64: "base64-image-data",
        expectedText: "Hello World",
        lineIndex: 0,
      }, "192.168.10.1");

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ClaudeVerificationResponse;

      expect(response.status).toBe(200);
      expect(data.transcription).toBe("Hello World");
      expect(data.matchesExpected).toBe(true);
      expect(data.confidence).toBe("high");
    });

    it("returns 503 when ANTHROPIC_API_KEY not configured", async () => {
      const envWithoutKey = createMockEnv({ ANTHROPIC_API_KEY: undefined });
      const request = createClaudeRequest({
        imageB64: "test",
        expectedText: "test",
        lineIndex: 0,
      }, "192.168.10.2");

      const response = await worker.fetch(request, envWithoutKey);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(503);
      expect(data.error).toBe("Claude verification service not configured");
      expect(data.code).toBe("CLAUDE_SERVICE_UNAVAILABLE");
    });

    it("returns 400 when missing required fields", async () => {
      const request = createClaudeRequest({
        lineIndex: 0,
        // missing imageB64 and expectedText
      }, "192.168.10.3");

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toContain("Missing required fields");
      expect(data.code).toBe("CLAUDE_INVALID_REQUEST");
    });

    it("returns 411 when Content-Length header is missing", async () => {
      const request = createClaudeRequest({
        imageB64: "test-image",
        expectedText: "test",
        lineIndex: 0,
      }, "192.168.10.7", false); // Don't include Content-Length

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(411);
      expect(data.error).toBe("Content-Length header is required");
      expect(data.code).toBe("CLAUDE_CONTENT_LENGTH_REQUIRED");
    });

    it("returns 400 when imageB64 is empty", async () => {
      const request = createClaudeRequest({
        imageB64: "",
        expectedText: "Hello",
        lineIndex: 0,
      }, "192.168.10.4");

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toContain("Missing required fields");
      expect(data.code).toBe("CLAUDE_INVALID_REQUEST");
    });

    it("handles Claude API errors gracefully", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => "Internal server error",
        })
      );

      const request = createClaudeRequest({
        imageB64: "test-image",
        expectedText: "test",
        lineIndex: 0,
      }, "192.168.10.5");

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(502);
      expect(data.error).toContain("Claude verification failed");
      expect(data.code).toBe("CLAUDE_UPSTREAM_FAILURE");
      expect(data.retryable).toBe(true);
    });

    it("returns timeout code when Claude upstream times out", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("timeout during Claude call"))
      );

      const request = createClaudeRequest({
        imageB64: "test-image",
        expectedText: "test",
        lineIndex: 0,
      }, "192.168.10.8");

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(504);
      expect(data.code).toBe("CLAUDE_UPSTREAM_TIMEOUT");
      expect(data.retryable).toBe(true);
    });

    it("handles mismatched content correctly", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  transcription: "Helo Wrld",
                  matchesExpected: false,
                  confidence: "medium",
                  reasoning: "Multiple spelling errors detected",
                }),
              },
            ],
            stop_reason: "end_turn",
          }),
        })
      );

      const request = createClaudeRequest({
        imageB64: "base64-image-data",
        expectedText: "Hello World",
        lineIndex: 0,
      }, "192.168.10.6");

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ClaudeVerificationResponse;

      expect(response.status).toBe(200);
      expect(data.transcription).toBe("Helo Wrld");
      expect(data.matchesExpected).toBe(false);
      expect(data.confidence).toBe("medium");
      expect(data.reasoning).toBe("Multiple spelling errors detected");
    });
  });

  describe("404 handling", () => {
    it("returns 404 for unknown API routes", async () => {
      // Use a unique IP to avoid rate limiting from previous tests
      const request = new Request("https://example.com/api/unknown", {
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "192.168.1.100",
        },
      });
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(404);
      expect(data.error).toBe("Not found");
      expect(data.code).toBe("ROUTE_NOT_FOUND");
    });
  });

  describe("SPA routing", () => {
    it("serves frontend for root path via ASSETS", async () => {
      const request = createRequest("/");
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(env.ASSETS.fetch).toHaveBeenCalled();
    });

    it("serves frontend for /a/:id routes via ASSETS", async () => {
      const request = createRequest("/a/test-assignment-123");
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(env.ASSETS.fetch).toHaveBeenCalled();
    });

    it("serves frontend for /r/:id routes via ASSETS", async () => {
      const request = createRequest("/r/test-report-456");
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(env.ASSETS.fetch).toHaveBeenCalled();
    });
  });
});
