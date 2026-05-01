import { Injectable, OnDestroy, signal } from '@angular/core';
import {
  PowerSyncDatabase,
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/web';
import { SupabaseService } from './supabase.service';
import { PARQUEADERO_SCHEMA } from './powersync.schema';
import { environment } from '../../../environments/environment';

export type SyncState = 'idle' | 'connecting' | 'connected' | 'error' | 'disabled';

class SupabasePowerSyncConnector implements PowerSyncBackendConnector {
  constructor(private readonly supabase: SupabaseService) {}

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data } = await this.supabase.client.auth.getSession();
    if (!data.session) return null;
    const creds: PowerSyncCredentials = {
      endpoint: environment.powerSyncUrl,
      token: data.session.access_token,
    };
    if (data.session.expires_at) {
      creds.expiresAt = new Date(data.session.expires_at * 1000);
    }
    return creds;
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    try {
      for (const op of transaction.crud) {
        const { op: opType, table, id, opData } = op;
        if (opType === 'PUT') {
          const { error } = await this.supabase.client
            .from(table)
            .upsert({ id, ...opData });
          if (error) throw error;
        } else if (opType === 'PATCH') {
          const { error } = await this.supabase.client
            .from(table)
            .update(opData ?? {})
            .eq('id', id);
          if (error) throw error;
        } else if (opType === 'DELETE') {
          const { error } = await this.supabase.client
            .from(table)
            .delete()
            .eq('id', id);
          if (error) throw error;
        }
      }
      await transaction.complete();
    } catch (err) {
      console.error('[PowerSync] uploadData error:', err);
      throw err;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class PowerSyncService implements OnDestroy {
  readonly db: PowerSyncDatabase;

  readonly syncState = signal<SyncState>('idle');
  readonly pendingChanges = signal(0);

  constructor(private readonly supabase: SupabaseService) {
    this.db = new PowerSyncDatabase({
      schema: PARQUEADERO_SCHEMA,
      database: { dbFilename: 'parqueadero.db' },
    });
  }

  async connect(): Promise<void> {
    if (!environment.powerSyncUrl) {
      // Sin URL configurada: SQLite local funciona pero no sincroniza.
      this.syncState.set('disabled');
      return;
    }
    try {
      this.syncState.set('connecting');
      const connector = new SupabasePowerSyncConnector(this.supabase);
      await this.db.connect(connector);
      this.syncState.set('connected');
    } catch (err) {
      console.error('[PowerSync] connect error:', err);
      this.syncState.set('error');
    }
  }

  async disconnect(): Promise<void> {
    await this.db.disconnect();
    this.syncState.set('idle');
  }

  ngOnDestroy(): void {
    void this.db.close();
  }
}
