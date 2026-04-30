import { Injectable, signal, computed } from '@angular/core';
import { UserEntity, UserRole } from '../../features/auth/domain/entities/user.entity';

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private readonly _currentUser = signal<UserEntity | null>(null);

  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly role = computed(() => this._currentUser()?.role ?? null);

  setUser(user: UserEntity): void {
    this._currentUser.set(user);
  }

  clear(): void {
    this._currentUser.set(null);
  }

  hasRole(...roles: UserRole[]): boolean {
    const currentRole = this.role();
    return currentRole !== null && roles.includes(currentRole);
  }
}
