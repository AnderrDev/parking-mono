export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'VIEW';

export class AuditEntryEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string | null,
    public readonly userName: string | null,
    public readonly action: AuditAction,
    public readonly entityType: string,
    public readonly entityId: string,
    public readonly beforeJson: Record<string, unknown> | null,
    public readonly afterJson: Record<string, unknown> | null,
    public readonly createdAt: Date,
  ) {}
}
