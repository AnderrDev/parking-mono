"""
UseCase: emit_invoice — orquesta el flujo completo de emisión.

Pasos:
 1. Mapear request → InvoiceData (entity)
 2. Calcular CUFE
 3. Construir XML UBL 2.1 con el CUFE adentro
 4. Firmar con XAdES-EPES
 5. Enviar a DIAN
 6. Retornar resultado

Sin `raise` para control de flujo: cada paso retorna Either y se cortocircuita
ante la primera falla.
"""
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.either import Either, Left, Right
from app.core.failures import Failure
from app.data.datasources.dian_datasource import DianDataSource
from app.data.models.invoice_model import InvoiceEmissionRequest
from app.domain.entities.invoice_entity import (
    CustomerData,
    InvoiceData,
    InvoiceLine,
)
from app.infrastructure.crypto.cufe_calculator import CUFECalculator
from app.infrastructure.crypto.xades_signer import XADESSigner
from app.infrastructure.xml.ubl_builder import UBLBuilder


@dataclass(frozen=True)
class EmitInvoiceResult:
    invoice_number: str
    cufe: str
    dian_status: str           # 'accepted' | 'rejected'
    dian_messages: list[str]
    track_id: str
    issued_at: datetime
    signed_xml: str            # útil para Storage


class EmitInvoiceUseCase:
    def __init__(
        self,
        nit_emisor: str,
        ubl_builder: UBLBuilder,
        cufe_calculator: CUFECalculator,
        xades_signer: XADESSigner,
        dian_datasource: DianDataSource,
    ):
        self.nit_emisor = nit_emisor
        self.ubl_builder = ubl_builder
        self.cufe_calculator = cufe_calculator
        self.xades_signer = xades_signer
        self.dian_datasource = dian_datasource

    def execute(
        self, request: InvoiceEmissionRequest,
    ) -> Either[Failure, EmitInvoiceResult]:
        invoice = self._to_entity(request)

        cufe_either = self.cufe_calculator.calculate(invoice)
        if isinstance(cufe_either, Left):
            return cufe_either
        cufe = cufe_either.value

        ubl_either = self.ubl_builder.build(invoice, cufe)
        if isinstance(ubl_either, Left):
            return ubl_either
        unsigned_xml = ubl_either.value

        signed_either = self.xades_signer.sign(unsigned_xml)
        if isinstance(signed_either, Left):
            return signed_either
        signed_xml = signed_either.value

        dian_either = self.dian_datasource.send_bill(signed_xml, request.internal_number)
        if isinstance(dian_either, Left):
            # contingency / network / 503 — el caller decide reintentar
            return dian_either
        dian_response = dian_either.value

        if dian_response.is_rejected:
            return Right(EmitInvoiceResult(
                invoice_number=request.internal_number,
                cufe=cufe,
                dian_status="rejected",
                dian_messages=[e.message for e in dian_response.errors],
                track_id=dian_response.track_id,
                issued_at=datetime.now(timezone.utc),
                signed_xml=signed_xml,
            ))

        return Right(EmitInvoiceResult(
            invoice_number=request.internal_number,
            cufe=cufe,
            dian_status="accepted",
            dian_messages=[],
            track_id=dian_response.track_id,
            issued_at=datetime.now(timezone.utc),
            signed_xml=signed_xml,
        ))

    def _to_entity(self, request: InvoiceEmissionRequest) -> InvoiceData:
        return InvoiceData(
            nit_emisor=self.nit_emisor,
            tipo_documento=request.invoice_type,
            numero_factura=request.internal_number,
            fecha_expedicion=request.invoice_date,
            customer=CustomerData(
                doc_type=request.customer.doc_type,
                doc_number=request.customer.doc_number,
                first_name=request.customer.first_name,
                last_name=request.customer.last_name,
                email=request.customer.email,
                phone=request.customer.phone,
                municipality=request.customer.municipality,
                department=request.customer.department,
            ),
            lines=[
                InvoiceLine(
                    description=line.description,
                    quantity=line.quantity,
                    unit_price_cents=line.unit_price_cents,
                    tax_percent=line.tax_percent,
                )
                for line in request.lines
            ],
            subtotal_cents=request.subtotal_cents,
            descuento_cents=request.descuento_cents,
            impuestos_cents=request.impuestos_cents,
            retenciones_cents=request.retenciones_cents,
            total_cents=request.total_cents,
            internal_number=request.internal_number,
            parking_session_ids=request.parking_session_ids,
        )
