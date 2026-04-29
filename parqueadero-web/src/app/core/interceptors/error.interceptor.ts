import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { NetworkFailure, ServerFailure, UnauthorizedFailure } from '../either/failures';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => new ServerFailure('Error inesperado'));
      }

      if (error.status === 0) {
        return throwError(() => new NetworkFailure());
      }
      if (error.status === 401 || error.status === 403) {
        return throwError(() => new UnauthorizedFailure());
      }

      const message = typeof error.error?.message === 'string'
        ? error.error.message
        : `Error del servidor (${error.status})`;

      return throwError(() => new ServerFailure(message, error.status));
    }),
  );
};
