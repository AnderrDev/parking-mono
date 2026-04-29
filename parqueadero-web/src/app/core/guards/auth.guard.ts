import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

// Placeholder funcional — se completa en Fase 3 con AuthStateService y claims de rol.
export const authGuard: CanActivateFn = () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  if (supabase.currentSession !== null) {
    return true;
  }
  return router.parseUrl('/auth/login');
};
