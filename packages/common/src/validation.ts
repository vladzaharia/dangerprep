/**
 * Common validation utilities and type guards
 *
 * Provides shared validation functions, type guards, and validation patterns
 * used across all DangerPrep packages.
 */

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validation function type
 */
export type Validator<T> = (value: T) => ValidationResult;

/**
 * Type guard function type
 */
export type TypeGuard<T> = (value: unknown) => value is T;

/**
 * Create a validation result
 */
export function createValidationResult(isValid: boolean, errors: string[] = []): ValidationResult {
  return { isValid, errors };
}

/**
 * Combine multiple validation results
 */
export function combineValidationResults(...results: ValidationResult[]): ValidationResult {
  const allErrors = results.flatMap(result => result.errors);
  const isValid = results.every(result => result.isValid);

  return createValidationResult(isValid, allErrors);
}

/**
 * Common string validators
 */
export const StringValidators = {
  /** Check if string is not empty */
  nonEmpty: (value: string): ValidationResult => {
    const isValid = typeof value === 'string' && value.length > 0;
    return createValidationResult(isValid, isValid ? [] : ['String cannot be empty']);
  },

  /** Check if string matches pattern */
  pattern:
    (pattern: RegExp, errorMessage?: string) =>
    (value: string): ValidationResult => {
      const isValid = typeof value === 'string' && pattern.test(value);
      const defaultMessage = `String must match pattern: ${pattern}`;
      return createValidationResult(isValid, isValid ? [] : [errorMessage || defaultMessage]);
    },

  /** Check if string length is within range */
  length:
    (min: number, max?: number) =>
    (value: string): ValidationResult => {
      if (typeof value !== 'string') {
        return createValidationResult(false, ['Value must be a string']);
      }

      const errors: string[] = [];
      if (value.length < min) {
        errors.push(`String must be at least ${min} characters long`);
      }
      if (max !== undefined && value.length > max) {
        errors.push(`String must be at most ${max} characters long`);
      }

      return createValidationResult(errors.length === 0, errors);
    },

  /** Check if string is alphanumeric with optional special characters */
  alphanumeric:
    (allowSpecial: string = '') =>
    (value: string): ValidationResult => {
      const pattern = new RegExp(
        `^[a-zA-Z0-9${allowSpecial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+$`
      );
      const isValid = typeof value === 'string' && pattern.test(value);
      const message = allowSpecial
        ? `String must be alphanumeric with allowed special characters: ${allowSpecial}`
        : 'String must be alphanumeric';
      return createValidationResult(isValid, isValid ? [] : [message]);
    },

  /** Check if string is a valid email */
  email: (value: string): ValidationResult => {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = typeof value === 'string' && pattern.test(value);
    return createValidationResult(isValid, isValid ? [] : ['Invalid email format']);
  },

  /** Check if string is a valid URL */
  url: (value: string): ValidationResult => {
    try {
      new URL(value);
      return createValidationResult(true);
    } catch {
      return createValidationResult(false, ['Invalid URL format']);
    }
  },

  /** Check if string is a valid cron expression */
  cron: (value: string): ValidationResult => {
    // Basic cron validation - 5 or 6 fields separated by spaces
    const parts = value.trim().split(/\s+/);
    const isValid = parts.length === 5 || parts.length === 6;
    return createValidationResult(isValid, isValid ? [] : ['Invalid cron expression format']);
  },
};

/**
 * Common number validators
 */
export const NumberValidators = {
  /** Check if number is within range */
  range:
    (min: number, max: number) =>
    (value: number): ValidationResult => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return createValidationResult(false, ['Value must be a finite number']);
      }

      const errors: string[] = [];
      if (value < min) {
        errors.push(`Number must be at least ${min}`);
      }
      if (value > max) {
        errors.push(`Number must be at most ${max}`);
      }

      return createValidationResult(errors.length === 0, errors);
    },

  /** Check if number is positive */
  positive: (value: number): ValidationResult => {
    const isValid = typeof value === 'number' && Number.isFinite(value) && value > 0;
    return createValidationResult(isValid, isValid ? [] : ['Number must be positive']);
  },

  /** Check if number is non-negative */
  nonNegative: (value: number): ValidationResult => {
    const isValid = typeof value === 'number' && Number.isFinite(value) && value >= 0;
    return createValidationResult(isValid, isValid ? [] : ['Number must be non-negative']);
  },

  /** Check if number is an integer */
  integer: (value: number): ValidationResult => {
    const isValid = typeof value === 'number' && Number.isInteger(value);
    return createValidationResult(isValid, isValid ? [] : ['Number must be an integer']);
  },

  /** Check if number is a percentage (0-100) */
  percentage: (value: number): ValidationResult => {
    return NumberValidators.range(0, 100)(value);
  },
};

/**
 * Common array validators
 */
export const ArrayValidators = {
  /** Check if array is not empty */
  nonEmpty: <T>(value: T[]): ValidationResult => {
    const isValid = Array.isArray(value) && value.length > 0;
    return createValidationResult(isValid, isValid ? [] : ['Array cannot be empty']);
  },

  /** Check if array length is within range */
  length:
    (min: number, max?: number) =>
    <T>(value: T[]): ValidationResult => {
      if (!Array.isArray(value)) {
        return createValidationResult(false, ['Value must be an array']);
      }

      const errors: string[] = [];
      if (value.length < min) {
        errors.push(`Array must have at least ${min} items`);
      }
      if (max !== undefined && value.length > max) {
        errors.push(`Array must have at most ${max} items`);
      }

      return createValidationResult(errors.length === 0, errors);
    },

  /** Check if all array items pass validation */
  items:
    <T>(itemValidator: Validator<T>) =>
    (value: T[]): ValidationResult => {
      if (!Array.isArray(value)) {
        return createValidationResult(false, ['Value must be an array']);
      }

      const results = value.map((item, index) => {
        const result = itemValidator(item);
        return {
          ...result,
          errors: result.errors.map(error => `Item ${index}: ${error}`),
        };
      });

      return combineValidationResults(...results);
    },

  /** Check if array contains unique items */
  unique: <T>(value: T[], keyFn?: (item: T) => unknown): ValidationResult => {
    if (!Array.isArray(value)) {
      return createValidationResult(false, ['Value must be an array']);
    }

    const keys = keyFn ? value.map(keyFn) : value;
    const uniqueKeys = new Set(keys);
    const isValid = keys.length === uniqueKeys.size;

    return createValidationResult(isValid, isValid ? [] : ['Array must contain unique items']);
  },
};

/**
 * Common object validators
 */
export const ObjectValidators = {
  /** Check if object has required properties */
  hasProperties:
    <T extends Record<string, unknown>>(requiredProps: (keyof T)[]) =>
    (value: T): ValidationResult => {
      if (typeof value !== 'object' || value === null) {
        return createValidationResult(false, ['Value must be an object']);
      }

      const missing = requiredProps.filter(prop => !(prop in value));
      const isValid = missing.length === 0;
      const errors = missing.map(prop => `Missing required property: ${String(prop)}`);

      return createValidationResult(isValid, errors);
    },

  /** Check if object properties pass validation */
  properties:
    <T extends Record<string, unknown>>(
      propertyValidators: Partial<Record<keyof T, Validator<T[keyof T]>>>
    ) =>
    (value: T): ValidationResult => {
      if (typeof value !== 'object' || value === null) {
        return createValidationResult(false, ['Value must be an object']);
      }

      const results = Object.entries(propertyValidators).map(([key, validator]) => {
        if (validator && key in value) {
          const result = validator(value[key as keyof T]);
          return {
            ...result,
            errors: result.errors.map(error => `Property ${key}: ${error}`),
          };
        }
        return createValidationResult(true);
      });

      return combineValidationResults(...results);
    },
};

/**
 * Common type guards
 */
export const TypeGuards = {
  /** Check if value is a string */
  isString: (value: unknown): value is string => typeof value === 'string',

  /** Check if value is a number */
  isNumber: (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value),

  /** Check if value is a boolean */
  isBoolean: (value: unknown): value is boolean => typeof value === 'boolean',

  /** Check if value is an array */
  isArray: <T>(value: unknown): value is T[] => Array.isArray(value),

  /** Check if value is an object */
  isObject: (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value),

  /** Check if value is null or undefined */
  isNullish: (value: unknown): value is null | undefined => value === null || value === undefined,

  /** Check if value is defined (not null or undefined) */
  isDefined: <T>(value: T | null | undefined): value is T => value !== null && value !== undefined,
};

/**
 * Validation utilities
 */
export const ValidationUtils = {
  /** Create a validator that combines multiple validators */
  combine: <T>(...validators: Validator<T>[]): Validator<T> => {
    return (value: T) => {
      const results = validators.map(validator => validator(value));
      return combineValidationResults(...results);
    };
  },

  /** Create a validator that passes if any validator passes */
  any: <T>(...validators: Validator<T>[]): Validator<T> => {
    return (value: T) => {
      const results = validators.map(validator => validator(value));
      const isValid = results.some(result => result.isValid);
      const errors = isValid ? [] : ['None of the validation rules passed'];
      return createValidationResult(isValid, errors);
    };
  },

  /** Create a conditional validator */
  when: <T>(condition: (value: T) => boolean, validator: Validator<T>): Validator<T> => {
    return (value: T) => {
      if (condition(value)) {
        return validator(value);
      }
      return createValidationResult(true);
    };
  },

  /** Create a validator from a type guard */
  fromTypeGuard: <T>(
    guard: TypeGuard<T>,
    errorMessage: string = 'Type validation failed'
  ): Validator<unknown> => {
    return (value: unknown) => {
      const isValid = guard(value);
      return createValidationResult(isValid, isValid ? [] : [errorMessage]);
    };
  },
};

/**
 * Export all validators and utilities
 */
export const Validators = {
  String: StringValidators,
  Number: NumberValidators,
  Array: ArrayValidators,
  Object: ObjectValidators,
  Utils: ValidationUtils,
} as const;
