import { Injectable, OnDestroy } from '@angular/core';
import { createClient, SupabaseClient, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService implements OnDestroy {
  readonly client: SupabaseClient;

  private readonly _session$ = new BehaviorSubject<Session | null>(null);
  readonly session$: Observable<Session | null> = this._session$.asObservable();

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey);

    this.client.auth.getSession().then(({ data }) => {
      this._session$.next(data.session);
    });

    this.client.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        this._session$.next(session);
      },
    );
  }

  get currentSession(): Session | null {
    return this._session$.getValue();
  }

  ngOnDestroy(): void {
    this._session$.complete();
  }
}
