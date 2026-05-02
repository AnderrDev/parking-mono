"""Mock determinístico para dev y tests — no llama a DIAN."""
import hashlib
import uuid
from typing import Literal

from app.core.either import Either, Left, Right
from app.core.failures import DianFailure
from app.data.datasources.dian_datasource import DianDataSource
from app.domain.entities.dian_response_entity import (
    DianResponse,
    DianValidationError,
)


class DianDataSourceMock(DianDataSource):
    """
    Mock controlable. Útil cuando:
     - No hay habilitación DIAN aún.
     - Tests E2E del UseCase sin tocar la red.
     - Edge Function en modo "stub" antes de ramp-up.

    Por defecto retorna 'OK' con CUFE derivado del XML.
    """

    def __init__(
        self,
        scenario: Literal["accepted", "rejected", "contingency"] = "accepted",
        custom_track_id: str | None = None,
    ):
        self.scenario = scenario
        self.custom_track_id = custom_track_id

    def send_bill(
        self, signed_xml: str, invoice_id: str,
    ) -> Either[DianFailure, DianResponse]:
        track_id = self.custom_track_id or uuid.uuid4().hex

        if self.scenario == "accepted":
            cufe = hashlib.sha384(signed_xml.encode("utf-8")).hexdigest().upper()
            return Right(DianResponse(
                status_code=200,
                status="OK",
                track_id=track_id,
                signature=cufe,
            ))

        if self.scenario == "rejected":
            return Right(DianResponse(
                status_code=400,
                status="REJECTION",
                track_id=track_id,
                errors=[DianValidationError(
                    line_number="1",
                    error_code="MOCK-001",
                    message="Rechazo simulado por mock DIAN",
                )],
            ))

        # contingency
        return Left(DianFailure(
            message="DIAN no disponible (mock contingency)",
            status="contingency",
        ))
