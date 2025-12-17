import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import type { Env } from "./env";
import { sendEmail } from "./lib/email";

let cachedAuth: ReturnType<typeof betterAuth> | null = null;
let cachedDbBinding: D1Database | null = null;

export function createAuth(env: Env) {
  if (cachedAuth && cachedDbBinding === env.DB) {
    return cachedAuth;
  }

  cachedDbBinding = env.DB;

  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  cachedAuth = betterAuth({
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: "sqlite",
    },
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Reset your password - Handwriter Helper",
          html: `<p>Click <a href="${url}">here</a> to reset your password.</p>`,
        });
      },
    },
    socialProviders: Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    trustedOrigins: ["https://handwriter-helper.spinitup.dev"],
  });

  return cachedAuth;
}

export type Auth = ReturnType<typeof createAuth>;
