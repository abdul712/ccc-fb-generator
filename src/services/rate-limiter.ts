import { Env } from '../types/env';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (request: Request) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

/**
 * Durable Object for rate limiting
 */
export class RateLimiter implements DurableObject {
  private state: DurableObjectState;
  private requests: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split('/').pop();

    switch (action) {
      case 'check':
        return this.handleCheck(request);
      case 'reset':
        return this.handleReset(request);
      default:
        return new Response('Not Found', { status: 404 });
    }
  }

  private async handleCheck(request: Request): Promise<Response> {
    const body = await request.json() as {
      key: string;
      maxRequests: number;
      windowMs: number;
    };

    const result = await this.checkRateLimit(body.key, body.maxRequests, body.windowMs);
    return Response.json(result);
  }

  private async handleReset(request: Request): Promise<Response> {
    const body = await request.json() as { key: string };
    this.requests.delete(body.key);
    await this.state.storage.delete(body.key);
    return Response.json({ success: true });
  }

  private async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get current state from storage or memory
    let current = this.requests.get(key);
    if (!current) {
      current = await this.state.storage.get(key) || { count: 0, resetTime: now + windowMs };
      this.requests.set(key, current);
    }

    // Reset if window has expired
    if (now >= current.resetTime) {
      current = { count: 0, resetTime: now + windowMs };
      this.requests.set(key, current);
    }

    // Check if request is allowed
    const allowed = current.count < maxRequests;
    
    if (allowed) {
      current.count++;
      this.requests.set(key, current);
      await this.state.storage.put(key, current);
    }

    return {
      allowed,
      remaining: Math.max(0, maxRequests - current.count),
      resetTime: current.resetTime,
      retryAfter: allowed ? undefined : Math.ceil((current.resetTime - now) / 1000)
    };
  }
}

/**
 * Rate limiting service for API endpoints
 */
export class RateLimitService {
  constructor(private env: Env) {}

  /**
   * Check rate limit for a given key
   */
  async checkRateLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    try {
      const rateLimiterId = this.env.RATE_LIMITER.idFromName('global');
      const rateLimiter = this.env.RATE_LIMITER.get(rateLimiterId);

      const response = await rateLimiter.fetch(new Request('https://rate-limiter/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          maxRequests: config.maxRequests,
          windowMs: config.windowMs
        })
      }));

      return await response.json();
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail open - allow request if rate limiter is down
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: Date.now() + config.windowMs
      };
    }
  }

  /**
   * Rate limit by IP address
   */
  async checkIPRateLimit(
    request: Request,
    maxRequests: number = 100,
    windowMs: number = 60000 // 1 minute
  ): Promise<RateLimitResult> {
    const ip = this.getClientIP(request);
    return this.checkRateLimit(`ip:${ip}`, { maxRequests, windowMs });
  }

  /**
   * Rate limit by API key
   */
  async checkAPIKeyRateLimit(
    apiKey: string,
    maxRequests: number = 1000,
    windowMs: number = 3600000 // 1 hour
  ): Promise<RateLimitResult> {
    const keyHash = await this.hashString(apiKey);
    return this.checkRateLimit(`api:${keyHash}`, { maxRequests, windowMs });
  }

  /**
   * Rate limit by user ID
   */
  async checkUserRateLimit(
    userId: string,
    maxRequests: number = 50,
    windowMs: number = 300000 // 5 minutes
  ): Promise<RateLimitResult> {
    return this.checkRateLimit(`user:${userId}`, { maxRequests, windowMs });
  }

  /**
   * Rate limit for AI API calls
   */
  async checkAIProviderRateLimit(
    provider: string,
    model: string,
    maxRequests: number = 60,
    windowMs: number = 60000 // 1 minute
  ): Promise<RateLimitResult> {
    return this.checkRateLimit(`ai:${provider}:${model}`, { maxRequests, windowMs });
  }

  /**
   * Rate limit for Facebook API calls
   */
  async checkFacebookRateLimit(
    endpoint: string,
    maxRequests: number = 200,
    windowMs: number = 3600000 // 1 hour
  ): Promise<RateLimitResult> {
    return this.checkRateLimit(`facebook:${endpoint}`, { maxRequests, windowMs });
  }

  /**
   * Rate limit for content generation
   */
  async checkContentGenerationRateLimit(
    type: string,
    maxRequests: number = 10,
    windowMs: number = 3600000 // 1 hour
  ): Promise<RateLimitResult> {
    return this.checkRateLimit(`generation:${type}`, { maxRequests, windowMs });
  }

  /**
   * Reset rate limit for a key
   */
  async resetRateLimit(key: string): Promise<boolean> {
    try {
      const rateLimiterId = this.env.RATE_LIMITER.idFromName('global');
      const rateLimiter = this.env.RATE_LIMITER.get(rateLimiterId);

      const response = await rateLimiter.fetch(new Request('https://rate-limiter/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      }));

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Rate limit reset failed:', error);
      return false;
    }
  }

  /**
   * Get client IP address from request
   */
  private getClientIP(request: Request): string {
    // Try various headers that might contain the client IP
    const headers = [
      'CF-Connecting-IP',
      'X-Forwarded-For',
      'X-Real-IP',
      'X-Client-IP'
    ];

    for (const header of headers) {
      const ip = request.headers.get(header);
      if (ip) {
        // Handle comma-separated IPs (X-Forwarded-For can have multiple IPs)
        return ip.split(',')[0].trim();
      }
    }

    return 'unknown';
  }

  /**
   * Hash string for use as rate limit key
   */
  private async hashString(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  /**
   * Create rate limit response with appropriate headers
   */
  createRateLimitResponse(result: RateLimitResult, originalResponse?: Response): Response {
    const headers = new Headers(originalResponse?.headers);
    
    headers.set('X-RateLimit-Limit', result.remaining.toString());
    headers.set('X-RateLimit-Remaining', result.remaining.toString());
    headers.set('X-RateLimit-Reset', result.resetTime.toString());

    if (!result.allowed) {
      headers.set('Retry-After', (result.retryAfter || 60).toString());
      
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: result.retryAfter,
        resetTime: result.resetTime
      }), {
        status: 429,
        headers: {
          ...Object.fromEntries(headers),
          'Content-Type': 'application/json'
        }
      });
    }

    if (originalResponse) {
      return new Response(originalResponse.body, {
        status: originalResponse.status,
        statusText: originalResponse.statusText,
        headers
      });
    }

    return new Response('OK', { headers });
  }
}