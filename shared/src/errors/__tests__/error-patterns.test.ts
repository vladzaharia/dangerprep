/**
 * Tests for error patterns and standardized handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorPatterns,
  ErrorAggregator,
  ErrorFactory,
  ErrorSeverity,
  ErrorCategory,
  ErrorContextManager,
  type ErrorContext,
} from '../index.js';
import { NotificationLevel, NotificationType } from '../../notifications/index.js';
import type { Logger } from '../../logging/index.js';
import type { NotificationManager } from '../../notifications/index.js';

describe('Error Patterns', () => {
  let mockLogger: Logger;
  let mockNotificationManager: NotificationManager;
  let testContext: ErrorContext;

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

    testContext = ErrorContextManager.createContext({
      operation: 'test_operation',
      service: 'test_service',
      component: 'test_component',
    });
  });

  describe('ErrorPatterns.logAndNotifyError', () => {
    it('should log error with appropriate level', async () => {
      const error = ErrorFactory.network('Connection failed');
      error.metadata.severity = ErrorSeverity.HIGH;

      await ErrorPatterns.logAndNotifyError(error, mockLogger, mockNotificationManager, {
        operation: 'test_op',
        component: 'test_component',
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error occurred',
        expect.objectContaining({
          name: 'NetworkError',
          message: 'Connection failed',
          operation: 'test_op',
          component: 'test_component',
        })
      );
    });

    it('should use correct log level based on severity', async () => {
      const lowError = ErrorFactory.validation('Minor validation issue');
      lowError.metadata.severity = ErrorSeverity.LOW;

      const mediumError = ErrorFactory.businessLogic('Business rule violation');
      mediumError.metadata.severity = ErrorSeverity.MEDIUM;

      const highError = ErrorFactory.network('Connection failed');
      highError.metadata.severity = ErrorSeverity.HIGH;

      const criticalError = ErrorFactory.system('System failure');
      criticalError.metadata.severity = ErrorSeverity.CRITICAL;

      await ErrorPatterns.logAndNotifyError(lowError, mockLogger);
      expect(mockLogger.info).toHaveBeenCalled();

      await ErrorPatterns.logAndNotifyError(mediumError, mockLogger);
      expect(mockLogger.warn).toHaveBeenCalled();

      await ErrorPatterns.logAndNotifyError(highError, mockLogger);
      expect(mockLogger.error).toHaveBeenCalled();

      await ErrorPatterns.logAndNotifyError(criticalError, mockLogger);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should send notification when notification manager provided', async () => {
      const error = ErrorFactory.network('Connection failed');

      await ErrorPatterns.logAndNotifyError(error, mockLogger, mockNotificationManager, {
        operation: 'test_op',
      });

      expect(mockNotificationManager.notify).toHaveBeenCalledWith(
        NotificationType.SERVICE_ERROR,
        'test_op: Connection failed',
        expect.objectContaining({
          level: NotificationLevel.ERROR,
          description: 'Error Occurred',
        })
      );
    });

    it('should suppress notification when requested', async () => {
      const error = ErrorFactory.network('Connection failed');

      await ErrorPatterns.logAndNotifyError(error, mockLogger, mockNotificationManager, {
        suppressNotification: true,
      });

      expect(mockNotificationManager.notify).not.toHaveBeenCalled();
    });

    it('should force notification when requested', async () => {
      const error = ErrorFactory.validation('Validation failed');
      error.metadata.shouldNotify = false;

      await ErrorPatterns.logAndNotifyError(error, mockLogger, mockNotificationManager, {
        forceNotification: true,
      });

      expect(mockNotificationManager.notify).toHaveBeenCalled();
    });

    it('should handle regular Error instances', async () => {
      const error = new Error('Regular error');

      await ErrorPatterns.logAndNotifyError(error, mockLogger, mockNotificationManager);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockNotificationManager.notify).toHaveBeenCalledWith(
        NotificationType.SERVICE_ERROR,
        'Regular error',
        expect.objectContaining({
          level: NotificationLevel.ERROR,
        })
      );
    });
  });

  describe('ErrorPatterns.getLogLevelFromSeverity', () => {
    it('should map severity to correct log level', () => {
      expect(ErrorPatterns.getLogLevelFromSeverity(ErrorSeverity.LOW)).toBe('info');
      expect(ErrorPatterns.getLogLevelFromSeverity(ErrorSeverity.MEDIUM)).toBe('warn');
      expect(ErrorPatterns.getLogLevelFromSeverity(ErrorSeverity.HIGH)).toBe('error');
      expect(ErrorPatterns.getLogLevelFromSeverity(ErrorSeverity.CRITICAL)).toBe('error');
    });
  });

  describe('ErrorPatterns.getNotificationLevelFromSeverity', () => {
    it('should map severity to correct notification level', () => {
      expect(ErrorPatterns.getNotificationLevelFromSeverity(ErrorSeverity.LOW)).toBe(NotificationLevel.INFO);
      expect(ErrorPatterns.getNotificationLevelFromSeverity(ErrorSeverity.MEDIUM)).toBe(NotificationLevel.WARN);
      expect(ErrorPatterns.getNotificationLevelFromSeverity(ErrorSeverity.HIGH)).toBe(NotificationLevel.ERROR);
      expect(ErrorPatterns.getNotificationLevelFromSeverity(ErrorSeverity.CRITICAL)).toBe(NotificationLevel.CRITICAL);
    });
  });

  describe('ErrorPatterns.getNotificationTypeFromCategory', () => {
    it('should map all categories to SERVICE_ERROR', () => {
      expect(ErrorPatterns.getNotificationTypeFromCategory(ErrorCategory.NETWORK)).toBe(NotificationType.SERVICE_ERROR);
      expect(ErrorPatterns.getNotificationTypeFromCategory(ErrorCategory.FILESYSTEM)).toBe(NotificationType.SERVICE_ERROR);
      expect(ErrorPatterns.getNotificationTypeFromCategory(ErrorCategory.CONFIGURATION)).toBe(NotificationType.SERVICE_ERROR);
      expect(ErrorPatterns.getNotificationTypeFromCategory(ErrorCategory.VALIDATION)).toBe(NotificationType.SERVICE_ERROR);
      expect(ErrorPatterns.getNotificationTypeFromCategory(ErrorCategory.EXTERNAL_SERVICE)).toBe(NotificationType.SERVICE_ERROR);
      expect(ErrorPatterns.getNotificationTypeFromCategory(ErrorCategory.AUTHENTICATION)).toBe(NotificationType.SERVICE_ERROR);
      expect(ErrorPatterns.getNotificationTypeFromCategory(ErrorCategory.BUSINESS_LOGIC)).toBe(NotificationType.SERVICE_ERROR);
      expect(ErrorPatterns.getNotificationTypeFromCategory(ErrorCategory.SYSTEM)).toBe(NotificationType.SERVICE_ERROR);
      expect(ErrorPatterns.getNotificationTypeFromCategory(ErrorCategory.UNKNOWN)).toBe(NotificationType.SERVICE_ERROR);
    });
  });

  describe('ErrorPatterns.formatErrorMessage', () => {
    it('should format message with context', () => {
      const error = new Error('Test error');
      const message = ErrorPatterns.formatErrorMessage(error, 'test_operation', 'test_component');

      expect(message).toBe('test_operation > test_component: Test error');
    });

    it('should format message without context', () => {
      const error = new Error('Test error');
      const message = ErrorPatterns.formatErrorMessage(error);

      expect(message).toBe('Test error');
    });

    it('should handle non-Error values', () => {
      const message = ErrorPatterns.formatErrorMessage('string error', 'operation');

      expect(message).toBe('operation: string error');
    });
  });

  describe('ErrorPatterns.createAggregationKey', () => {
    it('should create key for DangerPrepError', () => {
      const error = ErrorFactory.network('Connection failed');
      const key = ErrorPatterns.createAggregationKey(error, 'sync_operation');

      expect(key).toBe('NETWORK_ERROR:network:sync_operation');
    });

    it('should create key for regular Error', () => {
      const error = new Error('Test error');
      const key = ErrorPatterns.createAggregationKey(error, 'test_operation');

      expect(key).toBe('Error:test_operation');
    });

    it('should handle unknown errors', () => {
      const key = ErrorPatterns.createAggregationKey('string error', 'operation');

      expect(key).toBe('unknown_error:operation');
    });
  });

  describe('ErrorPatterns.shouldRetryError', () => {
    it('should respect max attempts', () => {
      const error = ErrorFactory.network('Connection failed');
      
      expect(ErrorPatterns.shouldRetryError(error, 1, 3)).toBe(true);
      expect(ErrorPatterns.shouldRetryError(error, 3, 3)).toBe(false);
      expect(ErrorPatterns.shouldRetryError(error, 4, 3)).toBe(false);
    });

    it('should check DangerPrepError retry classification', () => {
      const retryableError = ErrorFactory.network('Connection failed');
      const nonRetryableError = ErrorFactory.validation('Invalid input');

      expect(ErrorPatterns.shouldRetryError(retryableError, 1)).toBe(true);
      expect(ErrorPatterns.shouldRetryError(nonRetryableError, 1)).toBe(false);
    });

    it('should use heuristics for regular errors', () => {
      const timeoutError = new Error('Connection timeout');
      const networkError = new Error('ECONNRESET');
      const validationError = new Error('Invalid format');

      expect(ErrorPatterns.shouldRetryError(timeoutError, 1)).toBe(true);
      expect(ErrorPatterns.shouldRetryError(networkError, 1)).toBe(true);
      expect(ErrorPatterns.shouldRetryError(validationError, 1)).toBe(false);
    });
  });

  describe('ErrorPatterns.getRecoverySuggestions', () => {
    it('should return suggestions for DangerPrepError', () => {
      const error = ErrorFactory.network('Connection failed');
      const suggestions = ErrorPatterns.getRecoverySuggestions(error);

      expect(suggestions).toContain('Check network connectivity');
      expect(suggestions).toContain('Verify service endpoints');
    });

    it('should provide heuristic suggestions for regular errors', () => {
      const networkError = new Error('Connection timeout');
      const permissionError = new Error('Permission denied');
      const spaceError = new Error('No space left on device');

      const networkSuggestions = ErrorPatterns.getRecoverySuggestions(networkError);
      const permissionSuggestions = ErrorPatterns.getRecoverySuggestions(permissionError);
      const spaceSuggestions = ErrorPatterns.getRecoverySuggestions(spaceError);

      expect(networkSuggestions).toContain('Check network connectivity');
      expect(permissionSuggestions).toContain('Check file permissions');
      expect(spaceSuggestions).toContain('Check available disk space');
    });

    it('should provide default suggestion for unknown errors', () => {
      const unknownError = new Error('Unknown error');
      const suggestions = ErrorPatterns.getRecoverySuggestions(unknownError);

      expect(suggestions).toEqual(['Review error details and try again']);
    });
  });

  describe('ErrorAggregator', () => {
    let aggregator: ErrorAggregator;

    beforeEach(() => {
      aggregator = new ErrorAggregator();
    });

    it('should track error occurrences', () => {
      const error1 = ErrorFactory.network('Connection failed');
      const error2 = ErrorFactory.network('Connection failed');
      const error3 = ErrorFactory.validation('Invalid input');

      aggregator.addError(error1, 'sync_operation');
      aggregator.addError(error2, 'sync_operation');
      aggregator.addError(error3, 'validation_operation');

      const stats = aggregator.getErrorStats();
      expect(stats).toHaveLength(2);

      const networkStats = stats.find(s => s.key.includes('NETWORK_ERROR'));
      const validationStats = stats.find(s => s.key.includes('VALIDATION_ERROR'));

      expect(networkStats?.count).toBe(2);
      expect(validationStats?.count).toBe(1);
    });

    it('should limit stored errors per key', () => {
      const error = ErrorFactory.network('Connection failed');

      // Add more than 10 errors
      for (let i = 0; i < 15; i++) {
        aggregator.addError(error, 'test_operation');
      }

      const stats = aggregator.getErrorStats();
      const networkStats = stats.find(s => s.key.includes('NETWORK_ERROR'));

      expect(networkStats?.count).toBe(15);
      expect(networkStats?.recentErrors).toHaveLength(10); // Should only keep last 10
    });

    it('should get most frequent errors', () => {
      const networkError = ErrorFactory.network('Connection failed');
      const validationError = ErrorFactory.validation('Invalid input');

      // Add network errors more frequently
      for (let i = 0; i < 5; i++) {
        aggregator.addError(networkError, 'sync');
      }

      for (let i = 0; i < 2; i++) {
        aggregator.addError(validationError, 'validation');
      }

      const frequent = aggregator.getMostFrequentErrors(1);
      expect(frequent).toHaveLength(1);
      expect(frequent[0].count).toBe(5);
      expect(frequent[0].key).toContain('NETWORK_ERROR');
    });

    it('should clear all statistics', () => {
      const error = ErrorFactory.network('Connection failed');
      aggregator.addError(error, 'test');

      expect(aggregator.getErrorStats()).toHaveLength(1);

      aggregator.clear();
      expect(aggregator.getErrorStats()).toHaveLength(0);
    });

    it('should clear old errors', () => {
      const error = ErrorFactory.network('Connection failed');
      aggregator.addError(error, 'test');

      // Clear errors older than 0ms (should clear all)
      aggregator.clearOldErrors(0);
      expect(aggregator.getErrorStats()).toHaveLength(0);
    });
  });
});
