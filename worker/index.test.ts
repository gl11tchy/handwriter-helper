import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "./index";
import type { Env } from "./env";

// Response types for type assertions
type HealthResponse = { status: string; timestamp: string };
type ErrorResponse = { error: string };
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
    ...overrides,
  };
}

// Create mock request
function createRequest(
  url: string,
  options: RequestInit = {}
): Request {
  return new Request(`https://example.com${url}`, {
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "127.0.0.1",
      ...options.headers,
    },
    ...options,
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
    });

    it("returns 400 for invalid assignment ID format", async () => {
      const request = createRequest("/api/assignment/invalid!@#id");
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid assignment ID format");
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

      expect(response.status).toBe(500);
      expect(data.error).toContain("storage");
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
    });

    it("retrieves an encrypted report", async () => {
      // First upload a report
      const uploadRequest = new Request("https://example.com/api/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "127.0.0.1",
        },
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
    });

    it("returns 400 for invalid report ID format", async () => {
      const request = createRequest("/api/report/invalid!@#id");
      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid report ID");
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
        body: JSON.stringify({}),
      });

      const response = await worker.fetch(request, env);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(400);
      expect(data.error).toBe("Missing imageB64 in request body");
    });

    it("returns 503 when API key is not configured", async () => {
      const envWithoutKey = createMockEnv({ GOOGLE_CLOUD_API_KEY: "" });
      const request = createRequest("/api/ocr", {
        method: "POST",
        body: JSON.stringify({ imageB64: "test" }),
      });

      const response = await worker.fetch(request, envWithoutKey);
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(503);
      expect(data.error).toBe("OCR service not configured");
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
