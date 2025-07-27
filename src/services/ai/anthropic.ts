import { Env } from '../../types/env';
import { Logger } from '../logger';

export interface AnthropicTextRequest {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  model?: 'claude-3-5-sonnet-20241022' | 'claude-3-opus-20240229' | 'claude-3-haiku-20240307';
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

export interface AnthropicTextResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicService {
  private baseURL = 'https://api.anthropic.com/v1';

  constructor(
    private env: Env,
    private logger: Logger
  ) {}

  /**
   * Generate text using Claude
   */
  async generateText(request: AnthropicTextRequest): Promise<AnthropicTextResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting Anthropic text generation', {
        model: request.model || 'claude-3-5-sonnet-20241022',
        messages: request.messages.length
      });

      const response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.ANTHROPIC_API_KEY}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: request.model || 'claude-3-5-sonnet-20241022',
          max_tokens: request.max_tokens || 1000,
          temperature: request.temperature || 0.7,
          system: request.system,
          messages: request.messages
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json() as AnthropicTextResponse;
      const duration = Date.now() - startTime;

      this.logger.logAPICall('anthropic', '/messages', 'POST', duration, response.status);
      this.logger.info('Anthropic text generation completed', { 
        duration, 
        tokensUsed: result.usage.input_tokens + result.usage.output_tokens 
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.logAPICall('anthropic', '/messages', 'POST', duration, undefined, error as Error);
      throw new Error(`Anthropic text generation failed: ${error}`);
    }
  }

  /**
   * Generate creative cat story using Claude
   */
  async generateCatStory(
    theme: string,
    style: 'narrative' | 'dialogue' | 'diary' | 'adventure' = 'narrative',
    length: 'short' | 'medium' | 'long' = 'medium'
  ): Promise<string> {
    const lengthInstructions = {
      short: '150-300 words',
      medium: '300-500 words',
      long: '500-800 words'
    };

    const styleInstructions = {
      narrative: 'Write in third person narrative style with rich descriptions',
      dialogue: 'Focus on dialogue between characters, showing personality through speech',
      diary: 'Write as diary entries from a cat\'s perspective',
      adventure: 'Create an exciting adventure story with action and suspense'
    };

    const result = await this.generateText({
      system: `You are a creative writer specializing in heartwarming and engaging cat stories. Your stories should be suitable for social media sharing and appeal to cat lovers of all ages. ${styleInstructions[style]}.`,
      messages: [
        {
          role: 'user',
          content: `Write a ${length} cat story (${lengthInstructions[length]}) about: ${theme}. Make it engaging, heartwarming, and perfect for social media sharing.`
        }
      ],
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: length === 'long' ? 1000 : length === 'medium' ? 600 : 400,
      temperature: 0.8
    });

    return result.content[0].text;
  }

  /**
   * Generate engaging cat captions
   */
  async generateCatCaption(
    imageDescription: string,
    tone: 'witty' | 'heartwarming' | 'playful' | 'inspiring' = 'playful',
    includeHashtags: boolean = true
  ): Promise<string> {
    const toneInstructions = {
      witty: 'clever, humorous, and slightly sarcastic',
      heartwarming: 'touching, emotional, and uplifting',
      playful: 'fun, energetic, and lighthearted',
      inspiring: 'motivational, positive, and encouraging'
    };

    const hashtagInstruction = includeHashtags ? 
      'Include 3-5 relevant hashtags at the end.' : 
      'Do not include hashtags.';

    const result = await this.generateText({
      system: `You are a social media expert who creates engaging content for cat lovers. Write captions that are ${toneInstructions[tone]}. Keep captions under 280 characters including hashtags. ${hashtagInstruction}`,
      messages: [
        {
          role: 'user',
          content: `Create a ${tone} caption for this cat image: ${imageDescription}`
        }
      ],
      model: 'claude-3-haiku-20240307',
      max_tokens: 150,
      temperature: 0.8
    });

    return result.content[0].text;
  }

  /**
   * Generate cat facts and educational content
   */
  async generateCatFact(
    category: 'behavior' | 'health' | 'history' | 'breeds' | 'general' = 'general',
    style: 'fun' | 'scientific' | 'simple' = 'fun'
  ): Promise<string> {
    const categoryPrompts = {
      behavior: 'cat behavior, psychology, and instincts',
      health: 'cat health, wellness, and care tips',
      history: 'cat history, evolution, and cultural significance',
      breeds: 'cat breeds, characteristics, and origins',
      general: 'interesting and surprising facts about cats'
    };

    const styleInstructions = {
      fun: 'Make it entertaining and engaging for social media',
      scientific: 'Include scientific details while keeping it accessible',
      simple: 'Keep it simple and easy to understand for all ages'
    };

    const result = await this.generateText({
      system: `You are a cat expert who shares fascinating facts about cats. Focus on ${categoryPrompts[category]}. ${styleInstructions[style]}. Keep it to 2-3 sentences maximum.`,
      messages: [
        {
          role: 'user',
          content: `Share an interesting fact about ${category === 'general' ? 'cats' : category}`
        }
      ],
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      temperature: 0.7
    });

    return result.content[0].text;
  }

  /**
   * Generate meme text for cat images
   */
  async generateMemeText(
    imageDescription: string,
    memeStyle: 'classic' | 'modern' | 'wholesome' | 'relatable' = 'relatable'
  ): Promise<{
    topText: string;
    bottomText: string;
  }> {
    const styleInstructions = {
      classic: 'Use classic meme format with setup and punchline',
      modern: 'Use current internet humor and trends',
      wholesome: 'Keep it positive, family-friendly, and heartwarming',
      relatable: 'Focus on relatable everyday situations cat owners experience'
    };

    const result = await this.generateText({
      system: `You are a meme creator specializing in cat memes. ${styleInstructions[memeStyle]}. Create top and bottom text for a meme format. Keep each line under 30 characters when possible.`,
      messages: [
        {
          role: 'user',
          content: `Create meme text for this cat image: ${imageDescription}. Format your response as:
TOP: [top text]
BOTTOM: [bottom text]`
        }
      ],
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      temperature: 0.9
    });

    const text = result.content[0].text;
    const lines = text.split('\n').filter(line => line.trim());
    
    let topText = '';
    let bottomText = '';
    
    for (const line of lines) {
      if (line.toUpperCase().startsWith('TOP:')) {
        topText = line.substring(4).trim();
      } else if (line.toUpperCase().startsWith('BOTTOM:')) {
        bottomText = line.substring(7).trim();
      }
    }

    return {
      topText: topText || 'WHEN YOU SEE',
      bottomText: bottomText || 'A CUTE CAT'
    };
  }

  /**
   * Generate content series ideas
   */
  async generateContentSeries(
    theme: string,
    episodes: number = 5
  ): Promise<Array<{
    title: string;
    description: string;
    contentType: 'story' | 'fact' | 'tip' | 'meme';
  }>> {
    const result = await this.generateText({
      system: `You are a content strategist for cat-related social media. Create a series of ${episodes} related content pieces around a theme. Each should be different types (story, fact, tip, meme) but connected by the overall theme.`,
      messages: [
        {
          role: 'user',
          content: `Create a ${episodes}-part content series about: ${theme}. Format each as:
EPISODE X:
Type: [story/fact/tip/meme]
Title: [engaging title]
Description: [brief description of content]

---`
        }
      ],
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 800,
      temperature: 0.8
    });

    // Parse the response into structured data
    const text = result.content[0].text;
    const episodes_data = [];
    const episodeBlocks = text.split('---').filter(block => block.trim());

    for (const block of episodeBlocks) {
      const lines = block.split('\n').filter(line => line.trim());
      let contentType: 'story' | 'fact' | 'tip' | 'meme' = 'story';
      let title = '';
      let description = '';

      for (const line of lines) {
        if (line.toLowerCase().startsWith('type:')) {
          const type = line.substring(5).trim().toLowerCase();
          if (['story', 'fact', 'tip', 'meme'].includes(type)) {
            contentType = type as 'story' | 'fact' | 'tip' | 'meme';
          }
        } else if (line.toLowerCase().startsWith('title:')) {
          title = line.substring(6).trim();
        } else if (line.toLowerCase().startsWith('description:')) {
          description = line.substring(12).trim();
        }
      }

      if (title && description) {
        episodes_data.push({ title, description, contentType });
      }
    }

    return episodes_data;
  }

  /**
   * Improve existing content
   */
  async improveContent(
    originalContent: string,
    improvementType: 'engagement' | 'clarity' | 'humor' | 'emotion' = 'engagement'
  ): Promise<string> {
    const improvementInstructions = {
      engagement: 'make it more engaging and likely to get likes, shares, and comments',
      clarity: 'make it clearer, easier to understand, and more concise',
      humor: 'add humor and wit while maintaining the core message',
      emotion: 'enhance the emotional appeal and connection with cat lovers'
    };

    const result = await this.generateText({
      system: `You are a content editor specializing in social media optimization. Take the provided content and improve it to ${improvementInstructions[improvementType]}. Maintain the original intent but enhance the impact.`,
      messages: [
        {
          role: 'user',
          content: `Improve this cat-related content for ${improvementType}:\n\n${originalContent}`
        }
      ],
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      temperature: 0.7
    });

    return result.content[0].text;
  }

  /**
   * Check API availability
   */
  async checkAvailability(): Promise<{
    available: boolean;
    details?: any;
  }> {
    try {
      // Make a minimal request to check API availability
      const response = await this.generateText({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'claude-3-haiku-20240307',
        max_tokens: 10
      });

      return {
        available: true,
        details: { model: response.model }
      };
    } catch (error) {
      this.logger.error('Anthropic availability check failed', error as Error);
      return {
        available: false,
        details: error
      };
    }
  }
}