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
