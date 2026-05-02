from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class DianValidationError:
    """Cada error reportado por DIAN viene como nodo dentro de ErrorMessage."""
    line_number: str = ""
    error_code: str = ""
    message: str = ""


@dataclass(frozen=True)
class DianResponse:
    """
    Respuesta de DIAN a un SendBillSync.
    Mapea el bloque <SendBillSyncResult>.
    """
    status_code: int            # 200 OK, 400 REJECTION, 401, 500, 503
    status: str                 # "OK" | "REJECTION" | "PENDING" | "PROCESSING"
    track_id: str = ""          # ID para consultar luego con GetStatus
    signature: str = ""         # CUFE retornado por DIAN
    xml_base64: str = ""        # XML procesado (cuando DIAN lo retorna)
    pdf_base64: str = ""        # PDF (cuando DIAN lo retorna)
    errors: List[DianValidationError] = field(default_factory=list)
    raw_response: str = ""      # SOAP completo, para debug y archivo

    @property
    def is_accepted(self) -> bool:
        return self.status_code == 200 and self.status == "OK"

    @property
    def is_rejected(self) -> bool:
        return self.status == "REJECTION"
