import type { Context, Next } from 'hono';
import { LoggerFactory, LogLevel } from '../../../../../../packages/logging/dist/index';

// Define typed context variables for the logger
export type LoggerVariables = {
  logger: ReturnType<typeof LoggerFactory.createStructuredLogger>;
  requestId: string;
};

/**
 * Creates a structured logging middleware for Hono
 * 
 * This middleware:
 * - Creates a child logger with request ID for each request
 * - Logs request start with method, path, and user agent
 * - Logs response end with status code and duration
 * - Attaches the logger to the context for use in routes and services
 * 
 * Best practices from Hono documentation:
 * - Use requestId middleware before this middleware
 * - Access logger via c.get('logger') in routes
 * - Logger is automatically scoped to the request
 */
export function structuredLogging() {
  // Create base logger based on environment
  const isDevelopment = process.env.NODE_ENV === 'development';
  const logLevel = isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
  
  // Create base logger with appropriate configuration
  const baseLogger = LoggerFactory.createStructuredLogger(
    'portal',
    '/var/log/dangerprep/portal.log',
    logLevel
  );

  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    
    // Get request ID from context (set by requestId middleware)
    const requestId = c.get('requestId') || 'unknown';
    
    // Create a child logger with request-specific context
    const logger = baseLogger.child(`request:${requestId}`);
    
    // Attach logger to context for use in routes and services
    c.set('logger', logger);
    
    // Log request start with structured metadata
    logger.info('Request started', {
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('User-Agent') || 'unknown',
      requestId,
    });
    
    // Continue to next middleware/handler
    await next();
    
    // Calculate response time
    const duration = Date.now() - startTime;
    
    // Log response end with structured metadata
    logger.info('Request completed', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration: `${duration}ms`,
      requestId,
    });
  };
}

