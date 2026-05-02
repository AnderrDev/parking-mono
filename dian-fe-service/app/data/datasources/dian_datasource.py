"""ABC de la integración con DIAN — permite swap impl ↔ mock vía DI."""
from abc import ABC, abstractmethod

from app.core.either import Either
from app.core.failures import DianFailure
from app.domain.entities.dian_response_entity import DianResponse


class DianDataSource(ABC):
    @abstractmethod
    def send_bill(
        self, signed_xml: str, invoice_id: str,
    ) -> Either[DianFailure, DianResponse]:
        """Envía la factura firmada a DIAN y retorna la respuesta procesada."""
        ...
