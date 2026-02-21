import type { Env } from "./env";

export type { Env };

// Rate limiting map (in production, use Durable Objects or external store)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per window
const MAX_PAYLOAD_SIZE = 25 * 1024 * 1024; // 25MB

interface ApiErrorBody {
  error: string;
  code: string;
  retryable: boolean;
  tampered?: boolean;
  requestId?: string;
}

function errorJson(
  status: number,
  headers: HeadersInit,
  body: ApiErrorBody,
  requestId: string
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("X-Request-Id", requestId);

  return Response.json(
    { ...body, requestId },
    { status, headers: responseHeaders }
  );
}

function isUpstreamTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return error.name === "AbortError" || message.includes("timeout");
}

function getRequestId(request: Request): string {
  const fromHeader = request.headers.get("X-Request-Id")?.trim();
  if (fromHeader) return fromHeader;
  return `req-${generateId()}`;
}

function logFailure(route: string, failureType: string, requestId: string, error?: unknown): void {
  const payload: Record<string, string> = {
    route,
    failureType,
    requestId,
  };

  if (error instanceof Error) {
    payload.errorName = error.name;
    payload.errorMessage = error.message;
  }

  console.error("api_failure", payload);
}

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

// HTML escape for safe email content
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Validate base64url format (used for encryption keys)
function isValidBase64Url(str: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(str);
}

// Send email via Resend API
async function sendResultsEmail(
  to: string,
  reportUrl: string,
  assignmentText: string,
  apiKey: string
): Promise<boolean> {
  try {
    const escapedText = escapeHtml(assignmentText);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Writing Lines <noreply@writinglines.com>",
        to: [to],
        subject: "Assignment Results Submitted",
        html: `
          <h2>Assignment Results Ready</h2>
          <p>A line writing assignment has been submitted.</p>
          <p><strong>Assignment:</strong> "${escapedText}"</p>
          <p><a href="${reportUrl}" style="display: inline-block; padding: 12px 24px; background-color: #d4af37; color: #000; text-decoration: none; border-radius: 6px; font-weight: bold;">View Results</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 20px;">This link contains the encryption key needed to view the report. Keep it safe.</p>
        `,
      }),
    });

    if (!response.ok) {
      console.error("Resend API error:", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

interface ReportMeta {
  createdAt: string;
  size: number;
}

interface UploadRequest {
  ciphertextB64: string;
  nonceB64: string;
  meta: ReportMeta;
  assignmentId?: string;
  encryptionKey?: string; // Base64 encryption key for building report URL in email
}

interface OcrRequest {
  imageB64: string; // Base64-encoded image data (without data URL prefix)
}

// Assignment types
interface AssignmentPayload {
  version: 1;
  assignmentId: string;
  createdAt: string;
  dueDate?: string; // Optional ISO 8601 timestamp for assignment deadline
  requiredLineCount: number;
  expectedStyle: "print" | "cursive";
  paperType: "ruled" | "blank" | "either";
  numbering: { required: false } | { required: true; startAt: number; format: "dot" | "paren" | "dash" };
  expectedContent: { mode: "perLine"; lines: string[] };
  precisionMode: "max";
  notifyEmail?: string;
}

interface CreateAssignmentRequest {
  requiredLineCount: number;
  expectedStyle: "print" | "cursive";
  paperType?: "ruled" | "blank" | "either";
  dueDate?: string; // Optional ISO 8601 timestamp
  numbering?: { required: false } | { required: true; startAt: number; format: "dot" | "paren" | "dash" };
  expectedContent: { mode: "perLine"; lines: string[] };
  notifyEmail?: string;
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

// Claude Vision verification types
interface ClaudeVerificationRequest {
  imageB64: string;
  expectedText: string;
  lineIndex: number;
}

interface ClaudeVerificationResponse {
  transcription: string;
  matchesExpected: boolean;
  confidence: "high" | "medium" | "low";
  reasoning?: string;
}

interface AnthropicResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  stop_reason: string;
}

// Call Claude Vision API to verify handwritten text
async function callClaudeVision(
  imageB64: string,
  expectedText: string,
  apiKey: string
): Promise<ClaudeVerificationResponse> {
  const prompt = `You are analyzing a cropped image of a single handwritten line from a writing assignment.

Expected text: "${expectedText}"

Please:
1. Transcribe exactly what you see written in the image
2. Compare your transcription to the expected text
3. Determine if they match (allowing for minor variations in handwriting)

Respond ONLY with valid JSON in this exact format, no other text:
{
  "transcription": "what you read",
  "matchesExpected": true,
  "confidence": "high",
  "reasoning": "brief explanation if not a match"
}

The confidence field must be one of: "high", "medium", or "low".
The matchesExpected field must be true or false.
If the handwriting matches the expected text (allowing for minor handwriting variations), set matchesExpected to true.`;

  // Detect MIME type from base64 data
  const detectMimeType = (b64: string): string => {
    // Check for data URL prefix
    if (b64.startsWith("data:")) {
      const match = b64.match(/^data:([^;]+);base64,/);
      if (match) return match[1];
    }
    // Infer from base64 header bytes (first few characters encode magic bytes)
    // PNG: iVBORw0KGgo (base64 of 0x89 0x50 0x4E 0x47)
    // JPEG: /9j/ (base64 of 0xFF 0xD8 0xFF)
    // GIF: R0lGOD (base64 of GIF87a or GIF89a)
    // WebP: UklGR (base64 of RIFF header)
    if (b64.startsWith("iVBORw")) return "image/png";
    if (b64.startsWith("/9j/")) return "image/jpeg";
    if (b64.startsWith("R0lGOD")) return "image/gif";
    if (b64.startsWith("UklGR")) return "image/webp";
    // Default to JPEG for unknown formats
    return "image/jpeg";
  };

  // Strip data URL prefix if present
  const cleanB64 = imageB64.includes(",") ? imageB64.split(",")[1] : imageB64;
  const mediaType = detectMimeType(imageB64);

  // Set up timeout with AbortController
  const CLAUDE_API_TIMEOUT = 15000; // 15 seconds
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLAUDE_API_TIMEOUT);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: cleanB64,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Anthropic API timeout after ${CLAUDE_API_TIMEOUT}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as AnthropicResponse;

  if (!data.content || data.content.length === 0) {
    throw new Error("Anthropic API returned empty response");
  }

  const textContent = data.content.find(c => c.type === "text");
  if (!textContent) {
    throw new Error("Anthropic API returned no text content");
  }

  // Parse the JSON response from Claude
  try {
    const parsed = JSON.parse(textContent.text) as ClaudeVerificationResponse;

    // Validate the response structure
    if (typeof parsed.transcription !== "string" ||
        typeof parsed.matchesExpected !== "boolean" ||
        !["high", "medium", "low"].includes(parsed.confidence)) {
      throw new Error("Invalid response structure from Claude");
    }

    return parsed;
  } catch {
    // If Claude didn't return valid JSON, try to extract what we can
    console.error("Failed to parse Claude response:", textContent.text);
    throw new Error("Failed to parse Claude response as JSON");
  }
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
          { type: "DOCUMENT_TEXT_DETECTION" }
        ],
        imageContext: {
          // Per Google docs: "With the release of Handwriting OCR GA, images with handwriting
          // no longer require a handwriting languageHints flag when using DOCUMENT_TEXT_DETECTION."
          // Empty array enables automatic language detection, which works best for most cases.
          languageHints: []
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
    const requestId = getRequestId(request);
    // Default CORS headers for error responses
    const defaultCorsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Request-Id",
      "Access-Control-Expose-Headers": "X-Request-Id",
    };

    try {
      const url = new URL(request.url);
      const clientIP = getClientIP(request);

      // CORS headers - allow the app origin
      const corsHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": env.APP_URL || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Request-Id",
        "Access-Control-Max-Age": "86400",
        "Access-Control-Expose-Headers": "X-Request-Id",
      };
      const responseHeaders: Record<string, string> = {
        ...corsHeaders,
        "X-Request-Id": requestId,
      };

      // Handle preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: responseHeaders });
      }

      // Apply rate limiting to all API routes
      if (url.pathname.startsWith("/api/")) {
        if (!checkRateLimit(clientIP)) {
          return errorJson(429, corsHeaders, {
            error: "Too many requests. Please try again later.",
            code: "RATE_LIMITED",
            retryable: true,
          }, requestId);
        }
      }

      // Only handle /api/* routes - serve static assets for frontend routes
      if (!url.pathname.startsWith("/api/")) {
        if (!env.ASSETS) {
          logFailure(url.pathname, "assets_binding_missing", requestId);
          return new Response("Static assets not configured", { status: 503 });
        }
        return env.ASSETS.fetch(request);
      }

      // Health check
      if (url.pathname === "/api/health") {
        return Response.json(
          { status: "ok", timestamp: new Date().toISOString() },
          { headers: responseHeaders }
        );
      }

      // OCR endpoint - uses Google Cloud Vision
      if (url.pathname === "/api/ocr" && request.method === "POST") {
        // Check content length (images can be large)
        const contentLengthHeader = request.headers.get("Content-Length");
        if (!contentLengthHeader) {
          return errorJson(411, corsHeaders, {
            error: "Content-Length header is required",
            code: "OCR_CONTENT_LENGTH_REQUIRED",
            retryable: false,
          }, requestId);
        }
        const contentLength = Number(contentLengthHeader);
        if (!Number.isFinite(contentLength) || contentLength < 0) {
          return errorJson(400, corsHeaders, {
            error: "Content-Length header must be a valid non-negative number",
            code: "OCR_INVALID_CONTENT_LENGTH",
            retryable: false,
          }, requestId);
        }
        if (contentLength > MAX_PAYLOAD_SIZE) {
          return errorJson(413, corsHeaders, {
            error: `Payload too large. Maximum size is ${MAX_PAYLOAD_SIZE / (1024 * 1024)}MB.`,
            code: "OCR_PAYLOAD_TOO_LARGE",
            retryable: false,
          }, requestId);
        }

        if (!env.GOOGLE_CLOUD_API_KEY) {
          return errorJson(503, corsHeaders, {
            error: "OCR service not configured",
            code: "OCR_SERVICE_UNAVAILABLE",
            retryable: false,
          }, requestId);
        }

        const body = await request.json() as OcrRequest;

        if (!body.imageB64) {
          return errorJson(400, corsHeaders, {
            error: "Missing imageB64 in request body",
            code: "OCR_INVALID_REQUEST",
            retryable: false,
          }, requestId);
        }

        try {
          const result = await callGoogleVisionOCR(body.imageB64, env.GOOGLE_CLOUD_API_KEY);
          return Response.json(result, { headers: responseHeaders });
        } catch (error) {
          logFailure(url.pathname, "ocr_upstream_failure", requestId, error);
          if (isUpstreamTimeoutError(error)) {
            return errorJson(504, corsHeaders, {
              error: "OCR service timed out. Please try again.",
              code: "OCR_UPSTREAM_TIMEOUT",
              retryable: true,
            }, requestId);
          }

          return errorJson(502, corsHeaders, {
            error: "OCR service failed. Please try again.",
            code: "OCR_UPSTREAM_FAILURE",
            retryable: true,
          }, requestId);
        }
      }

      // Claude Vision verification endpoint - for uncertain OCR results
      if (url.pathname === "/api/verify-with-claude" && request.method === "POST") {
        // Check content length (images can be large)
        const contentLengthHeader = request.headers.get("Content-Length");
        if (!contentLengthHeader) {
          return errorJson(411, corsHeaders, {
            error: "Content-Length header is required",
            code: "CLAUDE_CONTENT_LENGTH_REQUIRED",
            retryable: false,
          }, requestId);
        }
        const contentLength = Number(contentLengthHeader);
        if (!Number.isFinite(contentLength) || contentLength < 0) {
          return errorJson(400, corsHeaders, {
            error: "Content-Length header must be a valid non-negative number",
            code: "CLAUDE_INVALID_CONTENT_LENGTH",
            retryable: false,
          }, requestId);
        }
        if (contentLength > MAX_PAYLOAD_SIZE) {
          return errorJson(413, corsHeaders, {
            error: `Payload too large. Maximum size is ${MAX_PAYLOAD_SIZE / (1024 * 1024)}MB.`,
            code: "CLAUDE_PAYLOAD_TOO_LARGE",
            retryable: false,
          }, requestId);
        }

        if (!env.ANTHROPIC_API_KEY) {
          return errorJson(503, corsHeaders, {
            error: "Claude verification service not configured",
            code: "CLAUDE_SERVICE_UNAVAILABLE",
            retryable: false,
          }, requestId);
        }

        const body = await request.json() as ClaudeVerificationRequest;

        if (!body.imageB64 || !body.expectedText) {
          return errorJson(400, corsHeaders, {
            error: "Missing required fields: imageB64 and expectedText are required",
            code: "CLAUDE_INVALID_REQUEST",
            retryable: false,
          }, requestId);
        }

        try {
          const result = await callClaudeVision(body.imageB64, body.expectedText, env.ANTHROPIC_API_KEY);
          return Response.json(result, { headers: responseHeaders });
        } catch (error) {
          logFailure(url.pathname, "claude_upstream_failure", requestId, error);
          if (isUpstreamTimeoutError(error)) {
            return errorJson(504, corsHeaders, {
              error: "Claude verification timed out. Please try again.",
              code: "CLAUDE_UPSTREAM_TIMEOUT",
              retryable: true,
            }, requestId);
          }

          return errorJson(502, corsHeaders, {
            error: "Claude verification failed. Please try again.",
            code: "CLAUDE_UPSTREAM_FAILURE",
            retryable: true,
          }, requestId);
        }
      }

      // Create assignment - signs and stores it
      if (url.pathname === "/api/assignment" && request.method === "POST") {
        if (!env.SIGNING_SECRET) {
          return errorJson(503, corsHeaders, {
            error: "Signing service not configured",
            code: "SIGNING_SERVICE_UNAVAILABLE",
            retryable: false,
          }, requestId);
        }

        const body = await request.json() as CreateAssignmentRequest;

        // Validate required fields
        if (
          !body.requiredLineCount ||
          !body.expectedStyle ||
          !body.expectedContent?.lines ||
          body.expectedContent.lines.length === 0
        ) {
          return errorJson(400, corsHeaders, {
            error: "Missing required fields",
            code: "ASSIGNMENT_INVALID_REQUEST",
            retryable: false,
          }, requestId);
        }

        const assignmentId = generateId();
        const payload: AssignmentPayload = {
          version: 1,
          assignmentId,
          createdAt: new Date().toISOString(),
          ...(body.dueDate && { dueDate: body.dueDate }),
          requiredLineCount: body.requiredLineCount,
          expectedStyle: body.expectedStyle,
          paperType: body.paperType || "either",
          numbering: body.numbering || { required: false },
          expectedContent: body.expectedContent,
          precisionMode: "max",
          ...(body.notifyEmail && { notifyEmail: body.notifyEmail }),
        };

        // Sign the payload
        const payloadJson = JSON.stringify(payload);
        const signature = await signPayload(payloadJson, env.SIGNING_SECRET);

        // Store in R2
        const stored: StoredAssignment = { payload, signature };
        try {
          await env.STORAGE.put(`assignments/${assignmentId}.json`, JSON.stringify(stored), {
            httpMetadata: { contentType: "application/json" },
          });
        } catch (storageError) {
          logFailure(url.pathname, "assignment_storage_write_error", requestId, storageError);
          return errorJson(503, corsHeaders, {
            error: "Assignment storage is temporarily unavailable. Please try again.",
            code: "ASSIGNMENT_STORAGE_FAILURE",
            retryable: true,
          }, requestId);
        }

        return Response.json(
          { assignmentId, payload },
          { status: 201, headers: responseHeaders }
        );
      }

      // Get assignment - verifies signature, returns tampered status
      if (url.pathname.startsWith("/api/assignment/") && request.method === "GET") {
        const assignmentId = url.pathname.replace("/api/assignment/", "");

        // Log for debugging (visible in Cloudflare logs only)
        console.warn("GET assignment request:", { assignmentId, pathname: url.pathname });

        // Validate assignment ID format and length (max 100 chars to prevent abuse)
        if (!/^[a-z0-9-]+$/i.test(assignmentId) || assignmentId.length > 100) {
          console.warn("Invalid assignment ID format:", assignmentId);
          return errorJson(400, corsHeaders, {
            error: "Invalid assignment ID format",
            code: "ASSIGNMENT_INVALID_ID",
            retryable: false,
          }, requestId);
        }

        let object;
        try {
          object = await env.STORAGE.get(`assignments/${assignmentId}.json`);
          console.warn("Storage.get result:", { found: !!object, assignmentId });
        } catch (storageError) {
          logFailure(url.pathname, "assignment_storage_fetch_error", requestId, storageError);
          return errorJson(500, corsHeaders, {
            error: "Failed to fetch assignment from storage",
            code: "ASSIGNMENT_STORAGE_FAILURE",
            retryable: true,
          }, requestId);
        }

        if (!object) {
          console.warn("Assignment not found in storage:", assignmentId);
          return errorJson(404, corsHeaders, {
            error: "Assignment not found",
            code: "ASSIGNMENT_NOT_FOUND",
            retryable: false,
          }, requestId);
        }

        let stored: StoredAssignment;
        try {
          stored = await object.json() as StoredAssignment;
          console.warn("Parsed stored assignment:", { hasPayload: !!stored?.payload, hasSignature: !!stored?.signature });
        } catch (parseError) {
          logFailure(url.pathname, "assignment_data_parse_error", requestId, parseError);
          return errorJson(500, corsHeaders, {
            error: "Assignment data is corrupted",
            code: "ASSIGNMENT_DATA_CORRUPTED",
            retryable: false,
          }, requestId);
        }

        // Validate stored data structure
        if (!stored || !stored.payload || !stored.signature) {
          logFailure(url.pathname, "assignment_data_invalid_structure", requestId);
          return errorJson(500, corsHeaders, {
            error: "Assignment data is incomplete or corrupted",
            code: "ASSIGNMENT_DATA_CORRUPTED",
            retryable: false,
          }, requestId);
        }

        // Verify signature
        if (!env.SIGNING_SECRET) {
          logFailure(url.pathname, "signing_secret_missing", requestId);
          return errorJson(503, corsHeaders, {
            error: "Signing service not configured",
            code: "SIGNING_SERVICE_UNAVAILABLE",
            retryable: false,
          }, requestId);
        }

        let valid: boolean;
        try {
          const payloadJson = JSON.stringify(stored.payload);
          valid = await verifySignature(payloadJson, stored.signature, env.SIGNING_SECRET);
          console.warn("Signature verification result:", { valid });
        } catch (verifyError) {
          logFailure(url.pathname, "assignment_signature_verification_error", requestId, verifyError);
          return errorJson(403, corsHeaders, {
            error: "This assignment link is invalid or has been modified. Please request a new link.",
            code: "ASSIGNMENT_TAMPERED",
            retryable: false,
            tampered: true,
          }, requestId);
        }

        if (!valid) {
          console.warn("Signature verification failed - tampered data");
          return errorJson(403, corsHeaders, {
            error: "This assignment link is invalid or has been modified. Please request a new link.",
            code: "ASSIGNMENT_TAMPERED",
            retryable: false,
            tampered: true,
          }, requestId);
        }

        console.warn("Assignment retrieved successfully:", assignmentId);
        return Response.json(
          { payload: stored.payload, verified: true },
          { headers: responseHeaders }
        );
      }

      // Upload encrypted report
      if (url.pathname === "/api/report" && request.method === "POST") {
        // Check content length
        const contentLength = parseInt(request.headers.get("Content-Length") || "0");
        if (contentLength > MAX_PAYLOAD_SIZE) {
          return errorJson(413, corsHeaders, {
            error: `Payload too large. Maximum size is ${MAX_PAYLOAD_SIZE / (1024 * 1024)}MB.`,
            code: "REPORT_PAYLOAD_TOO_LARGE",
            retryable: false,
          }, requestId);
        }

        const body = await request.json() as UploadRequest;

        // Validate request
        if (!body.ciphertextB64 || !body.nonceB64 || !body.meta) {
          return errorJson(400, corsHeaders, {
            error: "Invalid request body",
            code: "REPORT_INVALID_REQUEST",
            retryable: false,
          }, requestId);
        }

        // Generate report ID
        const reportId = generateId();

        // Store encrypted blob in R2
        const data = JSON.stringify({
          ciphertextB64: body.ciphertextB64,
          nonceB64: body.nonceB64,
          meta: body.meta,
        });

        try {
          await env.STORAGE.put(`reports/${reportId}.json.enc`, data, {
            httpMetadata: {
              contentType: "application/json",
            },
            customMetadata: {
              createdAt: body.meta.createdAt,
              size: String(body.meta.size),
            },
          });
        } catch (storageError) {
          logFailure(url.pathname, "report_storage_write_error", requestId, storageError);
          return errorJson(503, corsHeaders, {
            error: "Report storage is temporarily unavailable. Please try again.",
            code: "REPORT_STORAGE_FAILURE",
            retryable: true,
          }, requestId);
        }

        // Send email notification if assignment has notifyEmail configured
        let emailSent = false;
        if (body.assignmentId && body.encryptionKey && env.RESEND_API_KEY) {
          // Validate assignmentId format to prevent path traversal
          if (!/^[a-z0-9-]+$/i.test(body.assignmentId)) {
            logFailure(url.pathname, "report_email_invalid_assignment_id", requestId);
          // Validate encryptionKey is valid base64url to prevent injection
          } else if (!isValidBase64Url(body.encryptionKey)) {
            logFailure(url.pathname, "report_email_invalid_encryption_key", requestId);
          } else {
            try {
              const assignmentObject = await env.STORAGE.get(`assignments/${body.assignmentId}.json`);
              if (assignmentObject) {
                const stored = await assignmentObject.json() as StoredAssignment;
                if (stored?.payload?.notifyEmail) {
                  const assignmentText = stored.payload.expectedContent.lines[0] || "Handwriting assignment";
                  // Build the full report URL with the encryption key in the fragment
                  // Format must match client: /r/{reportId}#k={key}
                  const reportUrl = `${env.APP_URL}/r/${reportId}#k=${body.encryptionKey}`;
                  emailSent = await sendResultsEmail(
                    stored.payload.notifyEmail,
                    reportUrl,
                    assignmentText,
                    env.RESEND_API_KEY
                  );
                }
              }
            } catch (emailError) {
              logFailure(url.pathname, "report_notification_email_error", requestId, emailError);
              // Don't fail the request if email fails
            }
          }
        }

        return Response.json(
          { reportId, emailSent },
          { status: 201, headers: responseHeaders }
        );
      }

      // Get encrypted report
      if (url.pathname.startsWith("/api/report/") && request.method === "GET") {
        const reportId = url.pathname.replace("/api/report/", "");

        // Validate report ID format and length (max 100 chars to prevent abuse)
        if (!/^[a-z0-9-]+$/i.test(reportId) || reportId.length > 100) {
          return errorJson(400, corsHeaders, {
            error: "Invalid report ID",
            code: "REPORT_INVALID_ID",
            retryable: false,
          }, requestId);
        }

        let object;
        try {
          object = await env.STORAGE.get(`reports/${reportId}.json.enc`);
        } catch (storageError) {
          logFailure(url.pathname, "report_storage_read_error", requestId, storageError);
          return errorJson(503, corsHeaders, {
            error: "Report storage is temporarily unavailable. Please try again.",
            code: "REPORT_STORAGE_FAILURE",
            retryable: true,
          }, requestId);
        }

        if (!object) {
          return errorJson(404, corsHeaders, {
            error: "Report not found",
            code: "REPORT_NOT_FOUND",
            retryable: false,
          }, requestId);
        }

        let parsed: {
          ciphertextB64: string;
          nonceB64: string;
          meta: ReportMeta;
        };
        try {
          const data = await object.text();
          parsed = JSON.parse(data) as {
            ciphertextB64: string;
            nonceB64: string;
            meta: ReportMeta;
          };
        } catch (parseError) {
          logFailure(url.pathname, "report_data_parse_error", requestId, parseError);
          return errorJson(500, corsHeaders, {
            error: "Report data is corrupted",
            code: "REPORT_DATA_CORRUPTED",
            retryable: false,
          }, requestId);
        }

        return Response.json(parsed, { headers: responseHeaders });
      }

      // Not found
      return errorJson(404, corsHeaders, {
        error: "Not found",
        code: "ROUTE_NOT_FOUND",
        retryable: false,
      }, requestId);
    } catch (error) {
      logFailure("/api/*", "worker_unhandled_error", requestId, error);
      return errorJson(500, defaultCorsHeaders, {
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
        retryable: true,
      }, requestId);
    }
  },
} satisfies ExportedHandler<Env>;
