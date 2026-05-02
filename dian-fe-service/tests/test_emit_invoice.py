"""
Tests del UseCase EmitInvoice — pega los 4 componentes (UBL, CUFE, XAdES, DIAN)
con cert autofirmado y mock de DIAN.
"""
from datetime import datetime, timezone

import pytest

from app.core.either import Left, Right
from app.core.failures import DianFailure, ValidationFailure
from app.data.datasources.dian_datasource_mock import DianDataSourceMock
from app.data.models.invoice_model import (
    CustomerModel,
    InvoiceEmissionRequest,
    InvoiceLineModel,
)
from app.domain.entities.supplier_entity import SupplierData
from app.domain.usecases.emit_invoice import EmitInvoiceUseCase
from app.infrastructure.crypto.cufe_calculator import CUFECalculator
from app.infrastructure.crypto.xades_signer import XADESSigner
from app.infrastructure.xml.ubl_builder import UBLBuilder


def _supplier() -> SupplierData:
    return SupplierData(
        nit="890123456",
        dv="7",
        legal_name="Parqueadero Test S.A.S.",
    )


def _request() -> InvoiceEmissionRequest:
    return InvoiceEmissionRequest(
        internal_number="FE-1001",
        invoice_type="01",
        invoice_date=datetime(2026, 4, 28, 14, 35, 30, tzinfo=timezone.utc),
        customer=CustomerModel(
            doc_type="CC",
            doc_number="123456789",
            first_name="Juan",
            last_name="Perez",
            email="juan@example.com",
        ),
        lines=[
            InvoiceLineModel(
                description="Parqueadero 2h 30m",
                quantity=1,
                unit_price_cents=1500000,
                tax_percent=19.0,
            ),
        ],
        subtotal_cents=1500000,
        impuestos_cents=285000,
        total_cents=1785000,
    )


@pytest.fixture
def use_case(self_signed_cert):
    private_key, cert = self_signed_cert
    return EmitInvoiceUseCase(
        nit_emisor="890123456",
        ubl_builder=UBLBuilder(_supplier()),
        cufe_calculator=CUFECalculator("A" * 96),
        xades_signer=XADESSigner(private_key, cert),
        dian_datasource=DianDataSourceMock(scenario="accepted"),
    )


# ── Happy path ────────────────────────────────────────────────────────────────

def test_emit_invoice_accepted(use_case):
    result = use_case.execute(_request())
    assert isinstance(result, Right)
    success = result.value
    assert success.dian_status == "accepted"
    assert len(success.cufe) == 96
    assert success.invoice_number == "FE-1001"
    assert success.signed_xml.startswith("<?xml")
    assert success.track_id


def test_emit_invoice_signed_xml_contains_cufe(use_case):
    result = use_case.execute(_request())
    cufe = result.value.cufe
    assert cufe in result.value.signed_xml


# ── Falla en CUFE ─────────────────────────────────────────────────────────────

def test_emit_invoice_fails_with_empty_clave_tecnica(self_signed_cert):
    private_key, cert = self_signed_cert
    use_case = EmitInvoiceUseCase(
        nit_emisor="890123456",
        ubl_builder=UBLBuilder(_supplier()),
        cufe_calculator=CUFECalculator(""),  # vacía
        xades_signer=XADESSigner(private_key, cert),
        dian_datasource=DianDataSourceMock(),
    )
    result = use_case.execute(_request())
    assert isinstance(result, Left)
    assert isinstance(result.value, ValidationFailure)


# ── Falla en DIAN ─────────────────────────────────────────────────────────────

def test_emit_invoice_dian_rejection_returns_right_with_status_rejected(self_signed_cert):
    private_key, cert = self_signed_cert
    use_case = EmitInvoiceUseCase(
        nit_emisor="890123456",
        ubl_builder=UBLBuilder(_supplier()),
        cufe_calculator=CUFECalculator("A" * 96),
        xades_signer=XADESSigner(private_key, cert),
        dian_datasource=DianDataSourceMock(scenario="rejected"),
    )
    result = use_case.execute(_request())
    assert isinstance(result, Right)
    assert result.value.dian_status == "rejected"
    assert len(result.value.dian_messages) >= 1


def test_emit_invoice_dian_contingency_returns_left(self_signed_cert):
    private_key, cert = self_signed_cert
    use_case = EmitInvoiceUseCase(
        nit_emisor="890123456",
        ubl_builder=UBLBuilder(_supplier()),
        cufe_calculator=CUFECalculator("A" * 96),
        xades_signer=XADESSigner(private_key, cert),
        dian_datasource=DianDataSourceMock(scenario="contingency"),
    )
    result = use_case.execute(_request())
    assert isinstance(result, Left)
    assert isinstance(result.value, DianFailure)
    assert result.value.status == "contingency"
