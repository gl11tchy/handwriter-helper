import type { Env } from "../env";
import { streamChat } from "../lib/ai";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function handleChat(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const subscription = await env.DB.prepare(
    "SELECT plan, status, current_period_end FROM subscriptions WHERE user_id = ?"
  ).bind(userId).first() as { plan: string; status: string; current_period_end: number | null } | null;

  // Honor paid billing period even if canceled/past_due
  const now = Math.floor(Date.now() / 1000);
  const isPro = subscription?.plan === "pro" && (
    subscription?.status === "active" ||
    ((subscription?.status === "canceled" || subscription?.status === "past_due") &&
      subscription?.current_period_end != null &&
      subscription.current_period_end > now)
  );

  const usage = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM ai_usage
    WHERE user_id = ? AND created_at > datetime('now', '-1 day')
  `).bind(userId).first() as { count: number } | null;

  const dailyLimit = isPro ? 1000 : 10;
  if ((usage?.count || 0) >= dailyLimit) {
    return Response.json(
      { error: "Daily message limit reached. Upgrade to Pro for more." },
      { status: 429 }
    );
  }

  try {
    const { messages } = await request.json() as { messages: Message[] };
    const stream = await streamChat(env, messages, userId);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 }
    );
  }
}
