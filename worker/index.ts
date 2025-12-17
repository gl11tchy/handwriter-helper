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

function generateReportId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${timestamp}-${random}`;
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

  if (data.responses[0]?.error) {
    throw new Error(`Google Vision API error: ${data.responses[0].error.message}`);
  }

  const fullText = data.responses[0]?.fullTextAnnotation;

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

    try {
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
        const reportId = generateReportId();

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
        { status: 500, headers: corsHeaders }
      );
    }
  },
} satisfies ExportedHandler<Env>;
