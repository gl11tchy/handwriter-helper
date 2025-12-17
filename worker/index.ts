import type { Env } from "./env";
import { createAuth } from "./auth";
import { handleChat } from "./routes/chat";
import { handleStripeCheckout, handleStripePortal } from "./routes/stripe";
import { handleStripeWebhook } from "./routes/webhooks";
import { handleGetUser } from "./routes/user";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const auth = createAuth(env);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.APP_URL,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === "/api/health") {
      return Response.json(
        { status: "ok", timestamp: new Date().toISOString() },
        { headers: corsHeaders }
      );
    }

    // Auth routes - BetterAuth handles these
    if (url.pathname.startsWith("/api/auth")) {
      const response = await auth.handler(request);
      // Add CORS headers to auth responses
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    // Stripe webhooks - no auth required
    if (url.pathname === "/api/webhooks/stripe") {
      const response = await handleStripeWebhook(request, env);
      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, ...Object.fromEntries(response.headers) },
      });
    }

    // Protected routes - require authentication
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    let response: Response;

    switch (url.pathname) {
      case "/api/user":
        response = await handleGetUser(env, userId);
        break;
      case "/api/chat":
        response = await handleChat(request, env, userId);
        break;
      case "/api/stripe/checkout":
        response = await handleStripeCheckout(request, env, userId, userEmail);
        break;
      case "/api/stripe/portal":
        response = await handleStripePortal(request, env, userId);
        break;
      default:
        response = Response.json({ error: "Not found" }, { status: 404 });
    }

    // Add CORS headers to response
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
} satisfies ExportedHandler<Env>;
