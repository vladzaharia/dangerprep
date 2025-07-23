/**
 * Tests for error context management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ErrorContextManager,
  withErrorContext,
  runWithErrorContext,
  getCurrentErrorContext,
  enhanceErrorWithContext,
  type ErrorContext,
} from '../index.js';

describe('Error Context Management', () => {
  beforeEach(() => {
    ErrorContextManager.clearContext();
  });

  afterEach(() => {
    ErrorContextManager.clearContext();
  });

  describe('ErrorContextManager', () => {
    it('should create context with required fields', () => {
      const context = ErrorContextManager.createContext({
        operation: 'test_operation',
        service: 'test_service',
        component: 'test_component',
      });

      expect(context.operation).toBe('test_operation');
      expect(context.service).toBe('test_service');
      expect(context.component).toBe('test_component');
      expect(context.correlationId).toBeDefined();
      expect(context.timestamp).toBeInstanceOf(Date);
      expect(context.operationStack).toEqual([]);
      expect(context.metadata).toEqual({});
    });

    it('should generate unique correlation IDs', () => {
      const context1 = ErrorContextManager.createContext({ operation: 'op1' });
      const context2 = ErrorContextManager.createContext({ operation: 'op2' });

      expect(context1.correlationId).not.toBe(context2.correlationId);
      expect(context1.correlationId).toMatch(/^[a-f0-9-]+$/);
      expect(context2.correlationId).toMatch(/^[a-f0-9-]+$/);
    });

    it('should create child context with inherited correlation ID', () => {
      const parentContext = ErrorContextManager.createContext({
        operation: 'parent_operation',
        service: 'parent_service',
      });

      ErrorContextManager.setContext(parentContext);

      const childContext = ErrorContextManager.createChildContext({
        operation: 'child_operation',
        component: 'child_component',
      });

      expect(childContext.correlationId).toBe(parentContext.correlationId);
      expect(childContext.operation).toBe('child_operation');
      expect(childContext.service).toBe('parent_service');
      expect(childContext.component).toBe('child_component');
      expect(childContext.operationStack).toEqual(['parent_operation']);
    });

    it('should manage context stack correctly', () => {
      const context1 = ErrorContextManager.createContext({ operation: 'op1' });
      const context2 = ErrorContextManager.createContext({ operation: 'op2' });

      expect(ErrorContextManager.getCurrentContext()).toBeNull();

      ErrorContextManager.setContext(context1);
      expect(ErrorContextManager.getCurrentContext()).toBe(context1);

      ErrorContextManager.pushContext(context2);
      expect(ErrorContextManager.getCurrentContext()).toBe(context2);

      const poppedContext = ErrorContextManager.popContext();
      expect(poppedContext).toBe(context2);
      expect(ErrorContextManager.getCurrentContext()).toBe(context1);

      ErrorContextManager.clearContext();
      expect(ErrorContextManager.getCurrentContext()).toBeNull();
    });
  });

  describe('withErrorContext decorator', () => {
    class TestService {
      @withErrorContext({ operation: 'testMethod', component: 'test-service' })
      async testMethod(value: string): Promise<string> {
        const context = getCurrentErrorContext();
        expect(context).toBeDefined();
        expect(context?.operation).toBe('testMethod');
        expect(context?.component).toBe('test-service');
        return `processed: ${value}`;
      }

      @withErrorContext({ operation: 'errorMethod' })
      async errorMethod(): Promise<void> {
        throw new Error('Test error');
      }

      @withErrorContext()
      async autoNamedMethod(): Promise<string> {
        const context = getCurrentErrorContext();
        expect(context?.operation).toBe('autoNamedMethod');
        return 'success';
      }
    }

    it('should set context for method execution', async () => {
      const service = new TestService();
      const result = await service.testMethod('test');
      expect(result).toBe('processed: test');
    });

    it('should auto-name operation from method name', async () => {
      const service = new TestService();
      const result = await service.autoNamedMethod();
      expect(result).toBe('success');
    });

    it('should preserve error context in thrown errors', async () => {
      const service = new TestService();
      
      try {
        await service.errorMethod();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Test error');
      }
    });

    it('should clean up context after method execution', async () => {
      const service = new TestService();
      
      expect(getCurrentErrorContext()).toBeNull();
      await service.testMethod('test');
      expect(getCurrentErrorContext()).toBeNull();
    });
  });

  describe('runWithErrorContext', () => {
    it('should execute function with context', async () => {
      let capturedContext: ErrorContext | null = null;

      const result = await runWithErrorContext(
        async () => {
          capturedContext = getCurrentErrorContext();
          return 'success';
        },
        {
          operation: 'test_operation',
          service: 'test_service',
          component: 'test_component',
        }
      );

      expect(result).toBe('success');
      expect(capturedContext).toBeDefined();
      expect(capturedContext?.operation).toBe('test_operation');
      expect(capturedContext?.service).toBe('test_service');
      expect(capturedContext?.component).toBe('test_component');
      expect(getCurrentErrorContext()).toBeNull();
    });

    it('should handle errors and preserve context', async () => {
      const testError = new Error('Test error');

      try {
        await runWithErrorContext(
          async () => {
            const context = getCurrentErrorContext();
            expect(context?.operation).toBe('error_operation');
            throw testError;
          },
          { operation: 'error_operation' }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBe(testError);
        expect(getCurrentErrorContext()).toBeNull();
      }
    });

    it('should nest contexts correctly', async () => {
      const result = await runWithErrorContext(
        async () => {
          const outerContext = getCurrentErrorContext();
          expect(outerContext?.operation).toBe('outer');

          return runWithErrorContext(
            async () => {
              const innerContext = getCurrentErrorContext();
              expect(innerContext?.operation).toBe('inner');
              expect(innerContext?.correlationId).toBe(outerContext?.correlationId);
              expect(innerContext?.operationStack).toContain('outer');
              return 'nested_success';
            },
            { operation: 'inner', component: 'inner_component' }
          );
        },
        { operation: 'outer', service: 'test_service' }
      );

      expect(result).toBe('nested_success');
      expect(getCurrentErrorContext()).toBeNull();
    });
  });

  describe('getCurrentErrorContext', () => {
    it('should return null when no context is set', () => {
      expect(getCurrentErrorContext()).toBeNull();
    });

    it('should return current context when set', () => {
      const context = ErrorContextManager.createContext({ operation: 'test' });
      ErrorContextManager.setContext(context);

      expect(getCurrentErrorContext()).toBe(context);
    });

    it('should provide fallback context when requested', () => {
      const fallbackContext = getCurrentErrorContext({
        operation: 'fallback_operation',
        service: 'fallback_service',
      });

      expect(fallbackContext).toBeDefined();
      expect(fallbackContext.operation).toBe('fallback_operation');
      expect(fallbackContext.service).toBe('fallback_service');
    });
  });

  describe('enhanceErrorWithContext', () => {
    it('should enhance Error with context information', () => {
      const context = ErrorContextManager.createContext({
        operation: 'test_operation',
        service: 'test_service',
      });

      const originalError = new Error('Original error');
      const enhancedError = enhanceErrorWithContext(originalError, context);

      expect(enhancedError.message).toContain('Original error');
      expect(enhancedError.message).toContain('test_operation');
      expect(enhancedError.message).toContain('test_service');
      expect(enhancedError.message).toContain(context.correlationId);
    });

    it('should preserve original error properties', () => {
      const context = ErrorContextManager.createContext({ operation: 'test' });
      const originalError = new Error('Original error');
      originalError.stack = 'original stack trace';

      const enhancedError = enhanceErrorWithContext(originalError, context);

      expect(enhancedError.name).toBe('Error');
      expect(enhancedError.stack).toBe('original stack trace');
    });

    it('should handle non-Error objects', () => {
      const context = ErrorContextManager.createContext({ operation: 'test' });
      const enhancedError = enhanceErrorWithContext('string error', context);

      expect(enhancedError).toBeInstanceOf(Error);
      expect(enhancedError.message).toContain('string error');
      expect(enhancedError.message).toContain('test');
    });
  });
});
