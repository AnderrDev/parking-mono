import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';
import { UserRole } from '../../features/auth/domain/entities/user.entity';

export function requireRole(...roles: UserRole[]): CanActivateFn {
  return () => {
    const authState = inject(AuthStateService);
    const router = inject(Router);

    if (!authState.isAuthenticated()) {
      return router.parseUrl('/auth/login');
    }

    if (authState.hasRole(...roles)) {
      return true;
    }

    return router.parseUrl('/parking');
  };
}
