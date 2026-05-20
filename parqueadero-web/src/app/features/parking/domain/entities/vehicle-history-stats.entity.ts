// Métricas históricas acumuladas para una placa específica.
// Spec: parqueadero-web/specs/features/parking/get-vehicle-history-stats.spec.md
//
// Sólo cuenta sesiones cerradas (status='completed'). La sesión activa actual
// y las canceladas no entran en los agregados.

import { ParkingSessionEntity } from './parking-session.entity';

export interface VehicleHistoryStats {
  totalVisits: number;
  totalPaidCents: number;
  totalDurationMinutes: number;
  averagePaidCents: number;
  averageDurationMinutes: number;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
  visitsLast30Days: number;
  paidLast30DaysCents: number;
  recentSessions: ParkingSessionEntity[];
}

export const EMPTY_VEHICLE_HISTORY_STATS: VehicleHistoryStats = {
  totalVisits: 0,
  totalPaidCents: 0,
  totalDurationMinutes: 0,
  averagePaidCents: 0,
  averageDurationMinutes: 0,
  firstVisitAt: null,
  lastVisitAt: null,
  visitsLast30Days: 0,
  paidLast30DaysCents: 0,
  recentSessions: [],
};
