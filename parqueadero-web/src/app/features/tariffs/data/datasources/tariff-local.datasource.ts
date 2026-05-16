import { Injectable, inject } from '@angular/core';
import { Either, left, right } from '../../../../core/either/either';
import { Failure, NetworkFailure } from '../../../../core/either/failures';
import { LocalDbService } from '../../../../core/services/local-db.service';
import { TariffEntity } from '../../../parking/domain/entities/tariff.entity';
import { VehicleType } from '../../../parking/domain/entities/parking-session.entity';
import {
  TariffModel as RemoteTariffModel,
  TariffMapper,
} from '../../../parking/data/models/tariff.model';
import { PaginatedResult } from '../../../../shared/models/pagination.model';
import { TariffDataSource } from './tariff.datasource';
import {
  ListTariffsParams,
  CreateTariffParams,
  UpdateTariffParams,
} from '../../domain/repositories/tariff.repository';

// ──────────────────────────────────────────────────────────────────────────────
// TariffLocalDataSource — lectura desde el mirror Dexie (Sprint 1, Fase 8).
// Cualquier escritura responde NetworkFailure (offline read-only en Sprint 1).
// `is_active` se persiste como 0|1 en Dexie; al leer lo hidratamos a boolean.
// ──────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class TariffLocalDataSource extends TariffDataSource {
  private readonly localDb = inject(LocalDbService);

  private hydrate(row: unknown): RemoteTariffModel {
    const r = row as Record<string, unknown>;
    const raw = r['is_active'];
    const active = raw === 1 || raw === true;
    return { ...r, is_active: active } as RemoteTariffModel;
  }

  private isActive(row: Record<string, unknown>): boolean {
    const raw = row['is_active'];
    return raw === 1 || raw === true;
  }

  async list(params: ListTariffsParams): Promise<Either<Failure, PaginatedResult<TariffEntity>>> {
    try {
      const db = this.localDb.getDB();
      let rows = await db.tariffs.toArray();

      // Filtros locales.
      if (params.vehicleType) {
        rows = rows.filter((r) => r['vehicle_type'] === params.vehicleType);
      }
      if (params.isActive !== null && params.isActive !== undefined) {
        const expected = !!params.isActive;
        rows = rows.filter((r) => this.isActive(r as unknown as Record<string, unknown>) === expected);
      }

      // Sort.
      const sortField = params.sort?.field ?? 'vehicle_type';
      const sortDir = params.sort?.direction ?? 'asc';
      const cmp = (a: unknown, b: unknown): number => {
        if (a == null && b == null) return 0;
        if (a == null) return -1;
        if (b == null) return 1;
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
      };
      rows.sort((a, b) => {
        const primary = cmp(a[sortField], b[sortField]) * (sortDir === 'asc' ? 1 : -1);
        if (primary !== 0) return primary;
        if (sortField !== 'name') return cmp(a['name'], b['name']);
        return 0;
      });

      // Paginación in-memory.
      const page = params.pagination?.page ?? 1;
      const pageSize = params.pagination?.pageSize ?? 25;
      const total = rows.length;
      const slice = rows.slice((page - 1) * pageSize, page * pageSize);

      return right({
        data: slice.map((r) => TariffMapper.toEntity(this.hydrate(r))),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (e) {
      return left(new NetworkFailure(`Error leyendo tarifas locales: ${String(e)}`));
    }
  }

  async findById(id: string): Promise<Either<Failure, TariffEntity | null>> {
    try {
      const row = await this.localDb.getDB().tariffs.get(id);
      if (!row) return right(null);
      return right(TariffMapper.toEntity(this.hydrate(row)));
    } catch (e) {
      return left(new NetworkFailure(`Error leyendo tarifa local: ${String(e)}`));
    }
  }

  async create(_params: CreateTariffParams): Promise<Either<Failure, TariffEntity>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async update(_id: string, _params: UpdateTariffParams): Promise<Either<Failure, TariffEntity>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async deactivate(_id: string): Promise<Either<Failure, void>> {
    return left(new NetworkFailure('No disponible offline'));
  }

  async existsActive(name: string, vehicleType: string, excludeId?: string): Promise<Either<Failure, boolean>> {
    try {
      const rows = await this.localDb.getDB().tariffs.toArray();
      const hit = rows.find((r) => {
        const rec = r as unknown as Record<string, unknown>;
        return (
          this.isActive(rec) &&
          rec['name'] === name &&
          rec['vehicle_type'] === vehicleType &&
          (excludeId ? r.id !== excludeId : true)
        );
      });
      return right(!!hit);
    } catch (e) {
      return left(new NetworkFailure(`Error consultando tarifa local: ${String(e)}`));
    }
  }

  async existsActiveSameCategory(
    vehicleType: VehicleType,
    isMonthly: boolean,
    excludeId?: string,
  ): Promise<Either<Failure, boolean>> {
    try {
      const rows = await this.localDb.getDB().tariffs.toArray();
      const hit = rows.find((r) => {
        const rec = r as unknown as Record<string, unknown>;
        const monthly = rec['unit'] === 'mensualidad';
        return (
          this.isActive(rec) &&
          rec['vehicle_type'] === vehicleType &&
          monthly === isMonthly &&
          (excludeId ? r.id !== excludeId : true)
        );
      });
      return right(!!hit);
    } catch (e) {
      return left(new NetworkFailure(`Error consultando tarifa local: ${String(e)}`));
    }
  }

  async getActiveMonthlyTariff(vehicleType: VehicleType): Promise<Either<Failure, TariffEntity | null>> {
    try {
      const rows = await this.localDb.getDB().tariffs.toArray();
      const hit = rows.find((r) => {
        const rec = r as unknown as Record<string, unknown>;
        return this.isActive(rec) && rec['vehicle_type'] === vehicleType && rec['unit'] === 'mensualidad';
      });
      return right(hit ? TariffMapper.toEntity(this.hydrate(hit)) : null);
    } catch (e) {
      return left(new NetworkFailure(`Error consultando mensualidad local: ${String(e)}`));
    }
  }
}
