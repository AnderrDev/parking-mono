// Clases de error y clasificador HTTP para la integración Siigo.
// Spec: specs/edge-functions/_shared-siigo-client.spec.md §"errors.ts"

export class SiigoAuthError extends Error {
  constructor(message: string, public readonly httpStatus?: number) {
    super(message);
    this.name = 'SiigoAuthError';
  }
}

export class SiigoCustomerError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'SiigoCustomerError';
  }
}

export class SiigoNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiigoNetworkError';
  }
}

export class SiigoValidationError extends Error {
  constructor(message: string, public readonly siigoErrors: unknown[]) {
    super(message);
    this.name = 'SiigoValidationError';
  }
}

export type SiigoErrorClass =
  | 'auth'
  | 'validation'
  | 'conflict'
  | 'rate_limit'
  | 'server'
  | 'unknown';

export function classifySiigoError(status: number): SiigoErrorClass {
  if (status === 401 || status === 403) return 'auth';
  if (status === 400 || status === 422) return 'validation';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Sanitiza headers/body antes de persistir en `siigo_invoice_attempts`. */
export function sanitizeForAudit<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  const cloned: Record<string, unknown> = Array.isArray(value)
    ? [...(value as unknown[])] as unknown as Record<string, unknown>
    : { ...(value as Record<string, unknown>) };

  for (const key of Object.keys(cloned)) {
    const lower = key.toLowerCase();
    if (lower === 'authorization' || lower === 'access_key' || lower === 'access_token' || lower === 'password') {
      cloned[key] = '<redacted>';
      continue;
    }
    const v = cloned[key];
    if (v && typeof v === 'object') {
      cloned[key] = sanitizeForAudit(v);
    }
  }
  return cloned as T;
}
