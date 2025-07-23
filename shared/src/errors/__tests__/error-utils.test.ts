/**
 * Tests for error utilities and helper functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type Result,
  success,
  failure,
  safeAsync,
  safe,
  ErrorFactory,
  wrapError,
  isRetryableError,
  extractErrorInfo,
  ErrorSeverity,
  ErrorCategory,
  RetryClassification,
  NetworkError,
  ErrorContextManager,
  type ErrorContext,
} from '../index.js';

describe('Error Utils', () => {
  let testContext: ErrorContext;

  beforeEach(() => {
    testContext = ErrorContextManager.createContext({
      operation: 'test_operation',
      service: 'test_service',
    });
  });

  describe('Result type and helpers', () => {
    describe('success', () => {
      it('should create successful result', () => {
        const result = success('test data');

        expect(result.success).toBe(true);
        expect(result.data).toBe('test data');
        expect('error' in result).toBe(false);
      });
    });

    describe('failure', () => {
      it('should create failure result', () => {
        const error = new Error('test error');
        const result = failure(error);

        expect(result.success).toBe(false);
        expect(result.error).toBe(error);
        expect('data' in result).toBe(false);
      });
    });
  });

  describe('safeAsync', () => {
    it('should return success result for successful async operation', async () => {
      const result = await safeAsync(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async success';
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('async success');
      }
    });

    it('should return failure result for async operation that throws', async () => {
      const testError = new Error('async error');
      const result = await safeAsync(async () => {
        throw testError;
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(testError);
      }
    });

    it('should handle Promise rejection', async () => {
      const result = await safeAsync(() => Promise.reject(new Error('rejected')));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('rejected');
      }
    });
  });

  describe('safe', () => {
    it('should return success result for successful sync operation', () => {
      const result = safe(() => {
        return 'sync success';
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('sync success');
      }
    });

    it('should return failure result for sync operation that throws', () => {
      const testError = new Error('sync error');
      const result = safe(() => {
        throw testError;
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(testError);
      }
    });
  });

  describe('ErrorFactory', () => {
    beforeEach(() => {
      ErrorContextManager.setContext(testContext);
    });

    describe('network', () => {
      it('should create network error with defaults', () => {
        const error = ErrorFactory.network('Connection failed');

        expect(error).toBeInstanceOf(NetworkError);
        expect(error.message).toBe('Connection failed');
        expect(error.metadata.category).toBe(ErrorCategory.NETWORK);
        expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
        expect(error.metadata.context.operation).toBe('test_operation');
      });

      it('should accept custom options', () => {
        const error = ErrorFactory.network('Custom error', {
          code: 'CUSTOM_NETWORK',
          severity: ErrorSeverity.CRITICAL,
          data: { endpoint: 'api.example.com' },
        });

        expect(error.code).toBe('CUSTOM_NETWORK');
        expect(error.metadata.severity).toBe(ErrorSeverity.CRITICAL);
        expect(error.metadata.data).toEqual({ endpoint: 'api.example.com' });
      });
    });

    describe('filesystem', () => {
      it('should create filesystem error', () => {
        const error = ErrorFactory.filesystem('File not found');

        expect(error.metadata.category).toBe(ErrorCategory.FILESYSTEM);
        expect(error.code).toBe('FILESYSTEM_ERROR');
      });
    });

    describe('configuration', () => {
      it('should create configuration error', () => {
        const error = ErrorFactory.configuration('Invalid config');

        expect(error.metadata.category).toBe(ErrorCategory.CONFIGURATION);
        expect(error.metadata.severity).toBe(ErrorSeverity.CRITICAL);
      });
    });

    describe('validation', () => {
      it('should create validation error', () => {
        const error = ErrorFactory.validation('Invalid input');

        expect(error.metadata.category).toBe(ErrorCategory.VALIDATION);
        expect(error.metadata.retryClassification).toBe(RetryClassification.NON_RETRYABLE);
      });
    });

    describe('externalService', () => {
      it('should create external service error', () => {
        const error = ErrorFactory.externalService('Service unavailable', {
          serviceName: 'payment-api',
          statusCode: 503,
        });

        expect(error.metadata.category).toBe(ErrorCategory.EXTERNAL_SERVICE);
        expect(error.metadata.data).toMatchObject({
          serviceName: 'payment-api',
          statusCode: 503,
        });
      });
    });

    describe('authentication', () => {
      it('should create authentication error', () => {
        const error = ErrorFactory.authentication('Invalid token');

        expect(error.metadata.category).toBe(ErrorCategory.AUTHENTICATION);
        expect(error.metadata.shouldNotify).toBe(true);
      });
    });

    describe('businessLogic', () => {
      it('should create business logic error', () => {
        const error = ErrorFactory.businessLogic('Invalid operation');

        expect(error.metadata.category).toBe(ErrorCategory.BUSINESS_LOGIC);
      });
    });

    describe('system', () => {
      it('should create system error', () => {
        const error = ErrorFactory.system('Out of memory');

        expect(error.metadata.category).toBe(ErrorCategory.SYSTEM);
        expect(error.metadata.severity).toBe(ErrorSeverity.CRITICAL);
      });
    });
  });

  describe('wrapError', () => {
    it('should wrap Error instance', () => {
      const originalError = new Error('Original error');
      const wrappedError = wrapError(originalError, 'Wrapped error');

      expect(wrappedError.message).toBe('Wrapped error');
      expect(wrappedError.metadata.cause).toBe(originalError);
      expect(wrappedError.metadata.category).toBe(ErrorCategory.UNKNOWN);
    });

    it('should wrap non-Error values', () => {
      const wrappedError = wrapError('string error', 'Wrapped string');

      expect(wrappedError.message).toBe('Wrapped string');
      expect(wrappedError.metadata.cause).toBeInstanceOf(Error);
      expect(wrappedError.metadata.cause?.message).toBe('string error');
    });

    it('should accept custom options', () => {
      const originalError = new Error('Original');
      const wrappedError = wrapError(originalError, 'Custom wrap', {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        retryClassification: RetryClassification.RETRYABLE,
      });

      expect(wrappedError.metadata.category).toBe(ErrorCategory.NETWORK);
      expect(wrappedError.metadata.severity).toBe(ErrorSeverity.HIGH);
      expect(wrappedError.metadata.retryClassification).toBe(RetryClassification.RETRYABLE);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable DangerPrepError', () => {
      const retryableError = ErrorFactory.network('Connection timeout');
      retryableError.metadata.retryClassification = RetryClassification.RETRYABLE;

      const nonRetryableError = ErrorFactory.validation('Invalid input');

      expect(isRetryableError(retryableError)).toBe(true);
      expect(isRetryableError(nonRetryableError)).toBe(false);
    });

    it('should use heuristics for regular Error instances', () => {
      const timeoutError = new Error('Connection timeout');
      const networkError = new Error('ECONNRESET');
      const validationError = new Error('Invalid input format');

      expect(isRetryableError(timeoutError)).toBe(true);
      expect(isRetryableError(networkError)).toBe(true);
      expect(isRetryableError(validationError)).toBe(false);
    });

    it('should handle non-Error values', () => {
      expect(isRetryableError('timeout error')).toBe(true);
      expect(isRetryableError('validation failed')).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });

  describe('extractErrorInfo', () => {
    it('should extract info from DangerPrepError', () => {
      const error = ErrorFactory.network('Network error', {
        data: { endpoint: 'api.example.com' },
      });

      const info = extractErrorInfo(error);

      expect(info).toMatchObject({
        name: 'NetworkError',
        message: 'Network error',
        code: 'NETWORK_ERROR',
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.NETWORK,
        correlationId: testContext.correlationId,
        operation: 'test_operation',
        service: 'test_service',
        data: { endpoint: 'api.example.com' },
      });
    });

    it('should extract info from regular Error', () => {
      const error = new Error('Regular error');
      error.stack = 'Error stack trace';

      const info = extractErrorInfo(error);

      expect(info).toMatchObject({
        name: 'Error',
        message: 'Regular error',
        stack: 'Error stack trace',
      });
    });

    it('should handle non-Error values', () => {
      const info1 = extractErrorInfo('string error');
      const info2 = extractErrorInfo(null);
      const info3 = extractErrorInfo({ custom: 'object' });

      expect(info1).toMatchObject({
        name: 'Unknown',
        message: 'string error',
      });

      expect(info2).toMatchObject({
        name: 'Unknown',
        message: 'null',
      });

      expect(info3).toMatchObject({
        name: 'Unknown',
        message: '{"custom":"object"}',
      });
    });

    it('should include stack trace when available', () => {
      const error = new Error('Test error');
      const info = extractErrorInfo(error);

      expect(info.stack).toBeDefined();
      expect(typeof info.stack).toBe('string');
    });
  });
});
