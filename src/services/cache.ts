import { Env } from '../types/env';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  metadata?: Record<string, any>;
}

export class CacheService {
  constructor(private env: Env) {}

  /**
   * Get value from cache
   */
  async get<T = any>(key: string, type: 'text' | 'json' | 'arrayBuffer' = 'json'): Promise<T | null> {
    try {
      const value = await this.env.CACHE_KV.get(key, type);
      return value as T;
    } catch (error) {
      console.error(`Cache get failed for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<boolean> {
    try {
      const kvOptions: any = {};
      
      if (options.ttl) {
        kvOptions.expirationTtl = options.ttl;
      }
      
      if (options.metadata) {
        kvOptions.metadata = options.metadata;
      }

      if (typeof value === 'string') {
        await this.env.CACHE_KV.put(key, value, kvOptions);
      } else {
        await this.env.CACHE_KV.put(key, JSON.stringify(value), kvOptions);
      }
      
      return true;
    } catch (error) {
      console.error(`Cache set failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      await this.env.CACHE_KV.delete(key);
      return true;
    } catch (error) {
      console.error(`Cache delete failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const value = await this.env.CACHE_KV.get(key);
      return value !== null;
    } catch (error) {
      console.error(`Cache exists check failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Cache Reddit API responses
   */
  async cacheRedditData(subreddit: string, data: any, ttl: number = 3600): Promise<boolean> {
    const key = `reddit:${subreddit}:${Date.now()}`;
    return this.set(key, data, { 
      ttl,
      metadata: { source: 'reddit', subreddit, cached_at: new Date().toISOString() }
    });
  }

  /**
   * Get cached Reddit data
   */
  async getCachedRedditData(subreddit: string, maxAge: number = 3600): Promise<any | null> {
    const cutoff = Date.now() - (maxAge * 1000);
    const keys = await this.listKeys(`reddit:${subreddit}:`);
    
    // Find the most recent valid cache entry
    for (const key of keys.sort().reverse()) {
      const timestamp = parseInt(key.split(':').pop() || '0');
      if (timestamp > cutoff) {
        return this.get(key);
      }
    }
    
    return null;
  }

  /**
   * Cache AI generation results
   */
  async cacheGenerationResult(
    provider: string,
    prompt: string,
    result: any,
    ttl: number = 86400 // 24 hours
  ): Promise<boolean> {
    const promptHash = await this.hashString(prompt);
    const key = `generation:${provider}:${promptHash}`;
    
    return this.set(key, result, {
      ttl,
      metadata: {
        provider,
        prompt: prompt.substring(0, 100), // Store truncated prompt for debugging
        cached_at: new Date().toISOString()
      }
    });
  }

  /**
   * Get cached generation result
   */
  async getCachedGenerationResult(provider: string, prompt: string): Promise<any | null> {
    const promptHash = await this.hashString(prompt);
    const key = `generation:${provider}:${promptHash}`;
    return this.get(key);
  }

  /**
   * Cache API rate limit status
   */
  async cacheRateLimitStatus(
    provider: string,
    remaining: number,
    resetTime: number,
    ttl: number = 300 // 5 minutes
  ): Promise<boolean> {
    const key = `rate_limit:${provider}`;
    
    return this.set(key, {
      remaining,
      resetTime,
      lastUpdated: Date.now()
    }, { ttl });
  }

  /**
   * Get cached rate limit status
   */
  async getRateLimitStatus(provider: string): Promise<{
    remaining: number;
    resetTime: number;
    lastUpdated: number;
  } | null> {
    const key = `rate_limit:${provider}`;
    return this.get(key);
  }

  /**
   * Cache configuration values
   */
  async cacheConfig(key: string, value: any, ttl: number = 3600): Promise<boolean> {
    return this.env.CONFIG_KV.put(
      `config:${key}`,
      JSON.stringify({
        value,
        cached_at: new Date().toISOString()
      }),
      { expirationTtl: ttl }
    ).then(() => true).catch(() => false);
  }

  /**
   * Get cached configuration
   */
  async getCachedConfig(key: string): Promise<any | null> {
    try {
      const cached = await this.env.CONFIG_KV.get(`config:${key}`, 'json');
      return cached ? cached.value : null;
    } catch (error) {
      console.error(`Config cache get failed for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Cache content performance metrics
   */
  async cacheContentMetrics(contentId: string, metrics: any, ttl: number = 1800): Promise<boolean> {
    const key = `metrics:${contentId}`;
    return this.set(key, metrics, { ttl });
  }

  /**
   * Get cached content metrics
   */
  async getCachedContentMetrics(contentId: string): Promise<any | null> {
    const key = `metrics:${contentId}`;
    return this.get(key);
  }

  /**
   * List keys with prefix
   */
  async listKeys(prefix: string): Promise<string[]> {
    try {
      const { keys } = await this.env.CACHE_KV.list({ prefix });
      return keys.map(key => key.name);
    } catch (error) {
      console.error(`List keys failed for prefix ${prefix}:`, error);
      return [];
    }
  }

  /**
   * Clear cache by prefix
   */
  async clearByPrefix(prefix: string): Promise<number> {
    try {
      const keys = await this.listKeys(prefix);
      let deletedCount = 0;
      
      for (const key of keys) {
        if (await this.delete(key)) {
          deletedCount++;
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.error(`Clear cache by prefix failed for ${prefix}:`, error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalKeys: number;
    keysByPrefix: Record<string, number>;
  }> {
    try {
      const { keys } = await this.env.CACHE_KV.list({ limit: 1000 });
      
      const stats = {
        totalKeys: keys.length,
        keysByPrefix: {} as Record<string, number>
      };

      for (const key of keys) {
        const prefix = key.name.split(':')[0] || 'unknown';
        stats.keysByPrefix[prefix] = (stats.keysByPrefix[prefix] || 0) + 1;
      }

      return stats;
    } catch (error) {
      console.error('Cache stats failed:', error);
      return {
        totalKeys: 0,
        keysByPrefix: {}
      };
    }
  }

  /**
   * Hash string for use as cache key
   */
  private async hashString(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }
}