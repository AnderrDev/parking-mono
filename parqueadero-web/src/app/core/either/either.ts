export type Either<L, R> = Left<L, R> | Right<L, R>;

export class Left<L, R> {
  readonly _tag = 'Left' as const;
  constructor(readonly value: L) {}

  isLeft(): this is Left<L, R> { return true; }
  isRight(): this is Right<L, R> { return false; }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  map<B>(_f: (r: R) => B): Either<L, B> { return this as unknown as Left<L, B>; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  flatMap<B>(_f: (r: R) => Either<L, B>): Either<L, B> { return this as unknown as Left<L, B>; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fold<T>(onLeft: (l: L) => T, _onRight: (r: R) => T): T { return onLeft(this.value); }
  getOrElse(defaultValue: R): R { return defaultValue; }
}

export class Right<L, R> {
  readonly _tag = 'Right' as const;
  constructor(readonly value: R) {}

  isLeft(): this is Left<L, R> { return false; }
  isRight(): this is Right<L, R> { return true; }

  map<B>(f: (r: R) => B): Either<L, B> { return new Right<L, B>(f(this.value)); }
  flatMap<B>(f: (r: R) => Either<L, B>): Either<L, B> { return f(this.value); }
  fold<U>(_onLeft: (l: L) => U, onRight: (r: R) => U): U { return onRight(this.value); }
  getOrElse(_defaultValue: R): R { return this.value; } // eslint-disable-line @typescript-eslint/no-unused-vars
}

export function left<L, R = never>(value: L): Either<L, R> {
  return new Left<L, R>(value);
}

export function right<R, L = never>(value: R): Either<L, R> {
  return new Right<L, R>(value);
}
