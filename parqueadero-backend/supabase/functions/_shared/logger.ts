// Logger estructurado para Edge Functions.
//
// Diseño: emite JSON a stdout (un objeto por línea). Supabase Logs los
// indexa y permite filtrar por campos (`level`, `fn`, `session_id`, etc.).
// Cuando se enchufe Sentry/Datadog, basta con un transporte adicional aquí
// — el call-site no cambia.
//
// Uso:
//   const log = createLogger({ fn: 'siigo-emit-invoice', request_id });
//   log.info('attempt_started', { session_id, invoice_id });
//   log.error('siigo_4xx', { http_status: 422, body });

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  fn: string;
  request_id?: string;
  user_id?: string;
  [k: string]: unknown;
}

export interface Logger {
  debug(event: string, ctx?: Record<string, unknown>): void;
  info(event: string, ctx?: Record<string, unknown>): void;
  warn(event: string, ctx?: Record<string, unknown>): void;
  error(event: string, ctx?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): Logger;
}

function emit(level: LogLevel, base: LogContext, event: string, ctx?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...base,
    ...(ctx ?? {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function createLogger(base: LogContext): Logger {
  return {
    debug: (event, ctx) => emit('debug', base, event, ctx),
    info: (event, ctx) => emit('info', base, event, ctx),
    warn: (event, ctx) => emit('warn', base, event, ctx),
    error: (event, ctx) => emit('error', base, event, ctx),
    child: (extra) => createLogger({ ...base, ...extra }),
  };
}

// Helper para extraer un request_id desde headers estándar (idempotencia
// + correlación entre cliente y EF).
export function requestIdFrom(req: Request): string {
  return (
    req.headers.get('x-request-id') ??
    req.headers.get('cf-ray') ??
    crypto.randomUUID()
  );
}
