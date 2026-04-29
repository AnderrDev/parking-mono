import { LoginUseCase } from './login.usecase';
import { AuthRepository } from '../repositories/auth.repository';
import { UserEntity } from '../entities/user.entity';
import { left, right } from '../../../../core/either/either';
import {
  NetworkFailure,
  ServerFailure,
  UnauthorizedFailure,
  ValidationFailure,
} from '../../../../core/either/failures';

const mockUser = new UserEntity(
  'uuid-1',
  new Date('2024-01-01'),
  new Date('2024-01-01'),
  'operario@test.com',
  'operador',
  'Test Operario',
  true,
);

class MockAuthRepository extends AuthRepository {
  loginResult = right<UserEntity, never>(mockUser) as ReturnType<AuthRepository['login']>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async login(_email: string, _password: string) {
    return this.loginResult;
  }

  async logout() {
    return right<void, never>(undefined) as ReturnType<AuthRepository['logout']>;
  }

  async getCurrentUser() {
    return right<UserEntity | null, never>(null) as ReturnType<AuthRepository['getCurrentUser']>;
  }
}

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let repo: MockAuthRepository;

  beforeEach(() => {
    repo = new MockAuthRepository();
    useCase = new LoginUseCase(repo);
  });

  it('happy path: returns UserEntity for valid credentials', async () => {
    repo.loginResult = Promise.resolve(right(mockUser));

    const result = await useCase.execute({
      email: 'operario@test.com',
      password: 'secret123',
    });

    expect(result.isRight()).toBeTrue();
    result.fold(
      () => fail('Expected Right'),
      (user) => {
        expect(user).toBe(mockUser);
        expect(user.email).toBe('operario@test.com');
        expect(user.role).toBe('operador');
      },
    );
  });

  it('ValidationFailure: empty email', async () => {
    const result = await useCase.execute({ email: '', password: 'secret123' });

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (failure) => {
        expect(failure).toBeInstanceOf(ValidationFailure);
        expect((failure as ValidationFailure).field).toBe('email');
      },
      () => fail('Expected Left'),
    );
  });

  it('ValidationFailure: invalid email format', async () => {
    const result = await useCase.execute({ email: 'not-an-email', password: 'secret123' });

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (failure) => expect(failure).toBeInstanceOf(ValidationFailure),
      () => fail('Expected Left'),
    );
  });

  it('ValidationFailure: password too short (< 6 chars)', async () => {
    const result = await useCase.execute({ email: 'valid@test.com', password: '12345' });

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (failure) => {
        expect(failure).toBeInstanceOf(ValidationFailure);
        expect((failure as ValidationFailure).field).toBe('password');
      },
      () => fail('Expected Left'),
    );
  });

  it('UnauthorizedFailure: wrong credentials from repository', async () => {
    repo.loginResult = Promise.resolve(
      left(new UnauthorizedFailure('Credenciales incorrectas')),
    );

    const result = await useCase.execute({
      email: 'operario@test.com',
      password: 'wrongpass',
    });

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (failure) => {
        expect(failure).toBeInstanceOf(UnauthorizedFailure);
        expect(failure.message).toBe('Credenciales incorrectas');
      },
      () => fail('Expected Left'),
    );
  });

  it('NetworkFailure: propagated from repository', async () => {
    repo.loginResult = Promise.resolve(left(new NetworkFailure()));

    const result = await useCase.execute({
      email: 'operario@test.com',
      password: 'secret123',
    });

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (failure) => expect(failure).toBeInstanceOf(NetworkFailure),
      () => fail('Expected Left'),
    );
  });

  it('ServerFailure: missing role claim propagated from repository', async () => {
    repo.loginResult = Promise.resolve(left(new ServerFailure('JWT sin claim role')));

    const result = await useCase.execute({
      email: 'operario@test.com',
      password: 'secret123',
    });

    expect(result.isLeft()).toBeTrue();
    result.fold(
      (failure) => {
        expect(failure).toBeInstanceOf(ServerFailure);
        expect(failure.message).toBe('JWT sin claim role');
      },
      () => fail('Expected Left'),
    );
  });

  it('trims whitespace from email before validation', async () => {
    repo.loginResult = Promise.resolve(right(mockUser));

    const result = await useCase.execute({
      email: '  operario@test.com  ',
      password: 'secret123',
    });

    expect(result.isRight()).toBeTrue();
  });
});
