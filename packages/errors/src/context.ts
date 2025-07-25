/**
 * Error context utilities for correlation tracking and operation context
 */

import { randomUUID } from 'crypto';

import type { ErrorContext } from './types.js';

/**
 * Context manager for tracking operations and generating correlation IDs
 */
export class ErrorContextManager {
  private static instance: ErrorContextManager;
  private contextStack: ErrorContext[] = [];
  private currentContext: ErrorContext | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ErrorContextManager {
    if (!ErrorContextManager.instance) {
      ErrorContextManager.instance = new ErrorContextManager();
    }
    return ErrorContextManager.instance;
  }

  /**
   * Generate a new correlation ID
   */
  static generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Create a new error context
   */
  static createContext(options: {
    operation?: string;
    service?: string;
    component?: string;
    metadata?: Record<string, unknown>;
    correlationId?: string;
  }): ErrorContext {
    const context: ErrorContext = {
      correlationId: options.correlationId || ErrorContextManager.generateCorrelationId(),
      timestamp: new Date(),
      operationStack: [],
    };

    if (options.operation !== undefined) {
      context.operation = options.operation;
    }
    if (options.service !== undefined) {
      context.service = options.service;
    }
    if (options.component !== undefined) {
      context.component = options.component;
    }
    if (options.metadata !== undefined) {
      context.metadata = options.metadata;
    }

    return context;
  }

  /**
   * Set the current operation context
   */
  setContext(context: ErrorContext): void {
    this.currentContext = context;
  }

  /**
   * Get the current operation context
   */
  getCurrentContext(): ErrorContext | null {
    return this.currentContext;
  }

  /**
   * Push a new context onto the stack (for nested operations)
   */
  pushContext(context: ErrorContext): void {
    if (this.currentContext) {
      this.contextStack.push(this.currentContext);
    }
    this.setContext(context);
  }

  /**
   * Pop the previous context from the stack
   */
  popContext(): ErrorContext | null {
    const previousContext = this.contextStack.pop();
    if (previousContext) {
      this.setContext(previousContext);
      return previousContext;
    }
    this.currentContext = null;
    return null;
  }

  /**
   * Clear all context
   */
  clearContext(): void {
    this.currentContext = null;
    this.contextStack = [];
  }

  /**
   * Add an operation to the current context stack
   */
  addOperation(operation: string): void {
    if (this.currentContext) {
      this.currentContext.operationStack = this.currentContext.operationStack || [];
      this.currentContext.operationStack.push(operation);
    }
  }

  /**
   * Create a child context that inherits correlation ID but has its own operation
   */
  createChildContext(options: {
    operation?: string;
    component?: string;
    metadata?: Record<string, unknown>;
  }): ErrorContext {
    const parentContext = this.getCurrentContext();

    const contextOptions: {
      correlationId: string;
      service?: string;
      operation?: string;
      component?: string;
      metadata?: Record<string, unknown>;
    } = {
      correlationId: parentContext?.correlationId || ErrorContextManager.generateCorrelationId(),
    };

    if (parentContext?.service !== undefined) {
      contextOptions.service = parentContext.service;
    }
    if (options.operation !== undefined) {
      contextOptions.operation = options.operation;
    }
    if (options.component !== undefined) {
      contextOptions.component = options.component;
    }

    const combinedMetadata = {
      ...parentContext?.metadata,
      ...options.metadata,
    };
    if (Object.keys(combinedMetadata).length > 0) {
      contextOptions.metadata = combinedMetadata;
    }

    return ErrorContextManager.createContext(contextOptions);
  }
}

/**
 * Decorator for automatically managing error context in async operations
 */
export function withErrorContext<T extends unknown[], R>(contextOptions: {
  operation?: string;
  service?: string;
  component?: string;
  metadata?: Record<string, unknown>;
}) {
  return function (
    _target: unknown,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return descriptor;

    descriptor.value = async function (...args: T): Promise<R> {
      const contextManager = ErrorContextManager.getInstance();

      const childContextOptions: {
        operation?: string;
        component?: string;
        metadata?: Record<string, unknown>;
      } = {};

      if (contextOptions.operation !== undefined || propertyKey !== undefined) {
        childContextOptions.operation = contextOptions.operation || String(propertyKey);
      }
      if (contextOptions.component !== undefined) {
        childContextOptions.component = contextOptions.component;
      }
      if (contextOptions.metadata !== undefined) {
        childContextOptions.metadata = contextOptions.metadata;
      }

      const context = contextManager.createChildContext(childContextOptions);

      contextManager.pushContext(context);

      try {
        return await originalMethod.apply(this, args);
      } finally {
        contextManager.popContext();
      }
    };

    return descriptor;
  };
}

/**
 * Utility function to run an operation with error context
 */
export async function runWithErrorContext<T>(
  operation: () => Promise<T>,
  contextOptions: {
    operation?: string;
    service?: string;
    component?: string;
    metadata?: Record<string, unknown>;
    correlationId?: string;
  }
): Promise<T> {
  const contextManager = ErrorContextManager.getInstance();
  const context = ErrorContextManager.createContext(contextOptions);

  contextManager.pushContext(context);

  try {
    return await operation();
  } finally {
    contextManager.popContext();
  }
}

/**
 * Utility function to get current error context or create a default one
 */
export function getCurrentErrorContext(fallbackOptions?: {
  operation?: string;
  service?: string;
  component?: string;
}): ErrorContext {
  const contextManager = ErrorContextManager.getInstance();
  const currentContext = contextManager.getCurrentContext();

  if (currentContext) {
    return currentContext;
  }

  // Create a default context if none exists
  const defaultContextOptions: {
    operation: string;
    service?: string;
    component?: string;
  } = {
    operation: fallbackOptions?.operation || 'unknown',
  };

  if (fallbackOptions?.service !== undefined) {
    defaultContextOptions.service = fallbackOptions.service;
  }
  if (fallbackOptions?.component !== undefined) {
    defaultContextOptions.component = fallbackOptions.component;
  }

  return ErrorContextManager.createContext(defaultContextOptions);
}

/**
 * Utility function to enhance an existing error with current context
 */
export function enhanceErrorWithContext(
  error: Error,
  additionalContext?: Partial<ErrorContext>
): Error {
  const currentContext = getCurrentErrorContext();

  // If it's already a DangerPrepError, we don't need to enhance it
  if (
    'metadata' in error &&
    (error as { metadata?: { context?: unknown } }).metadata &&
    'context' in (error as { metadata: { context?: unknown } }).metadata
  ) {
    return error;
  }

  // Add context information to the error
  const enhancedError = error as Error & { context?: ErrorContext };
  enhancedError.context = {
    ...currentContext,
    ...additionalContext,
  };

  return enhancedError;
}
