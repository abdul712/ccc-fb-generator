# CCC FB Generator - Production Implementation Guide

This guide provides step-by-step instructions to make the CCC Facebook Generator application production-ready.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [API Keys and Authentication](#api-keys-and-authentication)
3. [Facebook Setup](#facebook-setup)
4. [AI Services Configuration](#ai-services-configuration)
5. [Content Sources Setup](#content-sources-setup)
6. [Production Deployment](#production-deployment)
7. [Monitoring and Maintenance](#monitoring-and-maintenance)
8. [Testing Strategy](#testing-strategy)
9. [Security Checklist](#security-checklist)
10. [Scaling Considerations](#scaling-considerations)

## Prerequisites

Before starting, ensure you have:
- [ ] Cloudflare account with Workers subscription
- [ ] Facebook Developer account
- [ ] OpenAI API access
- [ ] Anthropic API access
- [ ] Reddit Developer account
- [ ] NewsAPI account
- [ ] Node.js 18+ installed locally
- [ ] Wrangler CLI installed (`npm install -g wrangler`)

## API Keys and Authentication

### 1. Obtain Required API Keys

#### Facebook
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or use existing
3. Add Facebook Login and Pages API products
4. Generate long-lived Page Access Token:
   ```bash
   # Get User Token (60-day)
   https://graph.facebook.com/oauth/access_token?
     grant_type=fb_exchange_token&
     client_id={app-id}&
     client_secret={app-secret}&
     fb_exchange_token={short-lived-token}
   
   # Get Page Token (Never expires)
   https://graph.facebook.com/{page-id}?
     fields=access_token&
     access_token={long-lived-user-token}
   ```

#### OpenAI
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Create API key with sufficient credits
3. Enable DALL-E 3 and GPT-4 access

#### Anthropic
1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Create API key
3. Ensure Claude 3 access is enabled

#### Reddit
1. Go to [Reddit Apps](https://www.reddit.com/prefs/apps)
2. Create "script" type application
3. Note Client ID and Secret

#### NewsAPI
1. Register at [NewsAPI](https://newsapi.org/)
2. Get free tier API key

### 2. Add Secrets to Cloudflare Workers

```bash
# Facebook credentials
wrangler secret put FACEBOOK_APP_ID
wrangler secret put FACEBOOK_APP_SECRET
wrangler secret put FACEBOOK_PAGE_ACCESS_TOKEN

# AI service keys
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY

# Content source keys
wrangler secret put REDDIT_CLIENT_ID
wrangler secret put REDDIT_CLIENT_SECRET
wrangler secret put NEWS_API_KEY

# Optional: Additional AI services
wrangler secret put RUNWAY_API_KEY
wrangler secret put REPLICATE_API_TOKEN
wrangler secret put LUMA_API_KEY
```

## Facebook Setup

### 1. Configure Facebook Page

1. **Page Settings**
   - Enable Creator Studio access
   - Set up Instagram cross-posting (optional)
   - Configure page roles and permissions

2. **App Permissions**
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_read_user_content`
   - `pages_manage_engagement`

3. **Webhook Configuration**
   ```bash
   # Set webhook URL
   https://ccc-fb-generator.mabdulrahim.workers.dev/webhooks/facebook
   
   # Subscribe to events:
   - feed
   - mention
   - message_reactions
   ```

### 2. Test Facebook Integration

```bash
# Test posting
curl -X POST https://ccc-fb-generator.mabdulrahim.workers.dev/api/test-facebook \
  -H "Content-Type: application/json" \
  -d '{"message": "Test post from CCC Generator"}'
```

## AI Services Configuration

### 1. Configure AI Models

```bash
# Add model preferences to KV storage
wrangler kv:key put --binding=CONFIG_KV "ai_config" '{
  "openai": {
    "image_model": "dall-e-3",
    "text_model": "gpt-4-turbo-preview",
    "vision_model": "gpt-4-vision-preview"
  },
  "anthropic": {
    "model": "claude-3-opus-20240229"
  },
  "defaults": {
    "image_size": "1024x1024",
    "image_quality": "hd",
    "max_tokens": 1000
  }
}'
```

### 2. Set Content Generation Rules

```bash
# Add content rules
wrangler kv:key put --binding=CONFIG_KV "content_rules" '{
  "themes": ["cute", "funny", "heartwarming", "educational"],
  "avoid": ["violence", "sad", "controversial"],
  "hashtags": ["#CatsOfFacebook", "#CatLovers", "#Meow", "#Caturday"],
  "posting_times": ["08:00", "14:00", "20:00"],
  "timezone": "America/New_York"
}'
```

## Content Sources Setup

### 1. Configure Reddit Scraping

```bash
# Add subreddit configuration
wrangler kv:key put --binding=CONFIG_KV "reddit_config" '{
  "subreddits": ["cats", "aww", "catpictures", "catgifs"],
  "min_score": 100,
  "max_age_hours": 24,
  "avoid_crosspost": true
}'
```

### 2. Configure News Sources

```bash
# Add news configuration
wrangler kv:key put --binding=CONFIG_KV "news_config" '{
  "keywords": ["cats", "kittens", "feline", "pet cats"],
  "exclude_domains": ["example.com"],
  "languages": ["en"],
  "sort_by": "popularity"
}'
```

## Production Deployment

### 1. Enable Cron Triggers

Update `wrangler.toml`:
```toml
[triggers]
crons = [
  "0 */6 * * *",      # Content discovery every 6 hours
  "0 8,14,20 * * *",  # Posting at 8 AM, 2 PM, 8 PM
  "0 2 * * *"         # Daily cleanup at 2 AM
]
```

Deploy with triggers:
```bash
wrangler deploy --env production
```

### 2. Configure Rate Limits

```bash
# Set rate limit rules
wrangler kv:key put --binding=CONFIG_KV "rate_limits" '{
  "facebook_api": {
    "requests_per_hour": 200,
    "posts_per_day": 50
  },
  "openai_api": {
    "requests_per_minute": 50,
    "images_per_minute": 5
  },
  "content_generation": {
    "max_per_hour": 20,
    "max_per_day": 100
  }
}'
```

### 3. Set Up Custom Domain (Optional)

```bash
# Add custom domain
wrangler domains add ccc-generator.yourdomain.com
```

## Monitoring and Maintenance

### 1. Enable Cloudflare Analytics

1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages > Analytics
3. Enable detailed logging
4. Set up alerts for errors

### 2. Implement Health Checks

```bash
# Add health check endpoint monitoring
curl https://ccc-fb-generator.mabdulrahim.workers.dev/health

# Set up external monitoring (e.g., UptimeRobot)
```

### 3. Log Analysis

```bash
# View real-time logs
wrangler tail

# Export logs for analysis
wrangler tail --format json > logs.json
```

### 4. Database Maintenance

```bash
# Backup database
wrangler d1 execute ccc-content-db --command "SELECT * FROM content" > backup.json

# Clean old data (30 days)
wrangler d1 execute ccc-content-db --command "DELETE FROM content WHERE created_at < datetime('now', '-30 days')"
```

## Testing Strategy

### 1. Unit Tests

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage
```

### 2. Integration Tests

```bash
# Test AI integrations
npm run test:ai

# Test Facebook posting
npm run test:facebook

# Test content discovery
npm run test:discovery
```

### 3. End-to-End Tests

```bash
# Run Playwright tests
npm run test:e2e

# Test full content generation pipeline
npm run test:pipeline
```

### 4. Load Testing

```bash
# Test rate limiting
npm run test:load

# Stress test API endpoints
artillery run load-test.yml
```

## Security Checklist

### 1. API Security
- [ ] All API keys stored as secrets
- [ ] Rate limiting enabled on all endpoints
- [ ] Request signing implemented
- [ ] CORS properly configured

### 2. Content Security
- [ ] Input validation on all user inputs
- [ ] Content filtering for inappropriate material
- [ ] Watermarking enabled for generated images
- [ ] DMCA compliance system active

### 3. Data Security
- [ ] Encryption at rest for sensitive data
- [ ] Regular security audits
- [ ] Access logs monitored
- [ ] Backup strategy implemented

### 4. Compliance
- [ ] Facebook Platform Policy compliance
- [ ] Copyright attribution system
- [ ] Privacy policy updated
- [ ] Terms of service defined

## Scaling Considerations

### 1. Performance Optimization

```javascript
// Enable caching headers
app.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'public, max-age=3600');
});

// Use Cloudflare Cache API
const cache = caches.default;
```

### 2. Cost Management

```bash
# Monitor usage
wrangler usage

# Set spending alerts in Cloudflare dashboard
```

### 3. Multi-Region Deployment

```toml
# Add to wrangler.toml for geo-routing
[env.production.routes]
pattern = "ccc-generator.com/*"
zone_name = "ccc-generator.com"
```

### 4. Database Scaling

- Enable D1 read replicas
- Implement data archiving
- Use R2 for large media files
- Optimize queries with indexes

## Troubleshooting

### Common Issues

1. **Facebook API Errors**
   - Check token expiration
   - Verify page permissions
   - Monitor rate limits

2. **AI Generation Failures**
   - Check API key validity
   - Monitor credit balance
   - Implement fallback models

3. **Performance Issues**
   - Enable caching
   - Optimize database queries
   - Use CDN for media

### Debug Commands

```bash
# Check worker status
wrangler tail --status

# View error logs
wrangler tail --level error

# Test specific functions
wrangler dev --local
```

## Maintenance Schedule

### Daily
- [ ] Monitor error rates
- [ ] Check content quality
- [ ] Review engagement metrics

### Weekly
- [ ] Database cleanup
- [ ] Performance analysis
- [ ] Cost review

### Monthly
- [ ] Security audit
- [ ] API key rotation
- [ ] Backup verification
- [ ] Dependency updates

## Support and Resources

- **Documentation**: [/docs](https://github.com/abdul712/ccc-fb-generator/docs)
- **Issues**: [GitHub Issues](https://github.com/abdul712/ccc-fb-generator/issues)
- **Cloudflare Support**: [Workers Discord](https://discord.gg/cloudflaredev)
- **API References**:
  - [Facebook Graph API](https://developers.facebook.com/docs/graph-api)
  - [OpenAI API](https://platform.openai.com/docs)
  - [Anthropic API](https://docs.anthropic.com)

## Next Steps

1. **Phase 1** (Week 1-2): Complete API setup and basic testing
2. **Phase 2** (Week 3-4): Implement content quality controls
3. **Phase 3** (Week 5-6): Launch with limited posting schedule
4. **Phase 4** (Week 7-8): Scale up based on performance metrics

---

Last Updated: January 2025