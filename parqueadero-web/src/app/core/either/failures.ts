export abstract class Failure {
  constructor(public readonly message: string) {}
}

export class ValidationFailure extends Failure {
  readonly _tag = 'ValidationFailure' as const;
  constructor(message: string, public readonly field?: string) { super(message); }
}

export class BusinessRuleFailure extends Failure {
  readonly _tag = 'BusinessRuleFailure' as const;
  constructor(message: string, public readonly code?: string) { super(message); }
}

export class NotFoundFailure extends Failure {
  readonly _tag = 'NotFoundFailure' as const;
  constructor(message: string, public readonly resource?: string) { super(message); }
}

export class UnauthorizedFailure extends Failure {
  readonly _tag = 'UnauthorizedFailure' as const;
  constructor(message = 'No autorizado') { super(message); }
}

export class NetworkFailure extends Failure {
  readonly _tag = 'NetworkFailure' as const;
  constructor(message = 'Sin conexión a internet') { super(message); }
}

export class ServerFailure extends Failure {
  readonly _tag = 'ServerFailure' as const;
  constructor(message: string, public readonly statusCode?: number) { super(message); }
}

export class CacheFailure extends Failure {
  readonly _tag = 'CacheFailure' as const;
  constructor(message: string) { super(message); }
}

export class ConflictFailure extends Failure {
  readonly _tag = 'ConflictFailure' as const;
  constructor(message: string, public readonly conflictingId?: string) { super(message); }
}
