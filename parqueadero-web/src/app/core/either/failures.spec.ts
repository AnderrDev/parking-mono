import {
  BusinessRuleFailure,
  CacheFailure,
  ConflictFailure,
  Failure,
  NetworkFailure,
  NotFoundFailure,
  ServerFailure,
  UnauthorizedFailure,
  ValidationFailure,
} from './failures';

describe('Failures', () => {
  it('ValidationFailure es Failure', () => {
    const f = new ValidationFailure('placa inválida', 'plate');
    expect(f).toBeInstanceOf(Failure);
    expect(f).toBeInstanceOf(ValidationFailure);
    expect(f.message).toBe('placa inválida');
    expect(f.field).toBe('plate');
  });

  it('BusinessRuleFailure expone code', () => {
    const f = new BusinessRuleFailure('placa con sesión activa', 'one_active_per_plate');
    expect(f.code).toBe('one_active_per_plate');
  });

  it('NotFoundFailure expone resource', () => {
    const f = new NotFoundFailure('no se encontró', 'parking_session');
    expect(f.resource).toBe('parking_session');
  });

  it('UnauthorizedFailure es Failure', () => {
    const f = new UnauthorizedFailure('token expirado');
    expect(f).toBeInstanceOf(Failure);
  });

  it('NetworkFailure es Failure', () => {
    const f = new NetworkFailure('sin conexión');
    expect(f).toBeInstanceOf(Failure);
    expect(f.message).toBe('sin conexión');
  });

  it('ServerFailure expone statusCode', () => {
    const f = new ServerFailure('postgres error', 500);
    expect(f.statusCode).toBe(500);
  });

  it('CacheFailure es Failure', () => {
    const f = new CacheFailure('IndexedDB lleno');
    expect(f).toBeInstanceOf(Failure);
  });

  it('ConflictFailure expone conflictingId', () => {
    const f = new ConflictFailure('conflicto', 'id-123');
    expect(f.conflictingId).toBe('id-123');
  });

  it('cada Failure es distinguible por instanceof', () => {
    const failures: Failure[] = [
      new ValidationFailure('a'),
      new BusinessRuleFailure('b'),
      new NotFoundFailure('c'),
      new UnauthorizedFailure('d'),
      new NetworkFailure('e'),
      new ServerFailure('f'),
      new CacheFailure('g'),
      new ConflictFailure('h'),
    ];
    expect(failures.every((f) => f instanceof Failure)).toBeTrue();
    // Cada subclase es distinguible
    expect(failures.filter((f) => f instanceof ValidationFailure).length).toBe(1);
    expect(failures.filter((f) => f instanceof BusinessRuleFailure).length).toBe(1);
  });
});
