/**
 * Integration tests for error handling system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorFactory,
  ErrorPatterns,
  ErrorContextManager,
  runWithErrorContext,
  safeAsync,
  RetryClassification,
  ErrorSeverity,
  type ErrorContext,
} from '../index.js';
import { RetryUtils, DEFAULT_RETRY_CONFIGS } from '../../retry/index.js';
import type { Logger } from '../../logging/index.js';
import type { NotificationManager } from '../../notifications/index.js';

describe('Error Handling Integration', () => {
  let mockLogger: Logger;
  let mockNotificationManager: NotificationManager;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    mockNotificationManager = {
      notify: vi.fn(),
    } as unknown as NotificationManager;

    ErrorContextManager.clearContext();
  });

  describe('End-to-end error handling workflow', () => {
    it('should handle complete error lifecycle with context and retry', async () => {
      let attemptCount = 0;
      const maxAttempts = 3;

      const result = await runWithErrorContext(
        async () => {
          return RetryUtils.executeWithRetry(
            async () => {
              attemptCount++;
              
              if (attemptCount < maxAttempts) {
                // Simulate transient network error
                throw ErrorFactory.network('Connection timeout', {
                  severity: ErrorSeverity.HIGH,
                  retryClassification: RetryClassification.RETRYABLE,
                  data: { attempt: attemptCount },
                });
              }
              
              return 'success';
            },
            {
              ...DEFAULT_RETRY_CONFIGS.NETWORK_OPERATIONS,
              maxAttempts,
              onRetry: async (error, attempt, delayMs) => {
                await ErrorPatterns.logAndNotifyError(
                  error,
                  mockLogger,
                  mockNotificationManager,
                  { operation: 'retry_operation', component: 'integration_test' }
                );
              },
            }
          );
        },
        {
          operation: 'integration_test',
          service: 'test_service',
          component: 'error_handling',
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('success');
      }
      expect(attemptCount).toBe(maxAttempts);
      
      // Verify logging was called for retry attempts
      expect(mockLogger.error).toHaveBeenCalledTimes(maxAttempts - 1);
      expect(mockNotificationManager.notify).toHaveBeenCalledTimes(maxAttempts - 1);
    });

    it('should handle non-retryable errors correctly', async () => {
      const result = await runWithErrorContext(
        async () => {
          return safeAsync(async () => {
            throw ErrorFactory.validation('Invalid input format', {
              severity: ErrorSeverity.MEDIUM,
              retryClassification: RetryClassification.NON_RETRYABLE,
              data: { field: 'email', value: 'invalid-email' },
            });
          });
        },
        {
          operation: 'validation_test',
          service: 'test_service',
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.metadata.context.operation).toBe('validation_test');
        expect(result.error.metadata.data).toEqual({
          field: 'email',
          value: 'invalid-email',
        });
      }
    });

    it('should preserve error context through nested operations', async () => {
      let capturedContext: ErrorContext | null = null;

      const result = await runWithErrorContext(
        async () => {
          return runWithErrorContext(
            async () => {
              return safeAsync(async () => {
                capturedContext = ErrorContextManager.getCurrentContext();
                throw ErrorFactory.filesystem('File not found', {
                  data: { path: '/nonexistent/file.txt' },
                });
              });
            },
            {
              operation: 'file_operation',
              component: 'file_handler',
            }
          );
        },
        {
          operation: 'parent_operation',
          service: 'file_service',
          component: 'service_handler',
        }
      );

      expect(result.success).toBe(false);
      expect(capturedContext).toBeDefined();
      expect(capturedContext?.operation).toBe('file_operation');
      expect(capturedContext?.service).toBe('file_service');
      expect(capturedContext?.component).toBe('file_handler');
      expect(capturedContext?.operationStack).toContain('parent_operation');

      if (!result.success) {
        expect(result.error.metadata.context.correlationId).toBe(capturedContext?.correlationId);
      }
    });

    it('should handle mixed error types in complex scenarios', async () => {
      const errors: unknown[] = [];

      // Simulate a complex operation with multiple potential failure points
      const result = await runWithErrorContext(
        async () => {
          // Step 1: Configuration validation
          const configResult = await safeAsync(async () => {
            throw ErrorFactory.configuration('Missing required config', {
              data: { missingKeys: ['api_key', 'endpoint'] },
            });
          });

          if (!configResult.success) {
            errors.push(configResult.error);
            await ErrorPatterns.logAndNotifyError(
              configResult.error,
              mockLogger,
              mockNotificationManager,
              { operation: 'config_validation', component: 'config_loader' }
            );
          }

          // Step 2: Network operation with retry
          const networkResult = await RetryUtils.executeWithRetry(
            async () => {
              throw ErrorFactory.network('Service unavailable', {
                retryClassification: RetryClassification.RETRYABLE,
              });
            },
            {
              maxAttempts: 2,
              onRetry: async (error) => {
                errors.push(error);
              },
            }
          );

          if (!networkResult.success) {
            errors.push(networkResult.error);
          }

          // Step 3: Business logic validation
          const businessResult = await safeAsync(async () => {
            throw ErrorFactory.businessLogic('Invalid business rule', {
              data: { rule: 'max_concurrent_operations', current: 5, max: 3 },
            });
          });

          if (!businessResult.success) {
            errors.push(businessResult.error);
          }

          return 'operation_completed';
        },
        {
          operation: 'complex_operation',
          service: 'integration_service',
        }
      );

      expect(errors).toHaveLength(4); // 1 config + 1 network retry + 1 network final + 1 business
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockNotificationManager.notify).toHaveBeenCalled();

      // Verify different error types were captured
      const errorTypes = errors.map(e => (e as any).constructor.name);
      expect(errorTypes).toContain('ConfigurationError');
      expect(errorTypes).toContain('NetworkError');
      expect(errorTypes).toContain('BusinessLogicError');
    });

    it('should aggregate errors correctly during operation', async () => {
      const aggregator = new (await import('../error-patterns.js')).ErrorAggregator();

      // Simulate multiple operations with various errors
      const operations = [
        () => ErrorFactory.network('Connection timeout'),
        () => ErrorFactory.network('Connection timeout'), // Same error
        () => ErrorFactory.filesystem('Permission denied'),
        () => ErrorFactory.network('DNS resolution failed'), // Different network error
        () => ErrorFactory.validation('Invalid format'),
      ];

      for (const [index, createError] of operations.entries()) {
        const error = createError();
        aggregator.addError(error, `operation_${index}`);
      }

      const stats = aggregator.getErrorStats();
      expect(stats).toHaveLength(4); // 3 different network errors + 1 filesystem + 1 validation

      const mostFrequent = aggregator.getMostFrequentErrors(2);
      expect(mostFrequent).toHaveLength(2);
      
      // Network errors should be most frequent
      const networkErrorStats = mostFrequent.find(s => s.key.includes('NETWORK_ERROR'));
      expect(networkErrorStats?.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error recovery scenarios', () => {
    it('should provide appropriate recovery suggestions', async () => {
      const scenarios = [
        {
          error: ErrorFactory.network('Connection refused'),
          expectedSuggestions: ['Check network connectivity', 'Verify service endpoints'],
        },
        {
          error: ErrorFactory.filesystem('Permission denied'),
          expectedSuggestions: ['Check file permissions', 'Verify user access rights'],
        },
        {
          error: ErrorFactory.configuration('Invalid configuration'),
          expectedSuggestions: ['Review configuration file', 'Check configuration syntax'],
        },
      ];

      for (const scenario of scenarios) {
        const suggestions = ErrorPatterns.getRecoverySuggestions(scenario.error);
        
        for (const expectedSuggestion of scenario.expectedSuggestions) {
          expect(suggestions.some(s => s.includes(expectedSuggestion.split(' ')[0]))).toBe(true);
        }
      }
    });

    it('should handle error correlation across operations', async () => {
      const correlationId = 'test-correlation-123';
      let capturedCorrelationIds: string[] = [];

      await runWithErrorContext(
        async () => {
          // First operation
          await runWithErrorContext(
            async () => {
              const context = ErrorContextManager.getCurrentContext();
              if (context) capturedCorrelationIds.push(context.correlationId);
              
              throw ErrorFactory.network('First error');
            },
            { operation: 'first_op' }
          ).catch(() => {}); // Ignore error

          // Second operation (should inherit correlation ID)
          await runWithErrorContext(
            async () => {
              const context = ErrorContextManager.getCurrentContext();
              if (context) capturedCorrelationIds.push(context.correlationId);
              
              throw ErrorFactory.filesystem('Second error');
            },
            { operation: 'second_op' }
          ).catch(() => {}); // Ignore error
        },
        {
          operation: 'parent_op',
          correlationId,
        }
      ).catch(() => {}); // Ignore error

      expect(capturedCorrelationIds).toHaveLength(2);
      expect(capturedCorrelationIds[0]).toBe(correlationId);
      expect(capturedCorrelationIds[1]).toBe(correlationId);
    });
  });
});
