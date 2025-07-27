import { Env } from '../types/env';

export interface ContentRecord {
  id: string;
  type: 'image' | 'video' | 'text' | 'meme' | 'story';
  source?: string;
  source_url?: string;
  prompt?: string;
  generated_content_url?: string;
  caption?: string;
  hashtags?: string; // JSON array
  status: 'pending' | 'generating' | 'ready' | 'approved' | 'rejected' | 'scheduled' | 'posted' | 'failed';
  ai_provider?: string;
  generation_metadata?: string; // JSON
  created_at: string;
  updated_at: string;
  scheduled_at?: string;
  posted_at?: string;
}

export interface PerformanceMetric {
  id: number;
  content_id: string;
  fb_post_id?: string;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  reactions_love: number;
  reactions_haha: number;
  reactions_wow: number;
  reactions_sad: number;
  reactions_angry: number;
  engagement_rate: number;
  reach: number;
  impressions: number;
  click_through_rate: number;
  measured_at: string;
}

export interface SchedulingQueueItem {
  id: number;
  content_id: string;
  scheduled_time: string;
  fb_post_id?: string;
  status: 'queued' | 'scheduled' | 'posting' | 'posted' | 'failed' | 'cancelled';
  retry_count: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export class DatabaseService {
  constructor(private env: Env) {}

  // Content operations
  async createContent(content: Partial<ContentRecord>): Promise<ContentRecord> {
    const id = content.id || crypto.randomUUID();
    const now = new Date().toISOString();
    
    const stmt = this.env.DB.prepare(`
      INSERT INTO content (
        id, type, source, source_url, prompt, generated_content_url,
        caption, hashtags, status, ai_provider, generation_metadata,
        created_at, updated_at, scheduled_at, posted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      id,
      content.type || 'text',
      content.source || null,
      content.source_url || null,
      content.prompt || null,
      content.generated_content_url || null,
      content.caption || null,
      content.hashtags || null,
      content.status || 'pending',
      content.ai_provider || null,
      content.generation_metadata || null,
      now,
      now,
      content.scheduled_at || null,
      content.posted_at || null
    ).run();
    
    return this.getContentById(id);
  }

  async getContentById(id: string): Promise<ContentRecord> {
    const stmt = this.env.DB.prepare('SELECT * FROM content WHERE id = ?');
    const result = await stmt.bind(id).first();
    
    if (!result) {
      throw new Error(`Content with id ${id} not found`);
    }
    
    return result as ContentRecord;
  }

  async updateContentStatus(id: string, status: ContentRecord['status'], metadata?: any): Promise<void> {
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const values: any[] = [status, new Date().toISOString()];
    
    if (metadata) {
      updates.push('generation_metadata = ?');
      values.push(JSON.stringify(metadata));
    }
    
    if (status === 'posted') {
      updates.push('posted_at = ?');
      values.push(new Date().toISOString());
    }
    
    const stmt = this.env.DB.prepare(`
      UPDATE content SET ${updates.join(', ')} WHERE id = ?
    `);
    
    await stmt.bind(...values, id).run();
  }

  async getContentByStatus(status: ContentRecord['status'], limit = 50): Promise<ContentRecord[]> {
    const stmt = this.env.DB.prepare(`
      SELECT * FROM content 
      WHERE status = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    
    const result = await stmt.bind(status, limit).all();
    return result.results as ContentRecord[];
  }

  async getScheduledContent(beforeTime?: string): Promise<ContentRecord[]> {
    const time = beforeTime || new Date().toISOString();
    const stmt = this.env.DB.prepare(`
      SELECT * FROM content 
      WHERE status = 'scheduled' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
    `);
    
    const result = await stmt.bind(time).all();
    return result.results as ContentRecord[];
  }

  // Scheduling operations
  async scheduleContent(contentId: string, scheduledTime: string): Promise<SchedulingQueueItem> {
    const stmt = this.env.DB.prepare(`
      INSERT INTO scheduling_queue (content_id, scheduled_time, status, created_at, updated_at)
      VALUES (?, ?, 'queued', ?, ?)
    `);
    
    const now = new Date().toISOString();
    const result = await stmt.bind(contentId, scheduledTime, now, now).run();
    
    // Update content status
    await this.updateContentStatus(contentId, 'scheduled');
    
    return this.getSchedulingQueueItem(result.meta.last_row_id as number);
  }

  async getSchedulingQueueItem(id: number): Promise<SchedulingQueueItem> {
    const stmt = this.env.DB.prepare('SELECT * FROM scheduling_queue WHERE id = ?');
    const result = await stmt.bind(id).first();
    
    if (!result) {
      throw new Error(`Scheduling queue item with id ${id} not found`);
    }
    
    return result as SchedulingQueueItem;
  }

  async updateSchedulingQueueStatus(
    id: number, 
    status: SchedulingQueueItem['status'], 
    fbPostId?: string,
    errorMessage?: string
  ): Promise<void> {
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const values: any[] = [status, new Date().toISOString()];
    
    if (fbPostId) {
      updates.push('fb_post_id = ?');
      values.push(fbPostId);
    }
    
    if (errorMessage) {
      updates.push('error_message = ?', 'retry_count = retry_count + 1');
      values.push(errorMessage);
    }
    
    const stmt = this.env.DB.prepare(`
      UPDATE scheduling_queue SET ${updates.join(', ')} WHERE id = ?
    `);
    
    await stmt.bind(...values, id).run();
  }

  // Performance metrics
  async recordPerformanceMetrics(metrics: Partial<PerformanceMetric>): Promise<void> {
    const stmt = this.env.DB.prepare(`
      INSERT INTO performance_metrics (
        content_id, fb_post_id, views, likes, shares, comments,
        reactions_love, reactions_haha, reactions_wow, reactions_sad, reactions_angry,
        engagement_rate, reach, impressions, click_through_rate, measured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      metrics.content_id,
      metrics.fb_post_id || null,
      metrics.views || 0,
      metrics.likes || 0,
      metrics.shares || 0,
      metrics.comments || 0,
      metrics.reactions_love || 0,
      metrics.reactions_haha || 0,
      metrics.reactions_wow || 0,
      metrics.reactions_sad || 0,
      metrics.reactions_angry || 0,
      metrics.engagement_rate || 0,
      metrics.reach || 0,
      metrics.impressions || 0,
      metrics.click_through_rate || 0,
      new Date().toISOString()
    ).run();
  }

  // Analytics and reporting
  async getContentStats(days = 30): Promise<any> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.env.DB.prepare(`
      SELECT 
        status,
        type,
        COUNT(*) as count,
        AVG(CASE WHEN pm.engagement_rate IS NOT NULL THEN pm.engagement_rate ELSE 0 END) as avg_engagement
      FROM content c
      LEFT JOIN performance_metrics pm ON c.id = pm.content_id
      WHERE c.created_at >= ?
      GROUP BY status, type
    `);
    
    const result = await stmt.bind(startDate).all();
    return result.results;
  }

  async getTopPerformingContent(limit = 10): Promise<any> {
    const stmt = this.env.DB.prepare(`
      SELECT 
        c.*,
        pm.engagement_rate,
        pm.likes + pm.shares + pm.comments as total_engagement
      FROM content c
      JOIN performance_metrics pm ON c.id = pm.content_id
      WHERE c.status = 'posted'
      ORDER BY pm.engagement_rate DESC, total_engagement DESC
      LIMIT ?
    `);
    
    const result = await stmt.bind(limit).all();
    return result.results;
  }

  // Configuration
  async getConfig(key: string): Promise<string | null> {
    const stmt = this.env.DB.prepare('SELECT value FROM app_config WHERE key = ?');
    const result = await stmt.bind(key).first();
    return result ? result.value as string : null;
  }

  async setConfig(key: string, value: string, description?: string): Promise<void> {
    const stmt = this.env.DB.prepare(`
      INSERT OR REPLACE INTO app_config (key, value, description, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    
    await stmt.bind(key, value, description || null, new Date().toISOString()).run();
  }
}