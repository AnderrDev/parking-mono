import { Either } from '../either/either';
import { Failure } from '../either/failures';

export abstract class UseCase<Params, Result> {
  abstract execute(params: Params): Promise<Either<Failure, Result>>;
}

export class NoParams {}
