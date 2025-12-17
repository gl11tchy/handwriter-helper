import type { Env } from "../env";

export async function handleGetUser(
  env: Env,
  userId: string
): Promise<Response> {
  const user = await env.DB.prepare(
    "SELECT id, email, name, image FROM users WHERE id = ?"
  ).bind(userId).first();

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const subscription = await env.DB.prepare(
    "SELECT plan, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = ?"
  ).bind(userId).first();

  const usage = await env.DB.prepare(`
    SELECT COUNT(*) as message_count, SUM(input_tokens + output_tokens) as total_tokens
    FROM ai_usage WHERE user_id = ? AND created_at > datetime('now', '-1 day')
  `).bind(userId).first() as { message_count: number; total_tokens: number } | null;

  // Transform snake_case database fields to camelCase for frontend
  const subscriptionData = subscription ? {
    plan: subscription.plan,
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  } : { plan: "free", status: "inactive" };

  return Response.json({
    user,
    subscription: subscriptionData,
    usage: {
      messagesUsedToday: usage?.message_count || 0,
      tokensUsedToday: usage?.total_tokens || 0,
    },
  });
}
