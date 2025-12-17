export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  BETTER_AUTH_SECRET: string;
  APP_URL: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID_PRO?: string;
  ANTHROPIC_API_KEY?: string;
  RESEND_API_KEY?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
