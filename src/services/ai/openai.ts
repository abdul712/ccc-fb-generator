import { Env } from '../../types/env';
import { Logger } from '../logger';

export interface OpenAIImageRequest {
  prompt: string;
  model?: 'dall-e-2' | 'dall-e-3';
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
}

export interface OpenAITextRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo';
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

export interface OpenAIImageResponse {
  created: number;
  data: Array<{
    url: string;
    revised_prompt?: string;
  }>;
}

export interface OpenAITextResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIService {
  private baseURL = 'https://api.openai.com/v1';

  constructor(
    private env: Env,
    private logger: Logger
  ) {}

  /**
   * Generate image using DALL-E
   */
  async generateImage(request: OpenAIImageRequest): Promise<OpenAIImageResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting OpenAI image generation', {
        model: request.model || 'dall-e-3',
        prompt: request.prompt.substring(0, 100) + '...'
      });

      const response = await fetch(`${this.baseURL}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: request.prompt,
          model: request.model || 'dall-e-3',
          size: request.size || '1024x1024',
          quality: request.quality || 'standard',
          style: request.style || 'vivid',
          n: request.n || 1
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json() as OpenAIImageResponse;
      const duration = Date.now() - startTime;

      this.logger.logAPICall('openai', '/images/generations', 'POST', duration, response.status);
      this.logger.info('OpenAI image generation completed', { 
        duration, 
        imagesGenerated: result.data.length 
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('openai', '/images/generations', 'POST', duration, undefined, error as Error);
      throw new Error(`OpenAI image generation failed: ${error}`);
    }
  }

  /**
   * Generate text using GPT
   */
  async generateText(request: OpenAITextRequest): Promise<OpenAITextResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting OpenAI text generation', {
        model: request.model || 'gpt-4',
        messages: request.messages.length
      });

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: request.messages,
          model: request.model || 'gpt-4',
          max_tokens: request.max_tokens || 1000,
          temperature: request.temperature || 0.7,
          top_p: request.top_p || 1
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json() as OpenAITextResponse;
      const duration = Date.now() - startTime;

      this.logger.logAPICall('openai', '/chat/completions', 'POST', duration, response.status);
      this.logger.info('OpenAI text generation completed', { 
        duration, 
        tokensUsed: result.usage.total_tokens 
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('openai', '/chat/completions', 'POST', duration, undefined, error as Error);
      throw new Error(`OpenAI text generation failed: ${error}`);
    }
  }

  /**
   * Generate cat image with optimized prompt
   */
  async generateCatImage(
    basePrompt: string, 
    style: 'realistic' | 'cartoon' | 'artistic' | 'meme' = 'realistic'
  ): Promise<{
    imageUrl: string;
    prompt: string;
    revisedPrompt?: string;
  }> {
    const stylePrompts = {
      realistic: 'photorealistic, high quality, detailed, beautiful lighting',
      cartoon: 'cartoon style, cute, colorful, friendly, animated style',
      artistic: 'artistic, painterly, beautiful composition, creative',
      meme: 'funny, meme-worthy, expressive, humorous'
    };

    const enhancedPrompt = `${basePrompt}, ${stylePrompts[style]}, cat, adorable, high quality`;

    const result = await this.generateImage({
      prompt: enhancedPrompt,
      model: 'dall-e-3',
      size: '1024x1024',
      quality: 'hd',
      style: 'vivid'
    });

    return {
      imageUrl: result.data[0].url,
      prompt: enhancedPrompt,
      revisedPrompt: result.data[0].revised_prompt
    };
  }

  /**
   * Generate cat caption
   */
  async generateCatCaption(
    imageDescription: string,
    tone: 'funny' | 'heartwarming' | 'educational' | 'engaging' = 'engaging'
  ): Promise<string> {
    const toneInstructions = {
      funny: 'Write a funny, humorous caption that will make people laugh.',
      heartwarming: 'Write a heartwarming, touching caption that evokes positive emotions.',
      educational: 'Write an educational caption that teaches something interesting about cats.',
      engaging: 'Write an engaging caption that encourages interaction and shares.'
    };

    const result = await this.generateText({
      messages: [
        {
          role: 'system',
          content: `You are a social media expert specializing in cat content. ${toneInstructions[tone]} Keep it under 280 characters. Include relevant hashtags.`
        },
        {
          role: 'user',
          content: `Create a caption for this cat image: ${imageDescription}`
        }
      ],
      model: 'gpt-4',
      max_tokens: 150,
      temperature: 0.8
    });

    return result.choices[0].message.content;
  }

  /**
   * Generate cat story
   */
  async generateCatStory(
    theme: string,
    length: 'short' | 'medium' | 'long' = 'medium'
  ): Promise<string> {
    const lengthInstructions = {
      short: 'Write a short story (100-200 words)',
      medium: 'Write a medium-length story (200-400 words)',
      long: 'Write a longer story (400-600 words)'
    };

    const result = await this.generateText({
      messages: [
        {
          role: 'system',
          content: `You are a creative writer who specializes in heartwarming cat stories. ${lengthInstructions[length]} that features cats and relates to: ${theme}. Make it engaging and suitable for social media sharing.`
        },
        {
          role: 'user',
          content: `Write a cat story about: ${theme}`
        }
      ],
      model: 'gpt-4',
      max_tokens: length === 'long' ? 800 : length === 'medium' ? 500 : 300,
      temperature: 0.8
    });

    return result.choices[0].message.content;
  }

  /**
   * Analyze image and generate description
   */
  async analyzeImage(imageUrl: string): Promise<string> {
    const result = await this.generateText({
      messages: [
        {
          role: 'system',
          content: 'You are an AI that analyzes images. Describe what you see in detail, focusing on cats if present.'
        },
        {
          role: 'user',
          content: `Analyze this image: ${imageUrl}`
        }
      ],
      model: 'gpt-4',
      max_tokens: 300
    });

    return result.choices[0].message.content;
  }

  /**
   * Generate hashtags for cat content
   */
  async generateHashtags(content: string, count: number = 10): Promise<string[]> {
    const result = await this.generateText({
      messages: [
        {
          role: 'system',
          content: `Generate ${count} relevant hashtags for cat-related social media content. Return only the hashtags, one per line, with # included.`
        },
        {
          role: 'user',
          content: `Content: ${content}`
        }
      ],
      model: 'gpt-3.5-turbo',
      max_tokens: 200
    });

    return result.choices[0].message.content
      .split('\n')
      .filter(tag => tag.trim().startsWith('#'))
      .map(tag => tag.trim())
      .slice(0, count);
  }

  /**
   * Check API quota and limits
   */
  async checkQuota(): Promise<{
    available: boolean;
    details?: any;
  }> {
    try {
      // OpenAI doesn't provide a direct quota endpoint, 
      // but we can make a minimal request to check if API is working
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`
        }
      });

      return {
        available: response.ok,
        details: response.ok ? null : await response.text()
      };
    } catch (error) {
      this.logger.error('OpenAI quota check failed', error as Error);
      return {
        available: false,
        details: error
      };
    }
  }
}