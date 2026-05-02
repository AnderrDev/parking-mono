"""
Cálculo del CUFE (Código Único de Factura Electrónica) según Anexo Técnico 1.9 DIAN.

Spec: dian-fe-service/specs/cufe-calculation.spec.md

Algoritmo: SHA-384 sobre 14 campos separados por '|', resultado en HEX MAYÚSCULAS.
"""
import hashlib
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from app.core.either import Either, Left, Right
from app.core.failures import ValidationFailure
from app.domain.entities.invoice_entity import InvoiceData


# Hora oficial Colombia: UTC-5 (sin DST)
BOGOTA_TZ = timezone(timedelta(hours=-5))


def _to_bogota(dt: datetime) -> datetime:
    """
    Si el datetime es tz-aware, convertir a UTC-5.
    Si es naive, asumir que ya está en hora Colombia.
    """
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(BOGOTA_TZ)


def _format_cents(cents: int) -> str:
    """
    Convierte centavos (int) a string decimal con 2 decimales.
    Usa Decimal para evitar errores de precisión float.

    Ejemplo: 1500000 → "15000.00"
    """
    pesos = Decimal(cents) / Decimal(100)
    # quantize a 2 decimales con redondeo HALF_UP estándar
    return f"{pesos:.2f}"


def _normalize_name(name: str) -> str:
    """MAYÚSCULAS, trim. Mantiene tildes (DIAN acepta UTF-8)."""
    return name.upper().strip()


class CUFECalculator:
    """
    Calcula el CUFE para una factura electrónica.

    Uso:
        calc = CUFECalculator(clave_tecnica_dian="...")
        cufe = calc.calculate(invoice_data)
    """

    CLAVE_TECNICA_LENGTH = 96
    CUFE_LENGTH = 96  # SHA-384 en hex = 96 chars

    def __init__(self, clave_tecnica: str):
        self.clave_tecnica = clave_tecnica

    def calculate(self, invoice: InvoiceData) -> Either[ValidationFailure, str]:
        """
        Retorna Right(cufe_hex_upper) si los 14 campos son válidos.
        Retorna Left(ValidationFailure) si la clave técnica está vacía o mal formada.
        """
        if not self.clave_tecnica:
            return Left(ValidationFailure(
                message="Clave técnica DIAN vacía. Configurar DIAN_CLAVE_TECNICA en .env",
                fields=["clave_tecnica"],
            ))

        fecha_bogota = _to_bogota(invoice.fecha_expedicion)

        # Los 14 campos en orden exacto del spec
        campo1 = invoice.nit_emisor
        campo2 = invoice.tipo_documento
        campo3 = invoice.numero_factura.zfill(10)
        campo4 = fecha_bogota.strftime("%Y%m%d")
        campo5 = fecha_bogota.strftime("%H%M%S")
        campo6 = _format_cents(invoice.subtotal_cents)
        campo7 = _format_cents(invoice.descuento_cents)
        campo8 = _format_cents(invoice.impuestos_cents)
        campo9 = _format_cents(invoice.retenciones_cents)
        campo10 = _format_cents(invoice.total_cents)
        campo11 = invoice.customer.doc_number.zfill(10)
        campo12 = _normalize_name(invoice.customer.last_name)
        campo13 = _normalize_name(invoice.customer.first_name)
        campo14 = self.clave_tecnica

        input_string = (
            f"{campo1}|{campo2}|{campo3}|{campo4}|{campo5}|"
            f"{campo6}|{campo7}|{campo8}|{campo9}|{campo10}|"
            f"{campo11}|{campo12}|{campo13}|{campo14}"
        )

        cufe = hashlib.sha384(input_string.encode("utf-8")).hexdigest().upper()
        return Right(cufe)

    def build_input_string(self, invoice: InvoiceData) -> str:
        """
        Helper para debug: retorna el string concatenado antes del hash.
        NO loguear en producción (incluye la clave técnica).
        """
        fecha_bogota = _to_bogota(invoice.fecha_expedicion)
        return (
            f"{invoice.nit_emisor}|{invoice.tipo_documento}|"
            f"{invoice.numero_factura.zfill(10)}|"
            f"{fecha_bogota.strftime('%Y%m%d')}|{fecha_bogota.strftime('%H%M%S')}|"
            f"{_format_cents(invoice.subtotal_cents)}|"
            f"{_format_cents(invoice.descuento_cents)}|"
            f"{_format_cents(invoice.impuestos_cents)}|"
            f"{_format_cents(invoice.retenciones_cents)}|"
            f"{_format_cents(invoice.total_cents)}|"
            f"{invoice.customer.doc_number.zfill(10)}|"
            f"{_normalize_name(invoice.customer.last_name)}|"
            f"{_normalize_name(invoice.customer.first_name)}|"
            f"{self.clave_tecnica}"
        )
