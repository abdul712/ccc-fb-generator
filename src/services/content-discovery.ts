import { Env } from '../types/env';
import { Logger } from './logger';
import { CacheService } from './cache';

export interface DiscoveredContent {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  videoUrl?: string;
  sourceUrl: string;
  source: 'reddit' | 'twitter' | 'news' | 'web_scrape';
  sourceName: string; // subreddit, twitter handle, etc.
  author?: string;
  score?: number; // upvotes, likes, etc.
  engagementCount?: number;
  createdAt: Date;
  tags: string[];
  contentType: 'image' | 'video' | 'text' | 'link';
  quality: number; // 0-1 quality score
}

export interface RedditPost {
  id: string;
  title: string;
  selftext?: string;
  url: string;
  thumbnail?: string;
  preview?: any;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  subreddit: string;
  permalink: string;
  is_video: boolean;
  over_18: boolean;
}

export interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics: {
    retweet_count: number;
    like_count: number;
    reply_count: number;
    quote_count: number;
  };
  attachments?: {
    media_keys: string[];
  };
  entities?: {
    hashtags?: Array<{ tag: string }>;
    urls?: Array<{ expanded_url: string }>;
  };
}

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  source: {
    id: string;
    name: string;
  };
  content: string;
}

export class ContentDiscoveryService {
  private cache: CacheService;

  constructor(
    private env: Env,
    private logger: Logger
  ) {
    this.cache = new CacheService(env);
  }

  /**
   * Discover content from all sources
   */
  async discoverContent(
    maxItems: number = 50,
    sources: Array<'reddit' | 'twitter' | 'news'> = ['reddit', 'twitter', 'news']
  ): Promise<DiscoveredContent[]> {
    const allContent: DiscoveredContent[] = [];

    try {
      this.logger.info('Starting content discovery', { sources, maxItems });

      // Parallel discovery from all sources
      const promises = [];

      if (sources.includes('reddit')) {
        promises.push(this.discoverFromReddit(Math.ceil(maxItems / sources.length)));
      }

      if (sources.includes('twitter')) {
        promises.push(this.discoverFromTwitter(Math.ceil(maxItems / sources.length)));
      }

      if (sources.includes('news')) {
        promises.push(this.discoverFromNews(Math.ceil(maxItems / sources.length)));
      }

      const results = await Promise.allSettled(promises);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          allContent.push(...result.value);
        } else {
          this.logger.warn('Content discovery source failed', { error: result.reason });
        }
      }

      // Sort by quality and recency
      const sortedContent = allContent
        .sort((a, b) => {
          const scoreA = a.quality * 0.7 + (Date.now() - a.createdAt.getTime()) / (24 * 60 * 60 * 1000) * 0.3;
          const scoreB = b.quality * 0.7 + (Date.now() - b.createdAt.getTime()) / (24 * 60 * 60 * 1000) * 0.3;
          return scoreB - scoreA;
        })
        .slice(0, maxItems);

      this.logger.info('Content discovery completed', { 
        totalFound: allContent.length,
        afterFiltering: sortedContent.length
      });

      return sortedContent;
    } catch (error) {
      this.logger.error('Content discovery failed', error as Error);
      return [];
    }
  }

  /**
   * Discover content from Reddit
   */
  async discoverFromReddit(limit: number = 25): Promise<DiscoveredContent[]> {
    const subreddits = ['cats', 'aww', 'catpictures', 'CatsBeingCats', 'IllegallySmolCats'];
    const discovered: DiscoveredContent[] = [];

    try {
      // Check cache first
      for (const subreddit of subreddits) {
        const cached = await this.cache.getCachedRedditData(subreddit, 3600);
        if (cached) {
          discovered.push(...this.parseRedditContent(cached, subreddit));
          continue;
        }

        // Fetch new content
        const redditData = await this.fetchRedditSubreddit(subreddit, Math.ceil(limit / subreddits.length));
        if (redditData) {
          await this.cache.cacheRedditData(subreddit, redditData);
          discovered.push(...this.parseRedditContent(redditData, subreddit));
        }
      }

      return discovered.slice(0, limit);
    } catch (error) {
      this.logger.error('Reddit content discovery failed', error as Error);
      return [];
    }
  }

  /**
   * Fetch content from a Reddit subreddit
   */
  private async fetchRedditSubreddit(subreddit: string, limit: number = 25): Promise<RedditPost[] | null> {
    const startTime = Date.now();

    try {
      // Get access token
      const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${this.env.REDDIT_CLIENT_ID}:${this.env.REDDIT_CLIENT_SECRET}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CCC-FB-Generator/1.0'
        },
        body: 'grant_type=client_credentials'
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get Reddit access token');
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Fetch subreddit posts
      const response = await fetch(
        `https://oauth.reddit.com/r/${subreddit}/hot?limit=${limit}&raw_json=1`,
        {
          headers: {
            'Authorization': `bearer ${accessToken}`,
            'User-Agent': 'CCC-FB-Generator/1.0'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Reddit API error: ${response.statusText}`);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;

      this.logger.logAPICall('reddit', `/r/${subreddit}/hot`, 'GET', duration, response.status);

      return data.data.children.map((child: any) => child.data);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('reddit', `/r/${subreddit}/hot`, 'GET', duration, undefined, error as Error);
      return null;
    }
  }

  /**
   * Parse Reddit posts into DiscoveredContent format
   */
  private parseRedditContent(posts: RedditPost[], subreddit: string): DiscoveredContent[] {
    return posts
      .filter(post => 
        !post.over_18 && // Filter NSFW content
        post.score > 10 && // Minimum score threshold
        (post.url.includes('i.redd.it') || 
         post.url.includes('imgur.com') || 
         post.preview?.images?.length > 0 ||
         post.is_video)
      )
      .map(post => {
        let imageUrl: string | undefined;
        let contentType: 'image' | 'video' | 'text' | 'link' = 'text';

        if (post.is_video) {
          contentType = 'video';
        } else if (post.url.match(/\.(jpg|jpeg|png|gif)$/i) || post.preview?.images?.length > 0) {
          contentType = 'image';
          imageUrl = post.url.match(/\.(jpg|jpeg|png|gif)$/i) ? 
            post.url : 
            post.preview?.images[0]?.source?.url?.replace(/&amp;/g, '&');
        } else if (post.url !== `https://www.reddit.com${post.permalink}`) {
          contentType = 'link';
        }

        const quality = this.calculateRedditQuality(post);

        return {
          id: `reddit_${post.id}`,
          title: post.title,
          description: post.selftext?.substring(0, 300),
          imageUrl,
          videoUrl: post.is_video ? post.url : undefined,
          sourceUrl: `https://www.reddit.com${post.permalink}`,
          source: 'reddit' as const,
          sourceName: subreddit,
          author: post.author,
          score: post.score,
          engagementCount: post.num_comments,
          createdAt: new Date(post.created_utc * 1000),
          tags: [subreddit, 'reddit'],
          contentType,
          quality
        };
      });
  }

  /**
   * Calculate quality score for Reddit content
   */
  private calculateRedditQuality(post: RedditPost): number {
    let quality = 0;

    // Score-based quality (0-0.4)
    quality += Math.min(post.score / 1000, 0.4);

    // Engagement-based quality (0-0.3)
    if (post.num_comments > 0) {
      quality += Math.min(post.num_comments / 100, 0.3);
    }

    // Content type bonus (0-0.2)
    if (post.is_video || post.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
      quality += 0.2;
    }

    // Recency bonus (0-0.1)
    const hoursOld = (Date.now() - post.created_utc * 1000) / (1000 * 60 * 60);
    if (hoursOld < 24) {
      quality += 0.1 * (1 - hoursOld / 24);
    }

    return Math.min(quality, 1);
  }

  /**
   * Discover content from Twitter
   */
  async discoverFromTwitter(limit: number = 25): Promise<DiscoveredContent[]> {
    try {
      const hashtags = ['cats', 'catsofinstagram', 'catlife', 'kittens', 'cutecat'];
      const discovered: DiscoveredContent[] = [];

      // Note: This requires Twitter API v2 with proper authentication
      // For now, return empty array as this requires specific setup
      this.logger.warn('Twitter content discovery not yet implemented - requires API v2 setup');

      return discovered;
    } catch (error) {
      this.logger.error('Twitter content discovery failed', error as Error);
      return [];
    }
  }

  /**
   * Discover content from news sources
   */
  async discoverFromNews(limit: number = 10): Promise<DiscoveredContent[]> {
    const startTime = Date.now();

    try {
      const keywords = ['cat', 'cats', 'kitten', 'feline', 'pet'];
      const discovered: DiscoveredContent[] = [];

      for (const keyword of keywords.slice(0, 2)) { // Limit to avoid rate limits
        const response = await fetch(
          `https://newsapi.org/v2/everything?q=${keyword}&language=en&sortBy=popularity&pageSize=${Math.ceil(limit / 2)}&apiKey=${this.env.NEWS_API_KEY}`
        );

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const duration = Date.now() - startTime;

        this.logger.logAPICall('newsapi', '/everything', 'GET', duration, response.status);

        const articles: NewsArticle[] = data.articles || [];
        
        for (const article of articles) {
          if (this.isRelevantNewsArticle(article)) {
            discovered.push({
              id: `news_${this.hashString(article.url)}`,
              title: article.title,
              description: article.description,
              imageUrl: article.urlToImage,
              sourceUrl: article.url,
              source: 'news' as const,
              sourceName: article.source.name,
              createdAt: new Date(article.publishedAt),
              tags: ['news', keyword],
              contentType: 'link' as const,
              quality: this.calculateNewsQuality(article)
            });
          }
        }
      }

      return discovered.slice(0, limit);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('newsapi', '/everything', 'GET', duration, undefined, error as Error);
      this.logger.error('News content discovery failed', error as Error);
      return [];
    }
  }

  /**
   * Check if news article is relevant to cat content
   */
  private isRelevantNewsArticle(article: NewsArticle): boolean {
    const title = article.title.toLowerCase();
    const description = (article.description || '').toLowerCase();
    
    const catKeywords = ['cat', 'cats', 'kitten', 'feline', 'pet', 'animal'];
    const negativeKeywords = ['death', 'died', 'killed', 'accident', 'abuse', 'cruelty'];

    const hasPositiveKeyword = catKeywords.some(keyword => 
      title.includes(keyword) || description.includes(keyword)
    );

    const hasNegativeKeyword = negativeKeywords.some(keyword => 
      title.includes(keyword) || description.includes(keyword)
    );

    return hasPositiveKeyword && !hasNegativeKeyword && article.urlToImage;
  }

  /**
   * Calculate quality score for news articles
   */
  private calculateNewsQuality(article: NewsArticle): number {
    let quality = 0.5; // Base quality for news

    // Has image bonus
    if (article.urlToImage) {
      quality += 0.2;
    }

    // Reputable source bonus
    const reputableSources = ['bbc', 'cnn', 'reuters', 'associated press', 'npr'];
    if (reputableSources.some(source => 
      article.source.name.toLowerCase().includes(source)
    )) {
      quality += 0.2;
    }

    // Recency bonus
    const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60);
    if (hoursOld < 48) {
      quality += 0.1 * (1 - hoursOld / 48);
    }

    return Math.min(quality, 1);
  }

  /**
   * Simple hash function for generating IDs
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Filter content by quality and relevance
   */
  async filterContent(
    content: DiscoveredContent[],
    minQuality: number = 0.3,
    maxAge: number = 7 * 24 * 60 * 60 * 1000 // 7 days
  ): Promise<DiscoveredContent[]> {
    const now = Date.now();
    
    return content.filter(item => {
      // Quality filter
      if (item.quality < minQuality) {
        return false;
      }

      // Age filter
      if (now - item.createdAt.getTime() > maxAge) {
        return false;
      }

      // Content type filter (prefer images and videos)
      if (item.contentType === 'text' && !item.imageUrl) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get trending content by source
   */
  async getTrendingContent(
    source: 'reddit' | 'twitter' | 'news',
    timeframe: '1h' | '6h' | '24h' = '24h',
    limit: number = 10
  ): Promise<DiscoveredContent[]> {
    const hoursBack = timeframe === '1h' ? 1 : timeframe === '6h' ? 6 : 24;
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    let content: DiscoveredContent[] = [];

    switch (source) {
      case 'reddit':
        content = await this.discoverFromReddit(limit * 2);
        break;
      case 'twitter':
        content = await this.discoverFromTwitter(limit * 2);
        break;
      case 'news':
        content = await this.discoverFromNews(limit * 2);
        break;
    }

    return content
      .filter(item => item.createdAt >= cutoffTime)
      .sort((a, b) => {
        const scoreA = (a.score || 0) + (a.engagementCount || 0) * 2;
        const scoreB = (b.score || 0) + (b.engagementCount || 0) * 2;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }
}