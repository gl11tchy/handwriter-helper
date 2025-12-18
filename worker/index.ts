import type { Env } from "./env";

export type { Env };

// Rate limiting map (in production, use Durable Objects or external store)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per window
const MAX_PAYLOAD_SIZE = 25 * 1024 * 1024; // 25MB

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

function getClientIP(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ||
         request.headers.get("X-Forwarded-For")?.split(",")[0] ||
         "unknown";
}

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${timestamp}-${random}`;
}

// HMAC signing for tamper detection
async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return arrayBufferToBase64Url(signature);
}

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBuffer = base64UrlToArrayBuffer(signature);
  return crypto.subtle.verify("HMAC", key, sigBuffer, encoder.encode(payload));
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

interface ReportMeta {
  createdAt: string;
  size: number;
}

interface UploadRequest {
  ciphertextB64: string;
  nonceB64: string;
  meta: ReportMeta;
}

interface OcrRequest {
  imageB64: string; // Base64-encoded image data (without data URL prefix)
}

// Assignment types
interface AssignmentPayload {
  version: 1;
  assignmentId: string;
  createdAt: string;
  requiredLineCount: number;
  expectedStyle: "print" | "cursive";
  paperType: "ruled" | "blank" | "either";
  numbering: { required: false } | { required: true; startAt: number; format: "dot" | "paren" | "dash" };
  expectedContent: { mode: "perLine"; lines: string[] };
  precisionMode: "max";
}

interface CreateAssignmentRequest {
  requiredLineCount: number;
  expectedStyle: "print" | "cursive";
  paperType: "ruled" | "blank" | "either";
  numbering: { required: false } | { required: true; startAt: number; format: "dot" | "paren" | "dash" };
  expectedContent: { mode: "perLine"; lines: string[] };
}

interface StoredAssignment {
  payload: AssignmentPayload;
  signature: string;
}

interface GoogleVisionResponse {
  responses: Array<{
    fullTextAnnotation?: {
      text: string;
      pages: Array<{
        blocks: Array<{
          paragraphs: Array<{
            words: Array<{
              symbols: Array<{
                text: string;
                confidence: number;
                boundingBox?: {
                  vertices: Array<{ x: number; y: number }>;
                };
              }>;
              confidence: number;
              boundingBox?: {
                vertices: Array<{ x: number; y: number }>;
              };
            }>;
            confidence: number;
            boundingBox?: {
              vertices: Array<{ x: number; y: number }>;
            };
          }>;
        }>;
      }>;
    };
    textAnnotations?: Array<{
      description: string;
      boundingPoly?: {
        vertices: Array<{ x: number; y: number }>;
      };
    }>;
    error?: {
      code: number;
      message: string;
    };
  }>;
}

interface OcrResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x: number; y: number; w: number; h: number };
    symbols: Array<{
      text: string;
      confidence: number;
      bbox: { x: number; y: number; w: number; h: number };
    }>;
  }>;
}

function verticesToBbox(vertices: Array<{ x: number; y: number }> | undefined): { x: number; y: number; w: number; h: number } {
  if (!vertices || vertices.length < 4) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  const xs = vertices.map(v => v.x || 0);
  const ys = vertices.map(v => v.y || 0);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

async function callGoogleVisionOCR(imageB64: string, apiKey: string): Promise<OcrResult> {
  const requestBody = {
    requests: [
      {
        image: { content: imageB64 },
        features: [
          { type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }
        ],
        imageContext: {
          languageHints: ["en"]
        }
      }
    ]
  };

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Vision API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as GoogleVisionResponse;

  if (!data.responses || data.responses.length === 0) {
    throw new Error("Google Vision API returned empty response");
  }

  if (data.responses[0].error) {
    throw new Error(`Google Vision API error: ${data.responses[0].error.message}`);
  }

  const fullText = data.responses[0].fullTextAnnotation;

  if (!fullText) {
    return { text: "", confidence: 0, words: [] };
  }

  // Extract words with symbols and bounding boxes
  const words: OcrResult["words"] = [];
  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const page of fullText.pages || []) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          const symbols = (word.symbols || []).map(symbol => ({
            text: symbol.text,
            confidence: symbol.confidence || 0,
            bbox: verticesToBbox(symbol.boundingBox?.vertices),
          }));

          const wordText = symbols.map(s => s.text).join("");
          const wordConfidence = word.confidence || 0;

          words.push({
            text: wordText,
            confidence: wordConfidence,
            bbox: verticesToBbox(word.boundingBox?.vertices),
            symbols,
          });

          totalConfidence += wordConfidence;
          confidenceCount++;
        }
      }
    }
  }

  const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

  return {
    text: fullText.text || "",
    confidence: avgConfidence,
    words,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Default CORS headers for error responses
    const defaultCorsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    try {
      const url = new URL(request.url);
      const clientIP = getClientIP(request);

      // CORS headers - allow the app origin
      const corsHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": env.APP_URL || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      };

      // Handle preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Apply rate limiting to all API routes
      if (url.pathname.startsWith("/api/")) {
        if (!checkRateLimit(clientIP)) {
          return Response.json(
            { error: "Too many requests. Please try again later." },
            { status: 429, headers: corsHeaders }
          );
        }
      }

      // Only handle /api/* routes - serve static assets for frontend routes
      if (!url.pathname.startsWith("/api/")) {
        return env.ASSETS.fetch(request);
      }
      // Health check
      if (url.pathname === "/api/health") {
        return Response.json(
          { status: "ok", timestamp: new Date().toISOString() },
          { headers: corsHeaders }
        );
      }

      // OCR endpoint - uses Google Cloud Vision
      if (url.pathname === "/api/ocr" && request.method === "POST") {
        // Check content length (images can be large)
        const contentLength = parseInt(request.headers.get("Content-Length") || "0");
        if (contentLength > MAX_PAYLOAD_SIZE) {
          return Response.json(
            { error: `Payload too large. Maximum size is ${MAX_PAYLOAD_SIZE / (1024 * 1024)}MB.` },
            { status: 413, headers: corsHeaders }
          );
        }

        if (!env.GOOGLE_CLOUD_API_KEY) {
          return Response.json(
            { error: "OCR service not configured" },
            { status: 503, headers: corsHeaders }
          );
        }

        const body = await request.json() as OcrRequest;

        if (!body.imageB64) {
          return Response.json(
            { error: "Missing imageB64 in request body" },
            { status: 400, headers: corsHeaders }
          );
        }

        try {
          const result = await callGoogleVisionOCR(body.imageB64, env.GOOGLE_CLOUD_API_KEY);
          return Response.json(result, { headers: corsHeaders });
        } catch (error) {
          console.error("OCR error:", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "OCR processing failed" },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // Create assignment - signs and stores it
      if (url.pathname === "/api/assignment" && request.method === "POST") {
        if (!env.SIGNING_SECRET) {
          return Response.json(
            { error: "Signing service not configured" },
            { status: 503, headers: corsHeaders }
          );
        }

        const body = await request.json() as CreateAssignmentRequest;

        // Validate required fields
        if (!body.requiredLineCount || !body.expectedStyle || !body.expectedContent?.lines) {
          return Response.json(
            { error: "Missing required fields" },
            { status: 400, headers: corsHeaders }
          );
        }

        const assignmentId = generateId();
        const payload: AssignmentPayload = {
          version: 1,
          assignmentId,
          createdAt: new Date().toISOString(),
          requiredLineCount: body.requiredLineCount,
          expectedStyle: body.expectedStyle,
          paperType: body.paperType || "either",
          numbering: body.numbering || { required: false },
          expectedContent: body.expectedContent,
          precisionMode: "max",
        };

        // Sign the payload
        const payloadJson = JSON.stringify(payload);
        const signature = await signPayload(payloadJson, env.SIGNING_SECRET);

        // Store in R2
        const stored: StoredAssignment = { payload, signature };
        await env.STORAGE.put(`assignments/${assignmentId}.json`, JSON.stringify(stored), {
          httpMetadata: { contentType: "application/json" },
        });

        return Response.json(
          { assignmentId, payload },
          { status: 201, headers: corsHeaders }
        );
      }

      // Get assignment - verifies signature, returns tampered status
      if (url.pathname.startsWith("/api/assignment/") && request.method === "GET") {
        const assignmentId = url.pathname.replace("/api/assignment/", "");

        if (!/^[a-z0-9-]+$/i.test(assignmentId)) {
          return Response.json(
            { error: "Invalid assignment ID" },
            { status: 400, headers: corsHeaders }
          );
        }

        let object;
        try {
          object = await env.STORAGE.get(`assignments/${assignmentId}.json`);
        } catch (storageError) {
          console.error("Storage error fetching assignment:", storageError);
          return Response.json(
            { error: "Failed to fetch assignment from storage" },
            { status: 500, headers: corsHeaders }
          );
        }

        if (!object) {
          return Response.json(
            { error: "Assignment not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        let stored: StoredAssignment;
        try {
          stored = await object.json() as StoredAssignment;
        } catch (parseError) {
          console.error("JSON parse error for assignment:", parseError);
          return Response.json(
            { error: "Assignment data is corrupted" },
            { status: 500, headers: corsHeaders }
          );
        }

        // Validate stored data structure
        if (!stored || !stored.payload || !stored.signature) {
          console.error("Invalid stored assignment structure:", { hasPayload: !!stored?.payload, hasSignature: !!stored?.signature });
          return Response.json(
            { error: "Assignment data is incomplete or corrupted" },
            { status: 500, headers: corsHeaders }
          );
        }

        // Verify signature
        if (!env.SIGNING_SECRET) {
          return Response.json(
            { error: "Signing service not configured" },
            { status: 503, headers: corsHeaders }
          );
        }

        let valid: boolean;
        try {
          const payloadJson = JSON.stringify(stored.payload);
          valid = await verifySignature(payloadJson, stored.signature, env.SIGNING_SECRET);
        } catch (verifyError) {
          console.error("Signature verification error:", verifyError);
          return Response.json(
            { error: "This assignment link is invalid or has been modified. Please request a new link from your teacher.", tampered: true },
            { status: 403, headers: corsHeaders }
          );
        }

        if (!valid) {
          return Response.json(
            { error: "This assignment link is invalid or has been modified. Please request a new link from your teacher.", tampered: true },
            { status: 403, headers: corsHeaders }
          );
        }

        return Response.json(
          { payload: stored.payload, verified: true },
          { headers: corsHeaders }
        );
      }

      // Upload encrypted report
      if (url.pathname === "/api/report" && request.method === "POST") {
        // Check content length
        const contentLength = parseInt(request.headers.get("Content-Length") || "0");
        if (contentLength > MAX_PAYLOAD_SIZE) {
          return Response.json(
            { error: `Payload too large. Maximum size is ${MAX_PAYLOAD_SIZE / (1024 * 1024)}MB.` },
            { status: 413, headers: corsHeaders }
          );
        }

        const body = await request.json() as UploadRequest;

        // Validate request
        if (!body.ciphertextB64 || !body.nonceB64 || !body.meta) {
          return Response.json(
            { error: "Invalid request body" },
            { status: 400, headers: corsHeaders }
          );
        }

        // Generate report ID
        const reportId = generateId();

        // Store encrypted blob in R2
        const data = JSON.stringify({
          ciphertextB64: body.ciphertextB64,
          nonceB64: body.nonceB64,
          meta: body.meta,
        });

        await env.STORAGE.put(`reports/${reportId}.json.enc`, data, {
          httpMetadata: {
            contentType: "application/json",
          },
          customMetadata: {
            createdAt: body.meta.createdAt,
            size: String(body.meta.size),
          },
        });

        return Response.json(
          { reportId },
          { status: 201, headers: corsHeaders }
        );
      }

      // Get encrypted report
      if (url.pathname.startsWith("/api/report/") && request.method === "GET") {
        const reportId = url.pathname.replace("/api/report/", "");

        // Validate report ID format
        if (!/^[a-z0-9-]+$/i.test(reportId)) {
          return Response.json(
            { error: "Invalid report ID" },
            { status: 400, headers: corsHeaders }
          );
        }

        const object = await env.STORAGE.get(`reports/${reportId}.json.enc`);

        if (!object) {
          return Response.json(
            { error: "Report not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        const data = await object.text();
        const parsed = JSON.parse(data) as {
          ciphertextB64: string;
          nonceB64: string;
          meta: ReportMeta;
        };

        return Response.json(parsed, { headers: corsHeaders });
      }

      // Not found
      return Response.json(
        { error: "Not found" },
        { status: 404, headers: corsHeaders }
      );
    } catch (error) {
      console.error("Worker error:", error);
      return Response.json(
        { error: "Internal server error" },
        { status: 500, headers: defaultCorsHeaders }
      );
    }
  },
} satisfies ExportedHandler<Env>;
