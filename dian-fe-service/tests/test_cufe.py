"""
Tests del CUFE — cubre el spec dian-fe-service/specs/cufe-calculation.spec.md
"""
import hashlib
import string
from datetime import datetime, timezone, timedelta

import pytest

from app.core.either import Left, Right
from app.core.failures import ValidationFailure
from app.domain.entities.invoice_entity import (
    CustomerData,
    InvoiceData,
    InvoiceLine,
)
from app.infrastructure.crypto.cufe_calculator import (
    BOGOTA_TZ,
    CUFECalculator,
    _format_cents,
    _normalize_name,
    _to_bogota,
)


CLAVE_TECNICA_TEST = "A" * 96  # 96 chars hex válido (placeholder)


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _sample_invoice(
    fecha: datetime | None = None,
    subtotal_cents: int = 1500000,  # $15,000.00
    impuestos_cents: int = 285000,   # $2,850.00 (19% de 15k)
    total_cents: int = 1785000,      # $17,850.00
) -> InvoiceData:
    customer = CustomerData(
        doc_type="CC",
        doc_number="123456789",
        first_name="Juan",
        last_name="Perez",
    )
    return InvoiceData(
        nit_emisor="890123456",
        tipo_documento="01",
        numero_factura="1",  # Será paddeado a "0000000001"
        fecha_expedicion=fecha or datetime(2026, 4, 28, 14, 35, 30),
        customer=customer,
        lines=[
            InvoiceLine(
                description="Parqueadero 2h 30m",
                quantity=1,
                unit_price_cents=1500000,
                tax_percent=19.0,
            )
        ],
        subtotal_cents=subtotal_cents,
        descuento_cents=0,
        impuestos_cents=impuestos_cents,
        retenciones_cents=0,
        total_cents=total_cents,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def test_format_cents_round_pesos():
    assert _format_cents(1500000) == "15000.00"
    assert _format_cents(0) == "0.00"
    assert _format_cents(99) == "0.99"
    assert _format_cents(100) == "1.00"


def test_format_cents_handles_large_amounts():
    # 100 millones de pesos = 10,000,000,000 cents
    assert _format_cents(10_000_000_000) == "100000000.00"


def test_normalize_name_uppercase_and_trim():
    assert _normalize_name("Juan") == "JUAN"
    assert _normalize_name("  Pérez  ") == "PÉREZ"


def test_to_bogota_naive_passthrough():
    dt = datetime(2026, 4, 28, 14, 35, 30)
    assert _to_bogota(dt) == dt


def test_to_bogota_converts_utc():
    # 19:35 UTC == 14:35 Bogotá (UTC-5)
    dt_utc = datetime(2026, 4, 28, 19, 35, 30, tzinfo=timezone.utc)
    bogota = _to_bogota(dt_utc)
    assert bogota.hour == 14
    assert bogota.minute == 35


# ── Calculadora ───────────────────────────────────────────────────────────────

def test_cufe_calculate_returns_right():
    calc = CUFECalculator(CLAVE_TECNICA_TEST)
    result = calc.calculate(_sample_invoice())
    assert isinstance(result, Right)


def test_cufe_format_is_96_hex_chars():
    calc = CUFECalculator(CLAVE_TECNICA_TEST)
    result = calc.calculate(_sample_invoice())
    assert isinstance(result, Right)
    cufe = result.value
    assert len(cufe) == 96
    assert all(c in string.hexdigits.upper() for c in cufe)


def test_cufe_is_reproducible():
    calc = CUFECalculator(CLAVE_TECNICA_TEST)
    invoice = _sample_invoice()
    cufe_1 = calc.calculate(invoice).value
    cufe_2 = calc.calculate(invoice).value
    assert cufe_1 == cufe_2


def test_cufe_changes_when_amount_changes():
    calc = CUFECalculator(CLAVE_TECNICA_TEST)
    cufe_a = calc.calculate(_sample_invoice(subtotal_cents=1500000)).value
    cufe_b = calc.calculate(_sample_invoice(subtotal_cents=1500001)).value
    assert cufe_a != cufe_b


def test_cufe_changes_when_clave_tecnica_changes():
    invoice = _sample_invoice()
    cufe_a = CUFECalculator("A" * 96).calculate(invoice).value
    cufe_b = CUFECalculator("B" * 96).calculate(invoice).value
    assert cufe_a != cufe_b


def test_cufe_fails_when_clave_tecnica_empty():
    calc = CUFECalculator("")
    result = calc.calculate(_sample_invoice())
    assert isinstance(result, Left)
    assert isinstance(result.value, ValidationFailure)
    assert "clave_tecnica" in result.value.fields


def test_cufe_input_string_format():
    """Verifica el orden y separadores exactos del spec."""
    calc = CUFECalculator(CLAVE_TECNICA_TEST)
    input_str = calc.build_input_string(_sample_invoice())
    parts = input_str.split("|")
    assert len(parts) == 14
    assert parts[0] == "890123456"           # NIT emisor
    assert parts[1] == "01"                  # Tipo doc
    assert parts[2] == "0000000001"          # Número paddeado
    assert parts[3] == "20260428"            # Fecha YYYYMMDD
    assert parts[4] == "143530"              # Hora HHMMSS
    assert parts[5] == "15000.00"            # Subtotal
    assert parts[6] == "0.00"                # Descuento
    assert parts[7] == "2850.00"             # Impuestos
    assert parts[8] == "0.00"                # Retenciones
    assert parts[9] == "17850.00"            # Total
    assert parts[10] == "0123456789"         # Doc cliente paddeado
    assert parts[11] == "PEREZ"              # Apellido MAYÚS
    assert parts[12] == "JUAN"               # Nombre MAYÚS
    assert parts[13] == CLAVE_TECNICA_TEST   # Clave técnica


def test_cufe_matches_manual_sha384():
    """Verifica que el hash sea efectivamente SHA-384 del input string."""
    calc = CUFECalculator(CLAVE_TECNICA_TEST)
    invoice = _sample_invoice()
    input_str = calc.build_input_string(invoice)
    expected = hashlib.sha384(input_str.encode("utf-8")).hexdigest().upper()

    cufe = calc.calculate(invoice).value
    assert cufe == expected


def test_cufe_uses_bogota_time_when_input_is_utc():
    """Si la fecha viene en UTC, se debe convertir a UTC-5 antes del hash."""
    calc = CUFECalculator(CLAVE_TECNICA_TEST)

    # Misma hora, una en UTC y la otra en Bogotá (naive)
    dt_utc = datetime(2026, 4, 28, 19, 35, 30, tzinfo=timezone.utc)
    dt_bogota_naive = datetime(2026, 4, 28, 14, 35, 30)

    cufe_utc = calc.calculate(_sample_invoice(fecha=dt_utc)).value
    cufe_bogota = calc.calculate(_sample_invoice(fecha=dt_bogota_naive)).value
    assert cufe_utc == cufe_bogota


def test_cufe_changes_with_different_dates():
    calc = CUFECalculator(CLAVE_TECNICA_TEST)
    cufe_a = calc.calculate(_sample_invoice(fecha=datetime(2026, 4, 28, 14, 0, 0))).value
    cufe_b = calc.calculate(_sample_invoice(fecha=datetime(2026, 4, 29, 14, 0, 0))).value
    assert cufe_a != cufe_b
