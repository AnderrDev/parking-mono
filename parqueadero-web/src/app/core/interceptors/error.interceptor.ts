import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NetworkFailure, ServerFailure, UnauthorizedFailure } from '../either/failures';
import { TelemetryService } from '../services/telemetry.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const telemetry = inject(TelemetryService);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        telemetry.captureError('http:unexpected', { url: req.url, method: req.method });
        return throwError(() => new ServerFailure('Error inesperado'));
      }

      if (error.status === 0) {
        telemetry.captureWarning('http:offline', { url: req.url, method: req.method });
        return throwError(() => new NetworkFailure());
      }
      if (error.status === 401 || error.status === 403) {
        telemetry.captureWarning('http:unauthorized', { url: req.url, status: error.status });
        return throwError(() => new UnauthorizedFailure());
      }

      const message = typeof error.error?.message === 'string'
        ? error.error.message
        : `Error del servidor (${error.status})`;

      telemetry.captureError('http:server', {
        url: req.url,
        method: req.method,
        status: error.status,
        message,
      });
      return throwError(() => new ServerFailure(message, error.status));
    }),
  );
};
