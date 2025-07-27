import { Env } from '../types/env';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
  requestId?: string;
  userId?: string;
  contentId?: string;
}

export class Logger {
  private requestId: string;
  private context: Record<string, any> = {};

  constructor(
    private env: Env,
    private minLevel: LogLevel = LogLevel.INFO,
    requestId?: string
  ) {
    this.requestId = requestId || crypto.randomUUID();
  }

  /**
   * Set persistent context for all log entries
   */
  setContext(context: Record<string, any>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log fatal error message
   */
  fatal(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.FATAL, message, context, error);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error
  ): void {
    if (level < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
      error,
      requestId: this.requestId
    };

    // Console output for development
    this.outputToConsole(entry);

    // Store structured logs for production
    if (this.env.NODE_ENV === 'production') {
      this.storeLog(entry).catch(err => {
        console.error('Failed to store log:', err);
      });
    }
  }

  /**
   * Output log to console with proper formatting
   */
  private outputToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const prefix = `[${entry.timestamp}] [${levelName}] [${entry.requestId.substring(0, 8)}]`;
    
    let output = `${prefix} ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      output += ` | Context: ${JSON.stringify(entry.context)}`;
    }

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(output);
        if (entry.error) {
          console.error('Error details:', entry.error);
        }
        break;
    }
  }

  /**
   * Store log entry in KV for later analysis
   */
  private async storeLog(entry: LogEntry): Promise<void> {
    try {
      const logKey = `logs:${entry.timestamp}:${entry.requestId}`;
      const logData = {
        ...entry,
        error: entry.error ? {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack
        } : undefined
      };

      // Store in KV with 7-day TTL
      await this.env.CACHE_KV.put(logKey, JSON.stringify(logData), {
        expirationTtl: 7 * 24 * 60 * 60 // 7 days
      });

      // Also store in D1 for structured querying (if we need historical analysis)
      if (entry.level >= LogLevel.ERROR) {
        await this.storeErrorInDatabase(entry);
      }
    } catch (error) {
      console.error('Failed to store log:', error);
    }
  }

  /**
   * Store error logs in D1 database for analysis
   */
  private async storeErrorInDatabase(entry: LogEntry): Promise<void> {
    try {
      const stmt = this.env.DB.prepare(`
        INSERT INTO error_logs (
          timestamp, level, message, context, error_details, 
          request_id, user_id, content_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      await stmt.bind(
        entry.timestamp,
        LogLevel[entry.level],
        entry.message,
        JSON.stringify(entry.context || {}),
        entry.error ? JSON.stringify({
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack
        }) : null,
        entry.requestId,
        entry.userId || null,
        entry.contentId || null
      ).run();
    } catch (error) {
      console.error('Failed to store error in database:', error);
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    const childLogger = new Logger(this.env, this.minLevel, this.requestId);
    childLogger.setContext({ ...this.context, ...context });
    return childLogger;
  }

  /**
   * Log API request/response
   */
  logAPICall(
    provider: string,
    endpoint: string,
    method: string,
    duration: number,
    statusCode?: number,
    error?: Error
  ): void {
    const context = {
      provider,
      endpoint,
      method,
      duration,
      statusCode
    };

    if (error || (statusCode && statusCode >= 400)) {
      this.error(`API call failed: ${provider} ${method} ${endpoint}`, error, context);
    } else {
      this.info(`API call successful: ${provider} ${method} ${endpoint}`, context);
    }
  }

  /**
   * Log content generation activity
   */
  logContentGeneration(
    contentId: string,
    type: string,
    provider: string,
    status: string,
    duration?: number,
    error?: Error
  ): void {
    const context = {
      contentId,
      type,
      provider,
      status,
      duration
    };

    if (error || status === 'failed') {
      this.error(`Content generation failed: ${type} via ${provider}`, error, context);
    } else {
      this.info(`Content generation ${status}: ${type} via ${provider}`, context);
    }
  }

  /**
   * Log Facebook posting activity
   */
  logFacebookPost(
    contentId: string,
    postId: string | null,
    status: string,
    error?: Error
  ): void {
    const context = {
      contentId,
      postId,
      status
    };

    if (error || status === 'failed') {
      this.error(`Facebook post failed for content ${contentId}`, error, context);
    } else {
      this.info(`Facebook post ${status} for content ${contentId}`, context);
    }
  }

  /**
   * Get recent logs for debugging
   */
  async getRecentLogs(
    level: LogLevel = LogLevel.INFO,
    limit: number = 100
  ): Promise<LogEntry[]> {
    try {
      const keys = await this.env.CACHE_KV.list({ prefix: 'logs:' });
      const logs: LogEntry[] = [];

      for (const key of keys.keys.slice(0, limit)) {
        const logData = await this.env.CACHE_KV.get(key.name, 'json');
        if (logData && logData.level >= level) {
          logs.push(logData as LogEntry);
        }
      }

      return logs.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error('Failed to retrieve logs:', error);
      return [];
    }
  }
}

/**
 * Create logger instance for request
 */
export function createLogger(env: Env, requestId?: string): Logger {
  const logLevel = env.LOG_LEVEL ? 
    LogLevel[env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] || LogLevel.INFO :
    LogLevel.INFO;

  return new Logger(env, logLevel, requestId);
}

/**
 * Performance timing decorator
 */
export function withTiming<T extends any[], R>(
  logger: Logger,
  operation: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const start = Date.now();
    try {
      logger.debug(`Starting ${operation}`);
      const result = await fn(...args);
      const duration = Date.now() - start;
      logger.info(`Completed ${operation}`, { duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`Failed ${operation}`, error as Error, { duration });
      throw error;
    }
  };
}