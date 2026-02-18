// Tests for validation.ts - Input validation utilities
import { describe, it, expect } from 'vitest';
import {
  clampNumber,
  validateIntensity,
  validateRating,
  validatePercentage,
  validatePositiveInt,
  validateString,
  validateNonEmptyString,
  isValidUUID,
  validateArray,
  validateEnum,
  validateDateString,
  validateHour,
  validateDuration,
  sanitizeInput,
  validateEscalationLevel,
  createObjectValidator,
  validateRequestBody,
} from '../../lib/validation';

describe('validation utilities', () => {
  // ============================================
  // clampNumber
  // ============================================
  describe('clampNumber', () => {
    it('should clamp values within range', () => {
      expect(clampNumber(5, 0, 10)).toBe(5);
      expect(clampNumber(0, 0, 10)).toBe(0);
      expect(clampNumber(10, 0, 10)).toBe(10);
    });

    it('should clamp values below minimum', () => {
      expect(clampNumber(-5, 0, 10)).toBe(0);
      expect(clampNumber(-100, 0, 10)).toBe(0);
    });

    it('should clamp values above maximum', () => {
      expect(clampNumber(15, 0, 10)).toBe(10);
      expect(clampNumber(100, 0, 10)).toBe(10);
    });

    it('should return default for non-numbers', () => {
      expect(clampNumber('string', 0, 10)).toBe(0);
      expect(clampNumber(null, 0, 10)).toBe(0);
      expect(clampNumber(undefined, 0, 10)).toBe(0);
      expect(clampNumber({}, 0, 10)).toBe(0);
    });

    it('should return custom default when provided', () => {
      expect(clampNumber('invalid', 0, 10, 5)).toBe(5);
      expect(clampNumber(null, 0, 10, 7)).toBe(7);
    });

    it('should handle Infinity and NaN', () => {
      expect(clampNumber(Infinity, 0, 10)).toBe(0);
      expect(clampNumber(-Infinity, 0, 10)).toBe(0);
      expect(clampNumber(NaN, 0, 10)).toBe(0);
    });
  });

  // ============================================
  // validateIntensity (Lovense 0-20)
  // ============================================
  describe('validateIntensity', () => {
    it('should accept valid intensity values', () => {
      expect(validateIntensity(0)).toBe(0);
      expect(validateIntensity(10)).toBe(10);
      expect(validateIntensity(20)).toBe(20);
    });

    it('should clamp out-of-range values', () => {
      expect(validateIntensity(-5)).toBe(0);
      expect(validateIntensity(25)).toBe(20);
      expect(validateIntensity(100)).toBe(20);
    });

    it('should default to 0 for invalid inputs', () => {
      expect(validateIntensity('high')).toBe(0);
      expect(validateIntensity(null)).toBe(0);
      expect(validateIntensity(undefined)).toBe(0);
    });
  });

  // ============================================
  // validateRating (1-5 stars)
  // ============================================
  describe('validateRating', () => {
    it('should accept valid ratings', () => {
      expect(validateRating(1)).toBe(1);
      expect(validateRating(3)).toBe(3);
      expect(validateRating(5)).toBe(5);
    });

    it('should round fractional ratings', () => {
      expect(validateRating(3.2)).toBe(3);
      expect(validateRating(3.7)).toBe(4);
      expect(validateRating(4.5)).toBe(5);
    });

    it('should clamp out-of-range values', () => {
      expect(validateRating(0)).toBe(1);
      expect(validateRating(-1)).toBe(1);
      expect(validateRating(6)).toBe(5);
      expect(validateRating(10)).toBe(5);
    });

    it('should return null for null/undefined', () => {
      expect(validateRating(null)).toBe(null);
      expect(validateRating(undefined)).toBe(null);
    });

    it('should handle non-number inputs', () => {
      expect(validateRating('good')).toBe(1);
    });
  });

  // ============================================
  // validatePercentage (0-100)
  // ============================================
  describe('validatePercentage', () => {
    it('should accept valid percentages', () => {
      expect(validatePercentage(0)).toBe(0);
      expect(validatePercentage(50)).toBe(50);
      expect(validatePercentage(100)).toBe(100);
    });

    it('should clamp out-of-range values', () => {
      expect(validatePercentage(-10)).toBe(0);
      expect(validatePercentage(150)).toBe(100);
    });

    it('should handle decimal percentages', () => {
      expect(validatePercentage(50.5)).toBe(50.5);
      expect(validatePercentage(99.9)).toBe(99.9);
    });

    it('should default to 0 for invalid inputs', () => {
      expect(validatePercentage('half')).toBe(0);
      expect(validatePercentage(null)).toBe(0);
    });
  });

  // ============================================
  // validatePositiveInt
  // ============================================
  describe('validatePositiveInt', () => {
    it('should accept positive integers', () => {
      expect(validatePositiveInt(0)).toBe(0);
      expect(validatePositiveInt(5)).toBe(5);
      expect(validatePositiveInt(100)).toBe(100);
    });

    it('should floor decimal values', () => {
      expect(validatePositiveInt(5.7)).toBe(5);
      expect(validatePositiveInt(10.9)).toBe(10);
    });

    it('should return default for negative values', () => {
      expect(validatePositiveInt(-5)).toBe(0);
      expect(validatePositiveInt(-5, 10)).toBe(10);
    });

    it('should return default for non-numbers', () => {
      expect(validatePositiveInt('string')).toBe(0);
      expect(validatePositiveInt(null, 5)).toBe(5);
    });
  });

  // ============================================
  // validateString
  // ============================================
  describe('validateString', () => {
    it('should accept valid strings', () => {
      expect(validateString('hello', 10)).toBe('hello');
      expect(validateString('', 10)).toBe('');
    });

    it('should truncate long strings', () => {
      expect(validateString('hello world', 5)).toBe('hello');
      expect(validateString('abcdefghij', 3)).toBe('abc');
    });

    it('should return default for non-strings', () => {
      expect(validateString(123, 10)).toBe('');
      expect(validateString(null, 10)).toBe('');
      expect(validateString(null, 10, 'default')).toBe('default');
    });
  });

  // ============================================
  // validateNonEmptyString
  // ============================================
  describe('validateNonEmptyString', () => {
    it('should accept non-empty strings', () => {
      expect(validateNonEmptyString('hello', 10)).toBe('hello');
    });

    it('should trim whitespace', () => {
      expect(validateNonEmptyString('  hello  ', 10)).toBe('hello');
    });

    it('should return null for empty strings', () => {
      expect(validateNonEmptyString('', 10)).toBe(null);
      expect(validateNonEmptyString('   ', 10)).toBe(null);
    });

    it('should truncate after trimming', () => {
      expect(validateNonEmptyString('  hello world  ', 5)).toBe('hello');
    });

    it('should return null for non-strings', () => {
      expect(validateNonEmptyString(123, 10)).toBe(null);
      expect(validateNonEmptyString(null, 10)).toBe(null);
    });
  });

  // ============================================
  // isValidUUID
  // ============================================
  describe('isValidUUID', () => {
    it('should accept valid UUIDs', () => {
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should accept UUIDs with uppercase letters', () => {
      expect(isValidUUID('123E4567-E89B-12D3-A456-426614174000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('123456789')).toBe(false);
      expect(isValidUUID('123e4567-e89b-12d3-a456')).toBe(false);
      expect(isValidUUID('123e4567-e89b-12d3-a456-42661417400g')).toBe(false);
    });

    it('should reject non-strings', () => {
      expect(isValidUUID(123)).toBe(false);
      expect(isValidUUID(null)).toBe(false);
      expect(isValidUUID(undefined)).toBe(false);
    });
  });

  // ============================================
  // validateArray
  // ============================================
  describe('validateArray', () => {
    const isString = (item: unknown): item is string => typeof item === 'string';
    const isNumber = (item: unknown): item is number => typeof item === 'number';

    it('should filter items with validator', () => {
      expect(validateArray(['a', 'b', 'c'], isString)).toEqual(['a', 'b', 'c']);
      expect(validateArray([1, 2, 'three', 4], isNumber)).toEqual([1, 2, 4]);
    });

    it('should return empty array for non-arrays', () => {
      expect(validateArray('not array', isString)).toEqual([]);
      expect(validateArray(null, isString)).toEqual([]);
      expect(validateArray(123, isNumber)).toEqual([]);
    });

    it('should respect maxLength', () => {
      expect(validateArray(['a', 'b', 'c', 'd', 'e'], isString, 3)).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array if all items fail validation', () => {
      expect(validateArray([1, 2, 3], isString)).toEqual([]);
    });
  });

  // ============================================
  // validateEnum
  // ============================================
  describe('validateEnum', () => {
    const validColors = ['red', 'green', 'blue'] as const;

    it('should accept valid enum values', () => {
      expect(validateEnum('red', validColors, 'blue')).toBe('red');
      expect(validateEnum('green', validColors, 'blue')).toBe('green');
    });

    it('should return default for invalid values', () => {
      expect(validateEnum('yellow', validColors, 'blue')).toBe('blue');
      expect(validateEnum('', validColors, 'red')).toBe('red');
    });

    it('should return default for non-strings', () => {
      expect(validateEnum(123, validColors, 'green')).toBe('green');
      expect(validateEnum(null, validColors, 'blue')).toBe('blue');
    });
  });

  // ============================================
  // validateDateString
  // ============================================
  describe('validateDateString', () => {
    it('should accept valid ISO date strings', () => {
      expect(validateDateString('2024-01-15')).toBe('2024-01-15');
      expect(validateDateString('2024-01-15T10:30:00Z')).toBe('2024-01-15T10:30:00Z');
    });

    it('should return null for invalid dates', () => {
      expect(validateDateString('not-a-date')).toBe(null);
      expect(validateDateString('2024-13-45')).toBe(null);
    });

    it('should return null for non-strings', () => {
      expect(validateDateString(123)).toBe(null);
      expect(validateDateString(null)).toBe(null);
      expect(validateDateString(new Date())).toBe(null);
    });
  });

  // ============================================
  // validateHour (0-23)
  // ============================================
  describe('validateHour', () => {
    it('should accept valid hours', () => {
      expect(validateHour(0)).toBe(0);
      expect(validateHour(12)).toBe(12);
      expect(validateHour(23)).toBe(23);
    });

    it('should clamp out-of-range values', () => {
      expect(validateHour(-1)).toBe(0);
      expect(validateHour(24)).toBe(23);
      expect(validateHour(100)).toBe(23);
    });

    it('should default to 0 for invalid inputs', () => {
      expect(validateHour('noon')).toBe(0);
      expect(validateHour(null)).toBe(0);
    });
  });

  // ============================================
  // validateDuration
  // ============================================
  describe('validateDuration', () => {
    it('should accept valid durations', () => {
      expect(validateDuration(0)).toBe(0);
      expect(validateDuration(60)).toBe(60);
      expect(validateDuration(1440)).toBe(1440); // 24 hours
    });

    it('should clamp to max duration', () => {
      expect(validateDuration(2000)).toBe(1440);
      expect(validateDuration(100, 60)).toBe(60); // custom max
    });

    it('should clamp negative values to 0', () => {
      expect(validateDuration(-30)).toBe(0);
    });

    it('should default to 0 for invalid inputs', () => {
      expect(validateDuration('long')).toBe(0);
      expect(validateDuration(null)).toBe(0);
    });
  });

  // ============================================
  // sanitizeInput (XSS prevention)
  // ============================================
  describe('sanitizeInput', () => {
    it('should escape HTML special characters', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
      );
    });

    it('should escape angle brackets', () => {
      expect(sanitizeInput('<div>')).toBe('&lt;div&gt;');
    });

    it('should escape quotes', () => {
      expect(sanitizeInput('"quoted"')).toBe('&quot;quoted&quot;');
      expect(sanitizeInput("'quoted'")).toBe('&#x27;quoted&#x27;');
    });

    it('should escape forward slashes', () => {
      expect(sanitizeInput('path/to/file')).toBe('path&#x2F;to&#x2F;file');
    });

    it('should return empty string for non-strings', () => {
      expect(sanitizeInput(123)).toBe('');
      expect(sanitizeInput(null)).toBe('');
      expect(sanitizeInput(undefined)).toBe('');
    });

    it('should handle clean input unchanged (except slashes)', () => {
      expect(sanitizeInput('hello world')).toBe('hello world');
    });
  });

  // ============================================
  // validateEscalationLevel
  // ============================================
  describe('validateEscalationLevel', () => {
    it('should accept valid levels within range', () => {
      expect(validateEscalationLevel(0, 10)).toBe(0);
      expect(validateEscalationLevel(5, 10)).toBe(5);
      expect(validateEscalationLevel(10, 10)).toBe(10);
    });

    it('should clamp to max level', () => {
      expect(validateEscalationLevel(15, 10)).toBe(10);
      expect(validateEscalationLevel(100, 5)).toBe(5);
    });

    it('should clamp negative values to 0', () => {
      expect(validateEscalationLevel(-1, 10)).toBe(0);
    });

    it('should default to 0 for invalid inputs', () => {
      expect(validateEscalationLevel('high', 10)).toBe(0);
      expect(validateEscalationLevel(null, 10)).toBe(0);
    });
  });

  // ============================================
  // createObjectValidator
  // ============================================
  describe('createObjectValidator', () => {
    it('should validate objects with schema', () => {
      const validatePerson = createObjectValidator({
        name: (v) => validateString(v, 50, ''),
        age: (v) => validatePositiveInt(v, 0),
      });

      const result = validatePerson({ name: 'John', age: 30 });
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should apply transformations', () => {
      const validatePerson = createObjectValidator({
        name: (v) => validateString(v, 5, ''),
        age: (v) => validatePositiveInt(v, 0),
      });

      const result = validatePerson({ name: 'Very Long Name', age: -5 });
      expect(result).toEqual({ name: 'Very ', age: 0 });
    });

    it('should return null for non-objects', () => {
      const validatePerson = createObjectValidator({
        name: (v) => validateString(v, 50, ''),
      });

      expect(validatePerson(null)).toBe(null);
      expect(validatePerson('string')).toBe(null);
      expect(validatePerson(123)).toBe(null);
    });
  });

  // ============================================
  // validateRequestBody
  // ============================================
  describe('validateRequestBody', () => {
    interface TestBody {
      name: string;
      age: number;
      email?: string;
    }

    it('should validate valid request bodies', () => {
      const result = validateRequestBody<TestBody>(
        { name: 'John', age: 30 },
        ['name', 'age'],
        {
          name: (v) => validateString(v, 50, ''),
          age: (v) => validatePositiveInt(v, 0),
        }
      );

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.name).toBe('John');
        expect(result.data.age).toBe(30);
      }
    });

    it('should fail for missing required fields', () => {
      const result = validateRequestBody<TestBody>(
        { name: 'John' },
        ['name', 'age'],
        {}
      );

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContain('Missing required field: age');
      }
    });

    it('should fail for non-object bodies', () => {
      const result = validateRequestBody<TestBody>(
        'not an object',
        ['name'],
        {}
      );

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContain('Request body must be an object');
      }
    });

    it('should fail for null bodies', () => {
      const result = validateRequestBody<TestBody>(null, ['name'], {});

      expect(result.valid).toBe(false);
    });
  });
});
