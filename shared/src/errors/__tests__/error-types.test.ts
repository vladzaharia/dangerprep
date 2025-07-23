/**
 * Tests for error types and base error classes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DangerPrepError,
  ErrorSeverity,
  ErrorCategory,
  RetryClassification,
  NetworkError,
  FileSystemError,
  ConfigurationError,
  ValidationError,
  ExternalServiceError,
  AuthenticationError,
  BusinessLogicError,
  SystemError,
  ErrorContextManager,
  type ErrorContext,
} from '../index.js';

describe('Error Types', () => {
  let testContext: ErrorContext;

  beforeEach(() => {
    testContext = ErrorContextManager.createContext({
      operation: 'test_operation',
      service: 'test_service',
      component: 'test_component',
    });
  });

  describe('DangerPrepError Base Class', () => {
    class TestError extends DangerPrepError {
      constructor(message: string, context: ErrorContext) {
        super(message, 'TEST_ERROR', {
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.UNKNOWN,
          context,
        });
      }
    }

    it('should create error with proper metadata', () => {
      const error = new TestError('Test error message', testContext);

      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('TestError');
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.metadata.category).toBe(ErrorCategory.UNKNOWN);
      expect(error.metadata.context).toBe(testContext);
    });

    it('should have proper prototype chain for instanceof checks', () => {
      const error = new TestError('Test error', testContext);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof DangerPrepError).toBe(true);
      expect(error instanceof TestError).toBe(true);
    });

    it('should format error for logging', () => {
      const error = new TestError('Test error', testContext);
      const logFormat = error.toLogFormat();

      expect(logFormat).toMatchObject({
        name: 'TestError',
        message: 'Test error',
        code: 'TEST_ERROR',
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.UNKNOWN,
        correlationId: testContext.correlationId,
        operation: 'test_operation',
        service: 'test_service',
        component: 'test_component',
      });
    });

    it('should check retry classification correctly', () => {
      const retryableError = new TestError('Retryable error', testContext);
      retryableError.metadata.retryClassification = RetryClassification.RETRYABLE;

      const nonRetryableError = new TestError('Non-retryable error', testContext);
      nonRetryableError.metadata.retryClassification = RetryClassification.NON_RETRYABLE;

      const conditionalError = new TestError('Conditional error', testContext);
      conditionalError.metadata.retryClassification = RetryClassification.CONDITIONALLY_RETRYABLE;

      expect(retryableError.isRetryable()).toBe(true);
      expect(retryableError.isConditionallyRetryable()).toBe(false);

      expect(nonRetryableError.isRetryable()).toBe(false);
      expect(nonRetryableError.isConditionallyRetryable()).toBe(false);

      expect(conditionalError.isRetryable()).toBe(false);
      expect(conditionalError.isConditionallyRetryable()).toBe(true);
    });
  });

  describe('NetworkError', () => {
    it('should create network error with default settings', () => {
      const error = new NetworkError('Connection timeout', testContext);

      expect(error.metadata.category).toBe(ErrorCategory.NETWORK);
      expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
      expect(error.metadata.retryClassification).toBe(RetryClassification.RETRYABLE);
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('should allow custom options', () => {
      const error = new NetworkError('Custom network error', testContext, {
        code: 'CUSTOM_NETWORK_ERROR',
        severity: ErrorSeverity.CRITICAL,
        retryClassification: RetryClassification.NON_RETRYABLE,
        data: { endpoint: 'https://api.example.com' },
      });

      expect(error.code).toBe('CUSTOM_NETWORK_ERROR');
      expect(error.metadata.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.metadata.retryClassification).toBe(RetryClassification.NON_RETRYABLE);
      expect(error.metadata.data).toEqual({ endpoint: 'https://api.example.com' });
    });
  });

  describe('FileSystemError', () => {
    it('should create filesystem error with default settings', () => {
      const error = new FileSystemError('Permission denied', testContext);

      expect(error.metadata.category).toBe(ErrorCategory.FILESYSTEM);
      expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
      expect(error.metadata.retryClassification).toBe(RetryClassification.CONDITIONALLY_RETRYABLE);
      expect(error.code).toBe('FILESYSTEM_ERROR');
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error with default settings', () => {
      const error = new ConfigurationError('Invalid config', testContext);

      expect(error.metadata.category).toBe(ErrorCategory.CONFIGURATION);
      expect(error.metadata.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.metadata.retryClassification).toBe(RetryClassification.NON_RETRYABLE);
      expect(error.code).toBe('CONFIGURATION_ERROR');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with default settings', () => {
      const error = new ValidationError('Invalid input', testContext);

      expect(error.metadata.category).toBe(ErrorCategory.VALIDATION);
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.metadata.retryClassification).toBe(RetryClassification.NON_RETRYABLE);
      expect(error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('ExternalServiceError', () => {
    it('should create external service error with default settings', () => {
      const error = new ExternalServiceError('Service unavailable', testContext);

      expect(error.metadata.category).toBe(ErrorCategory.EXTERNAL_SERVICE);
      expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
      expect(error.metadata.retryClassification).toBe(RetryClassification.CONDITIONALLY_RETRYABLE);
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
    });

    it('should include service name and status code in data', () => {
      const error = new ExternalServiceError('API error', testContext, {
        serviceName: 'payment-api',
        statusCode: 503,
        data: { requestId: 'req-123' },
      });

      expect(error.metadata.data).toEqual({
        requestId: 'req-123',
        serviceName: 'payment-api',
        statusCode: 503,
      });
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with default settings', () => {
      const error = new AuthenticationError('Invalid token', testContext);

      expect(error.metadata.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
      expect(error.metadata.retryClassification).toBe(RetryClassification.NON_RETRYABLE);
      expect(error.metadata.shouldNotify).toBe(true);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('BusinessLogicError', () => {
    it('should create business logic error with default settings', () => {
      const error = new BusinessLogicError('Invalid operation', testContext);

      expect(error.metadata.category).toBe(ErrorCategory.BUSINESS_LOGIC);
      expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.metadata.retryClassification).toBe(RetryClassification.NON_RETRYABLE);
      expect(error.code).toBe('BUSINESS_LOGIC_ERROR');
    });
  });

  describe('SystemError', () => {
    it('should create system error with default settings', () => {
      const error = new SystemError('Out of memory', testContext);

      expect(error.metadata.category).toBe(ErrorCategory.SYSTEM);
      expect(error.metadata.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.metadata.retryClassification).toBe(RetryClassification.CONDITIONALLY_RETRYABLE);
      expect(error.code).toBe('SYSTEM_ERROR');
    });
  });

  describe('Error with cause chain', () => {
    it('should preserve error cause chain', () => {
      const originalError = new Error('Original error');
      const wrappedError = new NetworkError('Network error', testContext, {
        cause: originalError,
      });

      expect(wrappedError.metadata.cause).toBe(originalError);
      
      const logFormat = wrappedError.toLogFormat();
      expect(logFormat.cause).toBe('Original error');
    });
  });

  describe('Recovery actions', () => {
    it('should include recovery actions in metadata', () => {
      const error = new NetworkError('Connection failed', testContext);

      expect(error.metadata.recoveryActions).toContain('Check network connectivity');
      expect(error.metadata.recoveryActions).toContain('Verify service endpoints');
      expect(error.metadata.recoveryActions).toContain('Check firewall settings');
      expect(error.metadata.recoveryActions).toContain('Retry after delay');
    });
  });
});
