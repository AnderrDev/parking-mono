"""
Tests de la ruta POST /invoice — usa dependency_overrides de FastAPI para
inyectar un UseCase con mock DIAN.
"""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.di import get_emit_invoice_use_case
from app.data.datasources.dian_datasource_mock import DianDataSourceMock
from app.domain.entities.supplier_entity import SupplierData
from app.domain.usecases.emit_invoice import EmitInvoiceUseCase
from app.infrastructure.crypto.cufe_calculator import CUFECalculator
from app.infrastructure.crypto.xades_signer import XADESSigner
from app.infrastructure.xml.ubl_builder import UBLBuilder
from app.main import app


def _make_use_case(self_signed_cert, scenario: str = "accepted") -> EmitInvoiceUseCase:
    private_key, cert = self_signed_cert
    return EmitInvoiceUseCase(
        nit_emisor="890123456",
        ubl_builder=UBLBuilder(SupplierData(nit="890123456", dv="7", legal_name="Test")),
        cufe_calculator=CUFECalculator("A" * 96),
        xades_signer=XADESSigner(private_key, cert),
        dian_datasource=DianDataSourceMock(scenario=scenario),
    )


def _sample_payload() -> dict:
    return {
        "internal_number": "FE-2001",
        "invoice_type": "01",
        "invoice_date": "2026-04-28T14:35:30Z",
        "customer": {
            "doc_type": "CC",
            "doc_number": "123456789",
            "first_name": "Juan",
            "last_name": "Perez",
            "email": "juan@example.com",
        },
        "lines": [{
            "description": "Parqueadero 2h",
            "quantity": 1,
            "unit_price_cents": 1500000,
            "tax_percent": 19.0,
        }],
        "subtotal_cents": 1500000,
        "impuestos_cents": 285000,
        "total_cents": 1785000,
    }


@pytest.fixture
def client_accepted(self_signed_cert):
    app.dependency_overrides[get_emit_invoice_use_case] = (
        lambda: _make_use_case(self_signed_cert, "accepted")
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client_rejected(self_signed_cert):
    app.dependency_overrides[get_emit_invoice_use_case] = (
        lambda: _make_use_case(self_signed_cert, "rejected")
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client_contingency(self_signed_cert):
    app.dependency_overrides[get_emit_invoice_use_case] = (
        lambda: _make_use_case(self_signed_cert, "contingency")
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


# ── Happy path ────────────────────────────────────────────────────────────────

def test_post_invoice_accepted_returns_200(client_accepted):
    response = client_accepted.post("/invoice", json=_sample_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["dian_status"] == "accepted"
    assert body["invoice_number"] == "FE-2001"
    assert len(body["cufe"]) == 96
    assert body["track_id"]


def test_post_invoice_rejected_returns_200_with_status_rejected(client_rejected):
    """Rechazo de DIAN no es error HTTP — la factura se procesó, pero fue rechazada."""
    response = client_rejected.post("/invoice", json=_sample_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["dian_status"] == "rejected"
    assert len(body["dian_messages"]) >= 1


def test_post_invoice_contingency_returns_503(client_contingency):
    response = client_contingency.post("/invoice", json=_sample_payload())
    assert response.status_code == 503
    body = response.json()
    assert body["detail"]["error"] == "dian"
    assert body["detail"]["status"] == "contingency"


# ── Validación de input ───────────────────────────────────────────────────────

def test_post_invoice_validation_error_missing_field(client_accepted):
    payload = _sample_payload()
    del payload["customer"]
    response = client_accepted.post("/invoice", json=payload)
    assert response.status_code == 422


def test_post_invoice_validation_error_invalid_doc_type(client_accepted):
    payload = _sample_payload()
    payload["customer"]["doc_type"] = "INVALIDO"
    response = client_accepted.post("/invoice", json=payload)
    assert response.status_code == 422


def test_post_invoice_validation_error_negative_amount(client_accepted):
    payload = _sample_payload()
    payload["lines"][0]["unit_price_cents"] = -100
    response = client_accepted.post("/invoice", json=payload)
    assert response.status_code == 422


def test_post_invoice_validation_error_doc_number_with_letters(client_accepted):
    payload = _sample_payload()
    payload["customer"]["doc_number"] = "ABC123"
    response = client_accepted.post("/invoice", json=payload)
    assert response.status_code == 422


def test_post_invoice_validation_error_empty_lines(client_accepted):
    payload = _sample_payload()
    payload["lines"] = []
    response = client_accepted.post("/invoice", json=payload)
    assert response.status_code == 422


# ── 503 cuando no hay UseCase configurado (sin override) ─────────────────────

def test_post_invoice_503_when_service_unconfigured():
    """Sin override y sin cert configurado en .env, la DI debe responder 503."""
    # Asegurar que no haya overrides residuales
    app.dependency_overrides.clear()
    client = TestClient(app)
    response = client.post("/invoice", json=_sample_payload())
    assert response.status_code == 503
    assert "configurado" in response.json()["detail"].lower()
