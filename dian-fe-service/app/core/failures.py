from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class Failure:
    message: str


@dataclass(frozen=True)
class ValidationFailure(Failure):
    """Datos de entrada inválidos (montos, documento, campos requeridos)."""
    fields: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class BusinessRuleFailure(Failure):
    """Regla de negocio violada (ej: factura ya emitida)."""
    pass


@dataclass(frozen=True)
class XmlFailure(Failure):
    """Error construyendo o validando el XML UBL 2.1."""
    pass


@dataclass(frozen=True)
class CryptoFailure(Failure):
    """Error al cargar certificado o aplicar firma XAdES-EPES."""
    pass


@dataclass(frozen=True)
class DianFailure(Failure):
    """
    Respuesta negativa o sin respuesta de DIAN.
    status: 'rejected' | 'contingency' | 'timeout'
    """
    status: str = "rejected"
    dian_messages: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class NetworkFailure(Failure):
    """Error de red al conectar con DIAN o Supabase."""
    pass


@dataclass(frozen=True)
class ServerFailure(Failure):
    """Error interno del servidor (unexpected)."""
    pass
