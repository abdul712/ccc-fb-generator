import { Env } from '../types/env';
import { Logger } from './logger';

export interface FacebookPostData {
  message?: string;
  link?: string;
  picture?: string;
  name?: string;
  caption?: string;
  description?: string;
  scheduled_publish_time?: number;
  published?: boolean;
}

export interface FacebookPagePost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  updated_time: string;
  permalink_url: string;
  full_picture?: string;
  reactions?: {
    data: Array<{
      id: string;
      name: string;
      type: string;
    }>;
    summary: {
      total_count: number;
      can_like: boolean;
      has_liked: boolean;
    };
  };
  comments?: {
    data: Array<{
      id: string;
      message: string;
      created_time: string;
      from: {
        id: string;
        name: string;
      };
    }>;
    summary: {
      total_count: number;
      can_comment: boolean;
    };
  };
  shares?: {
    count: number;
  };
}

export interface FacebookInsights {
  post_impressions?: number;
  post_impressions_unique?: number;
  post_engaged_users?: number;
  post_negative_feedback?: number;
  post_clicks?: number;
  post_reactions_like_total?: number;
  post_reactions_love_total?: number;
  post_reactions_wow_total?: number;
  post_reactions_haha_total?: number;
  post_reactions_sorry_total?: number;
  post_reactions_anger_total?: number;
}

export class FacebookService {
  private baseURL = 'https://graph.facebook.com/v18.0';
  private pageId: string;

  constructor(
    private env: Env,
    private logger: Logger
  ) {
    // In a real implementation, you'd get this from your page access token
    this.pageId = 'YOUR_PAGE_ID'; // TODO: Extract from page access token
  }

  /**
   * Post content to Facebook page
   */
  async createPost(postData: FacebookPostData): Promise<{ id: string; post_id?: string }> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Creating Facebook post', {
        scheduled: postData.scheduled_publish_time ? true : false,
        hasImage: postData.picture ? true : false
      });

      const response = await fetch(`${this.baseURL}/${this.pageId}/feed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...postData,
          access_token: this.env.FACEBOOK_PAGE_ACCESS_TOKEN
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Facebook API error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      this.logger.logAPICall('facebook', '/feed', 'POST', duration, response.status);
      this.logger.logFacebookPost(result.id, result.post_id || result.id, 'posted');

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('facebook', '/feed', 'POST', duration, undefined, error as Error);
      this.logger.logFacebookPost('unknown', null, 'failed', error as Error);
      throw new Error(`Facebook post creation failed: ${error}`);
    }
  }

  /**
   * Schedule a post for later publishing
   */
  async schedulePost(postData: FacebookPostData, scheduledTime: Date): Promise<{ id: string }> {
    const scheduledTimestamp = Math.floor(scheduledTime.getTime() / 1000);
    
    return this.createPost({
      ...postData,
      scheduled_publish_time: scheduledTimestamp,
      published: false
    });
  }

  /**
   * Upload photo to Facebook and get photo ID
   */
  async uploadPhoto(imageUrl: string, caption?: string): Promise<{ id: string }> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Uploading photo to Facebook', { imageUrl: imageUrl.substring(0, 50) + '...' });

      const response = await fetch(`${this.baseURL}/${this.pageId}/photos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: imageUrl,
          caption: caption || '',
          published: false, // Upload without publishing
          access_token: this.env.FACEBOOK_PAGE_ACCESS_TOKEN
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Facebook photo upload error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      this.logger.logAPICall('facebook', '/photos', 'POST', duration, response.status);
      this.logger.info('Facebook photo uploaded successfully', { photoId: result.id });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('facebook', '/photos', 'POST', duration, undefined, error as Error);
      throw new Error(`Facebook photo upload failed: ${error}`);
    }
  }

  /**
   * Post with photo
   */
  async createPhotoPost(
    imageUrl: string,
    message: string,
    scheduledTime?: Date
  ): Promise<{ id: string; post_id?: string }> {
    try {
      // First upload the photo
      const photo = await this.uploadPhoto(imageUrl, message);
      
      // Then create the post with the photo
      const postData: any = {
        message,
        object_attachment: photo.id
      };

      if (scheduledTime) {
        return this.schedulePost(postData, scheduledTime);
      } else {
        return this.createPost({ ...postData, published: true });
      }
    } catch (error) {
      throw new Error(`Facebook photo post failed: ${error}`);
    }
  }

  /**
   * Get post details and engagement metrics
   */
  async getPost(postId: string): Promise<FacebookPagePost> {
    const startTime = Date.now();
    
    try {
      const fields = [
        'id', 'message', 'story', 'created_time', 'updated_time',
        'permalink_url', 'full_picture',
        'reactions.summary(total_count)',
        'comments.summary(total_count)',
        'shares'
      ].join(',');

      const response = await fetch(
        `${this.baseURL}/${postId}?fields=${fields}&access_token=${this.env.FACEBOOK_PAGE_ACCESS_TOKEN}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Facebook API error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      this.logger.logAPICall('facebook', `/${postId}`, 'GET', duration, response.status);

      return result as FacebookPagePost;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('facebook', `/${postId}`, 'GET', duration, undefined, error as Error);
      throw new Error(`Failed to get Facebook post: ${error}`);
    }
  }

  /**
   * Get post insights/analytics
   */
  async getPostInsights(postId: string): Promise<FacebookInsights> {
    const startTime = Date.now();
    
    try {
      const metrics = [
        'post_impressions',
        'post_impressions_unique',
        'post_engaged_users',
        'post_negative_feedback',
        'post_clicks',
        'post_reactions_like_total',
        'post_reactions_love_total',
        'post_reactions_wow_total',
        'post_reactions_haha_total',
        'post_reactions_sorry_total',
        'post_reactions_anger_total'
      ].join(',');

      const response = await fetch(
        `${this.baseURL}/${postId}/insights?metric=${metrics}&access_token=${this.env.FACEBOOK_PAGE_ACCESS_TOKEN}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Facebook insights error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      this.logger.logAPICall('facebook', `/${postId}/insights`, 'GET', duration, response.status);

      // Transform the insights data into a more usable format
      const insights: FacebookInsights = {};
      for (const insight of result.data) {
        insights[insight.name as keyof FacebookInsights] = insight.values[0]?.value || 0;
      }

      return insights;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('facebook', `/${postId}/insights`, 'GET', duration, undefined, error as Error);
      throw new Error(`Failed to get Facebook insights: ${error}`);
    }
  }

  /**
   * Get page posts with pagination
   */
  async getPagePosts(limit: number = 25, since?: Date, until?: Date): Promise<{
    data: FacebookPagePost[];
    paging?: {
      previous?: string;
      next?: string;
    };
  }> {
    const startTime = Date.now();
    
    try {
      let url = `${this.baseURL}/${this.pageId}/posts?limit=${limit}&access_token=${this.env.FACEBOOK_PAGE_ACCESS_TOKEN}`;
      
      if (since) {
        url += `&since=${Math.floor(since.getTime() / 1000)}`;
      }
      
      if (until) {
        url += `&until=${Math.floor(until.getTime() / 1000)}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Facebook API error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      this.logger.logAPICall('facebook', '/posts', 'GET', duration, response.status);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('facebook', '/posts', 'GET', duration, undefined, error as Error);
      throw new Error(`Failed to get page posts: ${error}`);
    }
  }

  /**
   * Delete a post
   */
  async deletePost(postId: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(
        `${this.baseURL}/${postId}?access_token=${this.env.FACEBOOK_PAGE_ACCESS_TOKEN}`,
        { method: 'DELETE' }
      );

      const duration = Date.now() - startTime;
      this.logger.logAPICall('facebook', `/${postId}`, 'DELETE', duration, response.status);

      return response.ok;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('facebook', `/${postId}`, 'DELETE', duration, undefined, error as Error);
      return false;
    }
  }

  /**
   * Get scheduled posts
   */
  async getScheduledPosts(): Promise<FacebookPagePost[]> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(
        `${this.baseURL}/${this.pageId}/promotable_posts?is_published=false&access_token=${this.env.FACEBOOK_PAGE_ACCESS_TOKEN}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Facebook API error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      this.logger.logAPICall('facebook', '/promotable_posts', 'GET', duration, response.status);

      return result.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('facebook', '/promotable_posts', 'GET', duration, undefined, error as Error);
      throw new Error(`Failed to get scheduled posts: ${error}`);
    }
  }

  /**
   * Validate page access token
   */
  async validateToken(): Promise<{
    valid: boolean;
    pageId?: string;
    pageName?: string;
    permissions?: string[];
  }> {
    try {
      const response = await fetch(
        `${this.baseURL}/me?access_token=${this.env.FACEBOOK_PAGE_ACCESS_TOKEN}`
      );

      if (!response.ok) {
        return { valid: false };
      }

      const pageInfo = await response.json();
      
      // Check permissions
      const permissionsResponse = await fetch(
        `${this.baseURL}/me/permissions?access_token=${this.env.FACEBOOK_PAGE_ACCESS_TOKEN}`
      );
      
      const permissions = permissionsResponse.ok ? 
        (await permissionsResponse.json()).data.map((p: any) => p.permission) : 
        [];

      return {
        valid: true,
        pageId: pageInfo.id,
        pageName: pageInfo.name,
        permissions
      };
    } catch (error) {
      this.logger.error('Facebook token validation failed', error as Error);
      return { valid: false };
    }
  }

  /**
   * Get optimal posting times based on page insights
   */
  async getOptimalPostingTimes(): Promise<{
    hourly: Record<number, number>;
    daily: Record<number, number>;
    recommendations: Array<{ hour: number; day: number; score: number }>;
  }> {
    try {
      // This would require page insights data
      // For now, return common optimal times for cat content
      const hourly = {
        6: 0.3, 7: 0.5, 8: 0.8, 9: 0.7, 10: 0.6, 11: 0.5, 12: 0.9,
        13: 0.8, 14: 1.0, 15: 0.9, 16: 0.8, 17: 0.9, 18: 1.0, 19: 0.9,
        20: 1.0, 21: 0.8, 22: 0.6, 23: 0.4, 0: 0.2, 1: 0.1, 2: 0.1,
        3: 0.1, 4: 0.1, 5: 0.2
      };

      const daily = {
        0: 0.6, 1: 0.8, 2: 1.0, 3: 0.9, 4: 0.8, 5: 0.7, 6: 0.5
      }; // Sunday = 0

      const recommendations = [
        { hour: 14, day: 2, score: 1.0 }, // Tuesday 2 PM
        { hour: 20, day: 2, score: 0.95 }, // Tuesday 8 PM
        { hour: 18, day: 3, score: 0.9 }, // Wednesday 6 PM
        { hour: 12, day: 4, score: 0.85 }, // Thursday 12 PM
        { hour: 14, day: 6, score: 0.8 }  // Saturday 2 PM
      ];

      return { hourly, daily, recommendations };
    } catch (error) {
      this.logger.error('Failed to get optimal posting times', error as Error);
      return {
        hourly: {},
        daily: {},
        recommendations: []
      };
    }
  }
}