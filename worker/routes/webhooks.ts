import type { Env } from "../env";

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const parts = signature.split(",").reduce((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts["t"];
  const expectedSig = parts["v1"];

  if (!timestamp || !expectedSig) return false;

  // Validate timestamp to prevent replay attacks (5 minute tolerance)
  const timestampSeconds = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  const tolerance = 300; // 5 minutes
  if (isNaN(timestampSeconds) || Math.abs(now - timestampSeconds) > tolerance) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );

  const computedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe comparison to prevent timing attacks
  if (computedSig.length !== expectedSig.length) return false;
  const computedBytes = new TextEncoder().encode(computedSig);
  const expectedBytes = new TextEncoder().encode(expectedSig);
  let result = 0;
  for (let i = 0; i < computedBytes.length; i++) {
    result |= computedBytes[i] ^ expectedBytes[i];
  }
  return result === 0;
}

export async function handleStripeWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  const isValid = await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as { customer: string; subscription: string };
      await handleCheckoutCompleted(env, session);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as {
        id: string;
        customer: string;
        status: string;
        current_period_start: number;
        current_period_end: number;
        cancel_at_period_end: boolean;
      };
      await handleSubscriptionChange(env, subscription);
      break;
    }
    default:
      // Log unknown events for debugging but don't fail
      console.log(`Unhandled Stripe webhook event: ${event.type}`);
  }

  return Response.json({ received: true });
}

async function handleCheckoutCompleted(
  env: Env,
  session: { customer: string; subscription: string }
): Promise<void> {
  await env.DB.prepare(`
    UPDATE subscriptions SET
      stripe_subscription_id = ?,
      status = 'active',
      plan = 'pro',
      updated_at = datetime('now')
    WHERE stripe_customer_id = ?
  `).bind(session.subscription, session.customer).run();
}

async function handleSubscriptionChange(
  env: Env,
  subscription: {
    id: string;
    customer: string;
    status: string;
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
  }
): Promise<void> {
  const status = subscription.status === "active" ? "active" :
                 subscription.status === "canceled" ? "canceled" :
                 subscription.status === "past_due" ? "past_due" : "inactive";

  await env.DB.prepare(`
    UPDATE subscriptions SET
      status = ?,
      current_period_start = ?,
      current_period_end = ?,
      cancel_at_period_end = ?,
      updated_at = datetime('now')
    WHERE stripe_customer_id = ?
  `).bind(
    status,
    subscription.current_period_start,
    subscription.current_period_end,
    subscription.cancel_at_period_end ? 1 : 0,
    subscription.customer
  ).run();
}
