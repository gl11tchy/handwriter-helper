import type { Env } from "../env";
import { createCheckoutSession, createBillingPortalSession, getSubscription } from "../lib/stripe";

export async function handleStripeCheckout(
  request: Request,
  env: Env,
  userId: string,
  userEmail: string
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const url = await createCheckoutSession(env, userId, userEmail);
    return Response.json({ url });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Checkout failed" },
      { status: 500 }
    );
  }
}

export async function handleStripePortal(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const subscription = await getSubscription(env, userId) as { stripe_customer_id: string } | null;
    if (!subscription?.stripe_customer_id) {
      return Response.json({ error: "No subscription found" }, { status: 404 });
    }

    const url = await createBillingPortalSession(env, subscription.stripe_customer_id);
    return Response.json({ url });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Portal failed" },
      { status: 500 }
    );
  }
}
