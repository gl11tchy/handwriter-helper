import type { Env } from "../env";

const STRIPE_API = "https://api.stripe.com/v1";

async function stripeRequest(env: Env, path: string, options: RequestInit = {}) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured");
  }

  const response = await fetch(`${STRIPE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...options.headers,
    },
  });

  let data: { error?: { message: string } };
  try {
    data = await response.json();
  } catch {
    throw new Error(`Stripe API returned invalid JSON (status: ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(data.error?.message || "Stripe API error");
  }

  return data;
}

export async function createCheckoutSession(
  env: Env,
  userId: string,
  userEmail: string
): Promise<string> {
  if (!env.STRIPE_PRICE_ID_PRO) {
    throw new Error("Stripe price ID not configured");
  }

  let customerId = await getCustomerId(env, userId);

  if (!customerId) {
    // Use idempotency key to prevent duplicate customers on concurrent requests
    const customer = await stripeRequest(env, "/customers", {
      method: "POST",
      headers: {
        "Idempotency-Key": `create-customer-${userId}`,
      },
      body: new URLSearchParams({
        email: userEmail,
        "metadata[user_id]": userId,
      }),
    }) as { id: string };
    customerId = customer.id;
    await saveCustomerId(env, userId, customerId);
  }

  const session = await stripeRequest(env, "/checkout/sessions", {
    method: "POST",
    body: new URLSearchParams({
      customer: customerId,
      mode: "subscription",
      "line_items[0][price]": env.STRIPE_PRICE_ID_PRO,
      "line_items[0][quantity]": "1",
      success_url: `${env.APP_URL}/dashboard/settings?checkout=success`,
      cancel_url: `${env.APP_URL}/dashboard/settings?checkout=cancelled`,
    }),
  }) as { url: string };

  return session.url;
}

export async function createBillingPortalSession(
  env: Env,
  customerId: string
): Promise<string> {
  const session = await stripeRequest(env, "/billing_portal/sessions", {
    method: "POST",
    body: new URLSearchParams({
      customer: customerId,
      return_url: `${env.APP_URL}/dashboard/settings`,
    }),
  }) as { url: string };

  return session.url;
}

async function getCustomerId(env: Env, userId: string): Promise<string | null> {
  const result = await env.DB.prepare(
    "SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?"
  ).bind(userId).first() as { stripe_customer_id: string | null } | null;
  return result?.stripe_customer_id || null;
}

async function saveCustomerId(env: Env, userId: string, customerId: string): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO subscriptions (id, user_id, stripe_customer_id)
    VALUES (?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id
  `).bind(crypto.randomUUID(), userId, customerId).run();
}

export async function getSubscription(env: Env, userId: string) {
  return await env.DB.prepare(
    "SELECT * FROM subscriptions WHERE user_id = ?"
  ).bind(userId).first();
}
