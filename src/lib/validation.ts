// Input Validation Helpers
// Type-safe validation utilities for robust input handling

/**
 * Validate and clamp a number to a range
 */
export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  defaultValue?: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue ?? min;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Validate intensity value (0-20 for Lovense)
 */
export function validateIntensity(value: unknown): number {
  return clampNumber(value, 0, 20, 0);
}

/**
 * Validate rating (1-5 stars)
 */
export function validateRating(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const clamped = clampNumber(value, 1, 5);
  return Math.round(clamped);
}

/**
 * Validate percentage (0-100)
 */
export function validatePercentage(value: unknown): number {
  return clampNumber(value, 0, 100, 0);
}

/**
 * Validate positive integer
 */
export function validatePositiveInt(value: unknown, defaultValue = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return defaultValue;
  }
  return Math.floor(value);
}

/**
 * Validate string with max length
 */
export function validateString(
  value: unknown,
  maxLength: number,
  defaultValue = ''
): string {
  if (typeof value !== 'string') {
    return defaultValue;
  }
  return value.slice(0, maxLength);
}

/**
 * Validate non-empty string
 */
export function validateNonEmptyString(
  value: unknown,
  maxLength: number
): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value.trim().slice(0, maxLength);
}

/**
 * Validate UUID format
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate array with type guard
 */
export function validateArray<T>(
  value: unknown,
  validator: (item: unknown) => item is T,
  maxLength?: number
): T[] {
  if (!Array.isArray(value)) return [];

  const validated = value.filter(validator);
  return maxLength ? validated.slice(0, maxLength) : validated;
}

/**
 * Validate enum value
 */
export function validateEnum<T extends string>(
  value: unknown,
  validValues: readonly T[],
  defaultValue: T
): T {
  if (typeof value !== 'string') return defaultValue;
  return validValues.includes(value as T) ? (value as T) : defaultValue;
}

/**
 * Validate date string (ISO format)
 */
export function validateDateString(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const date = new Date(value);
  if (isNaN(date.getTime())) return null;

  return value;
}

/**
 * Validate hour (0-23)
 */
export function validateHour(value: unknown): number {
  return clampNumber(value, 0, 23, 0);
}

/**
 * Validate duration in minutes (positive, max 24 hours)
 */
export function validateDuration(value: unknown, maxMinutes = 1440): number {
  return clampNumber(value, 0, maxMinutes, 0);
}

/**
 * Sanitize user input (prevent XSS)
 */
export function sanitizeInput(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate escalation level (domain-specific bounds)
 */
export function validateEscalationLevel(
  value: unknown,
  maxLevel: number
): number {
  return clampNumber(value, 0, maxLevel, 0);
}

/**
 * Create a validator for object shape
 */
export function createObjectValidator<T extends object>(
  schema: { [K in keyof T]: (value: unknown) => T[K] }
): (value: unknown) => T | null {
  return (value: unknown): T | null => {
    if (typeof value !== 'object' || value === null) return null;

    const result = {} as T;
    const obj = value as Record<string, unknown>;

    for (const key in schema) {
      try {
        result[key] = schema[key](obj[key]);
      } catch {
        return null;
      }
    }

    return result;
  };
}

/**
 * Validate request body with schema
 */
export function validateRequestBody<T>(
  body: unknown,
  requiredFields: (keyof T)[],
  validators: Partial<{ [K in keyof T]: (value: unknown) => T[K] }>
): { valid: true; data: T } | { valid: false; errors: string[] } {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, errors: ['Request body must be an object'] };
  }

  const errors: string[] = [];
  const obj = body as Record<string, unknown>;
  const result = {} as T;

  // Check required fields
  for (const field of requiredFields) {
    if (!(field as string in obj) || obj[field as string] === undefined) {
      errors.push(`Missing required field: ${String(field)}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Validate fields
  for (const key in validators) {
    const validator = validators[key];
    if (validator) {
      try {
        result[key as keyof T] = validator(obj[key]);
      } catch (e) {
        errors.push(`Invalid value for ${key}: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: result };
}
