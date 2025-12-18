export interface Env {
  STORAGE: R2Bucket;
  ASSETS: Fetcher;
  APP_URL: string;
  ENVIRONMENT: string;
  GOOGLE_CLOUD_API_KEY: string;
  SIGNING_SECRET: string;
}
