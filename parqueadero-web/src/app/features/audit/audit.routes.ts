import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { requireRole } from '../../core/guards/role.guard';
import {
  AUDIT_DATASOURCE_TOKEN,
  AUDIT_REPOSITORY_TOKEN,
  LIST_AUDIT_TOKEN,
} from '../../core/di/injection-tokens';
import { AuditRemoteDataSource } from './data/datasources/audit-remote.datasource';
import { AuditRepositoryImpl } from './data/repositories/audit.repository.impl';
import { ListAuditUseCase } from './domain/usecases/list-audit.usecase';

const auditProviders = [
  { provide: AUDIT_DATASOURCE_TOKEN, useClass: AuditRemoteDataSource },
  { provide: AUDIT_REPOSITORY_TOKEN, useClass: AuditRepositoryImpl },
  { provide: LIST_AUDIT_TOKEN, useClass: ListAuditUseCase },
];

export const auditRoutes: Routes = [
  {
    path: '',
    providers: auditProviders,
    canActivate: [authGuard, requireRole('admin', 'contador')],
    loadComponent: () =>
      import('./presentation/pages/audit-log.page').then((m) => m.AuditLogPageComponent),
    data: { title: 'Auditoría' },
  },
];
