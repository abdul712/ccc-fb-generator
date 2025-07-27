/**
 * Cloudflare Workers Environment Bindings
 */
export interface Env {
  // D1 Database
  DB: D1Database;
  
  // R2 Storage
  MEDIA_BUCKET: R2Bucket;
  
  // KV Storage
  CACHE_KV: KVNamespace;
  CONFIG_KV: KVNamespace;
  
  // Durable Objects
  RATE_LIMITER: DurableObjectNamespace;
  
  // Environment Variables
  NODE_ENV: string;
  LOG_LEVEL: string;
  
  // API Keys (configured as secrets)
  FACEBOOK_APP_ID: string;
  FACEBOOK_APP_SECRET: string;
  FACEBOOK_PAGE_ACCESS_TOKEN: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  RUNWAY_API_KEY: string;
  REPLICATE_API_TOKEN: string;
  LUMA_API_KEY: string;
  REDDIT_CLIENT_ID: string;
  REDDIT_CLIENT_SECRET: string;
  TWITTER_API_KEY: string;
  TWITTER_API_SECRET: string;
  NEWS_API_KEY: string;
}