// Telemetría centralizada del frontend.
//
// Hoy: emite JSON estructurado a console (queda en Vercel/Netlify logs y
// en DevTools) y mantiene un buffer en memoria para diagnóstico in-app.
// Mañana: cuando se provea SENTRY_DSN, basta con enchufar Sentry SDK
// dentro de los métodos `captureError`/`captureEvent` — el call-site
// (interceptor, usecases, pages) no cambia.

import { Injectable, signal } from '@angular/core';
import { Failure } from '../either/failures';

export type TelemetryLevel = 'info' | 'warn' | 'error';

export interface TelemetryEvent {
  ts: string;
  level: TelemetryLevel;
  event: string;
  ctx?: Record<string, unknown>;
}

const BUFFER_MAX = 200;

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly buffer = signal<TelemetryEvent[]>([]);

  recentEvents() {
    return this.buffer.asReadonly();
  }

  captureEvent(event: string, ctx?: Record<string, unknown>): void {
    this.emit('info', event, ctx);
  }

  captureWarning(event: string, ctx?: Record<string, unknown>): void {
    this.emit('warn', event, ctx);
  }

  captureError(eventOrFailure: string | Failure, ctx?: Record<string, unknown>): void {
    if (typeof eventOrFailure === 'string') {
      this.emit('error', eventOrFailure, ctx);
      return;
    }
    this.emit('error', `failure:${eventOrFailure.constructor.name}`, {
      message: eventOrFailure.message,
      ...(ctx ?? {}),
    });
  }

  private emit(level: TelemetryLevel, event: string, ctx?: Record<string, unknown>): void {
    const entry: TelemetryEvent = {
      ts: new Date().toISOString(),
      level,
      event,
      ...(ctx ? { ctx } : {}),
    };
    const next = [entry, ...this.buffer()].slice(0, BUFFER_MAX);
    this.buffer.set(next);
    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}
