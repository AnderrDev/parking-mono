import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly variant: ToastVariant;
}

const DEFAULT_DISMISS_MS = 5000;
const MAX_VISIBLE = 3;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly _toasts = signal<Toast[]>([]);

  readonly toasts = this._toasts.asReadonly();

  success(message: string, dismissAfterMs = DEFAULT_DISMISS_MS): void {
    this.push('success', message, dismissAfterMs);
  }

  error(message: string, dismissAfterMs = DEFAULT_DISMISS_MS): void {
    this.push('error', message, dismissAfterMs);
  }

  warning(message: string, dismissAfterMs = DEFAULT_DISMISS_MS): void {
    this.push('warning', message, dismissAfterMs);
  }

  info(message: string, dismissAfterMs = DEFAULT_DISMISS_MS): void {
    this.push('info', message, dismissAfterMs);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(variant: ToastVariant, message: string, dismissAfterMs: number): void {
    const id = this.nextId++;
    this._toasts.update((list) => {
      const next = [...list, { id, message, variant }];
      return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
    });

    if (dismissAfterMs > 0) {
      setTimeout(() => this.dismiss(id), dismissAfterMs);
    }
  }
}
