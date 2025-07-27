import { Env } from '../types/env';

export interface StorageMetadata {
  contentType: string;
  contentId: string;
  originalFilename?: string;
  generatedBy?: string;
  timestamp: string;
}

export class StorageService {
  constructor(private env: Env) {}

  /**
   * Upload media content to R2 storage
   */
  async uploadMedia(
    key: string,
    content: ArrayBuffer | ReadableStream | Blob,
    metadata: StorageMetadata
  ): Promise<string> {
    try {
      const object = await this.env.MEDIA_BUCKET.put(key, content, {
        customMetadata: {
          contentType: metadata.contentType,
          contentId: metadata.contentId,
          originalFilename: metadata.originalFilename || '',
          generatedBy: metadata.generatedBy || '',
          timestamp: metadata.timestamp
        },
        httpMetadata: {
          contentType: metadata.contentType,
          cacheControl: 'public, max-age=31536000', // 1 year cache
        }
      });

      if (!object) {
        throw new Error('Failed to upload to R2');
      }

      // Return the public URL
      return this.getPublicUrl(key);
    } catch (error) {
      console.error('R2 upload failed:', error);
      throw new Error(`Storage upload failed: ${error}`);
    }
  }

  /**
   * Download media content from R2 storage
   */
  async downloadMedia(key: string): Promise<{
    content: ReadableStream | null;
    metadata: StorageMetadata | null;
  }> {
    try {
      const object = await this.env.MEDIA_BUCKET.get(key);
      
      if (!object) {
        return { content: null, metadata: null };
      }

      const metadata: StorageMetadata = {
        contentType: object.customMetadata?.contentType || 'application/octet-stream',
        contentId: object.customMetadata?.contentId || '',
        originalFilename: object.customMetadata?.originalFilename,
        generatedBy: object.customMetadata?.generatedBy,
        timestamp: object.customMetadata?.timestamp || new Date().toISOString()
      };

      return {
        content: object.body,
        metadata
      };
    } catch (error) {
      console.error('R2 download failed:', error);
      throw new Error(`Storage download failed: ${error}`);
    }
  }

  /**
   * Delete media content from R2 storage
   */
  async deleteMedia(key: string): Promise<boolean> {
    try {
      await this.env.MEDIA_BUCKET.delete(key);
      return true;
    } catch (error) {
      console.error('R2 delete failed:', error);
      return false;
    }
  }

  /**
   * List media objects with optional prefix
   */
  async listMedia(prefix?: string, limit = 100): Promise<string[]> {
    try {
      const options: any = { limit };
      if (prefix) {
        options.prefix = prefix;
      }

      const objects = await this.env.MEDIA_BUCKET.list(options);
      return objects.objects.map(obj => obj.key);
    } catch (error) {
      console.error('R2 list failed:', error);
      return [];
    }
  }

  /**
   * Get public URL for a media object
   */
  getPublicUrl(key: string): string {
    // In production, you would use your custom domain or R2 public URL
    // For now, return a placeholder that includes the key
    return `https://your-r2-domain.com/${key}`;
  }

  /**
   * Generate a unique storage key for content
   */
  generateStorageKey(contentId: string, type: string, extension: string): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `content/${date}/${type}/${contentId}.${extension}`;
  }

  /**
   * Upload generated image from AI service
   */
  async uploadGeneratedImage(
    contentId: string,
    imageBuffer: ArrayBuffer,
    provider: string,
    format: string = 'png'
  ): Promise<string> {
    const key = this.generateStorageKey(contentId, 'images', format);
    const metadata: StorageMetadata = {
      contentType: `image/${format}`,
      contentId,
      generatedBy: provider,
      timestamp: new Date().toISOString()
    };

    return this.uploadMedia(key, imageBuffer, metadata);
  }

  /**
   * Upload generated video from AI service
   */
  async uploadGeneratedVideo(
    contentId: string,
    videoBuffer: ArrayBuffer,
    provider: string,
    format: string = 'mp4'
  ): Promise<string> {
    const key = this.generateStorageKey(contentId, 'videos', format);
    const metadata: StorageMetadata = {
      contentType: `video/${format}`,
      contentId,
      generatedBy: provider,
      timestamp: new Date().toISOString()
    };

    return this.uploadMedia(key, videoBuffer, metadata);
  }

  /**
   * Upload user-submitted content
   */
  async uploadUserContent(
    contentId: string,
    content: ArrayBuffer,
    originalFilename: string,
    contentType: string
  ): Promise<string> {
    const extension = originalFilename.split('.').pop() || 'bin';
    const key = this.generateStorageKey(contentId, 'user-uploads', extension);
    const metadata: StorageMetadata = {
      contentType,
      contentId,
      originalFilename,
      timestamp: new Date().toISOString()
    };

    return this.uploadMedia(key, content, metadata);
  }

  /**
   * Clean up old content based on retention policy
   */
  async cleanupOldContent(retentionDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const allObjects = await this.env.MEDIA_BUCKET.list({ limit: 1000 });
      
      let deletedCount = 0;
      
      for (const object of allObjects.objects) {
        if (object.uploaded && new Date(object.uploaded) < cutoffDate) {
          await this.deleteMedia(object.key);
          deletedCount++;
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalObjects: number;
    totalSize: number;
    objectsByType: Record<string, number>;
  }> {
    try {
      const objects = await this.env.MEDIA_BUCKET.list({ limit: 1000 });
      
      const stats = {
        totalObjects: objects.objects.length,
        totalSize: objects.objects.reduce((sum, obj) => sum + (obj.size || 0), 0),
        objectsByType: {} as Record<string, number>
      };

      // Count objects by type based on key prefix
      for (const object of objects.objects) {
        const type = object.key.split('/')[1] || 'unknown';
        stats.objectsByType[type] = (stats.objectsByType[type] || 0) + 1;
      }

      return stats;
    } catch (error) {
      console.error('Storage stats failed:', error);
      return {
        totalObjects: 0,
        totalSize: 0,
        objectsByType: {}
      };
    }
  }
}