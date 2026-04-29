import { left, right, Left, Right } from './either';
import {
  ValidationFailure,
  BusinessRuleFailure,
  NotFoundFailure,
  UnauthorizedFailure,
  NetworkFailure,
  ServerFailure,
  CacheFailure,
  ConflictFailure,
} from './failures';

describe('Either', () => {
  describe('left()', () => {
    it('creates a Left instance', () => {
      const result = left('error');
      expect(result).toBeInstanceOf(Left);
      expect(result.isLeft()).toBeTrue();
      expect(result.isRight()).toBeFalse();
    });

    it('holds the left value', () => {
      const result = left(42);
      expect((result as Left<number, never>).value).toBe(42);
    });
  });

  describe('right()', () => {
    it('creates a Right instance', () => {
      const result = right('ok');
      expect(result).toBeInstanceOf(Right);
      expect(result.isRight()).toBeTrue();
      expect(result.isLeft()).toBeFalse();
    });

    it('holds the right value', () => {
      const result = right({ id: '1' });
      expect((result as Right<never, { id: string }>).value).toEqual({ id: '1' });
    });
  });

  describe('fold()', () => {
    it('calls onLeft for Left', () => {
      const result = left<string, number>('err').fold(
        (l) => `left:${l}`,
        (r) => `right:${r}`,
      );
      expect(result).toBe('left:err');
    });

    it('calls onRight for Right', () => {
      const result = right<number, string>(7).fold(
        (l) => `left:${l}`,
        (r) => `right:${r}`,
      );
      expect(result).toBe('right:7');
    });
  });

  describe('map()', () => {
    it('transforms Right value', () => {
      const result = right<number, never>(5).map((n) => n * 2);
      expect((result as Right<never, number>).value).toBe(10);
    });

    it('passes Left through unchanged', () => {
      const result = left<string, number>('err').map((n) => n * 2);
      expect(result.isLeft()).toBeTrue();
      expect((result as Left<string, number>).value).toBe('err');
    });
  });

  describe('flatMap()', () => {
    it('chains Right correctly', () => {
      const result = right<number, string>(5)
        .flatMap<number>((n) => (n > 0 ? right<number, string>(n * 2) : left<string, number>('negative')));
      expect((result as Right<string, number>).value).toBe(10);
    });

    it('short-circuits on Left', () => {
      const result = left<string, number>('err')
        .flatMap((n) => right(n * 2));
      expect(result.isLeft()).toBeTrue();
    });
  });

  describe('getOrElse()', () => {
    it('returns Right value', () => {
      expect(right<number, never>(5).getOrElse(0)).toBe(5);
    });

    it('returns default for Left', () => {
      expect(left<string, number>('err').getOrElse(99)).toBe(99);
    });
  });
});

describe('Failures', () => {
  it('ValidationFailure instanceof checks', () => {
    const f = new ValidationFailure('bad input', 'plate');
    expect(f).toBeInstanceOf(ValidationFailure);
    expect(f.message).toBe('bad input');
    expect(f.field).toBe('plate');
  });

  it('BusinessRuleFailure instanceof checks', () => {
    const f = new BusinessRuleFailure('sesión duplicada', 'DUPLICATE_SESSION');
    expect(f).toBeInstanceOf(BusinessRuleFailure);
    expect(f.code).toBe('DUPLICATE_SESSION');
  });

  it('NotFoundFailure instanceof checks', () => {
    const f = new NotFoundFailure('no encontrado', 'session');
    expect(f).toBeInstanceOf(NotFoundFailure);
    expect(f.resource).toBe('session');
  });

  it('UnauthorizedFailure defaults message', () => {
    const f = new UnauthorizedFailure();
    expect(f).toBeInstanceOf(UnauthorizedFailure);
    expect(f.message).toBe('No autorizado');
  });

  it('NetworkFailure defaults message', () => {
    const f = new NetworkFailure();
    expect(f).toBeInstanceOf(NetworkFailure);
    expect(f.message).toBe('Sin conexión a internet');
  });

  it('ServerFailure instanceof checks', () => {
    const f = new ServerFailure('500 error', 500);
    expect(f).toBeInstanceOf(ServerFailure);
    expect(f.statusCode).toBe(500);
  });

  it('CacheFailure instanceof checks', () => {
    const f = new CacheFailure('cache miss');
    expect(f).toBeInstanceOf(CacheFailure);
  });

  it('ConflictFailure instanceof checks', () => {
    const f = new ConflictFailure('conflict', 'id-123');
    expect(f).toBeInstanceOf(ConflictFailure);
    expect(f.conflictingId).toBe('id-123');
  });
});
