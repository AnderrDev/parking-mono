from dataclasses import dataclass
from typing import TypeVar, Generic, Callable, Union

L = TypeVar('L')
R = TypeVar('R')
B = TypeVar('B')


@dataclass(frozen=True)
class Left(Generic[L]):
    value: L

    def fold(self, on_left: Callable[[L], B], on_right: Callable) -> B:
        return on_left(self.value)

    def map(self, f: Callable) -> 'Left[L]':
        return self

    def flat_map(self, f: Callable) -> 'Left[L]':
        return self

    def is_left(self) -> bool:
        return True

    def is_right(self) -> bool:
        return False


@dataclass(frozen=True)
class Right(Generic[R]):
    value: R

    def fold(self, on_left: Callable, on_right: Callable[[R], B]) -> B:
        return on_right(self.value)

    def map(self, f: Callable[[R], B]) -> 'Right[B]':
        return Right(f(self.value))

    def flat_map(self, f: Callable[['R'], 'Either']) -> 'Either':
        return f(self.value)

    def is_left(self) -> bool:
        return False

    def is_right(self) -> bool:
        return True


Either = Union[Left[L], Right[R]]
