from dataclasses import dataclass, field
from datetime import datetime
from typing import List


@dataclass(frozen=True)
class InvoiceLine:
    """Línea individual de la factura."""
    description: str
    quantity: int
    unit_price_cents: int
    tax_percent: float = 19.0  # IVA por defecto

    @property
    def subtotal_cents(self) -> int:
        return self.quantity * self.unit_price_cents

    @property
    def tax_cents(self) -> int:
        return round(self.subtotal_cents * self.tax_percent / 100)

    @property
    def total_cents(self) -> int:
        return self.subtotal_cents + self.tax_cents


@dataclass(frozen=True)
class CustomerData:
    """Datos del cliente / adquiriente."""
    doc_type: str  # 'CC', 'NIT', 'CE', 'PA'
    doc_number: str  # sin guiones, sin DV
    first_name: str
    last_name: str
    email: str = ""
    phone: str = ""
    municipality: str = ""
    department: str = ""
    fiscal_responsibilities: List[str] = field(default_factory=lambda: ["05"])


@dataclass(frozen=True)
class InvoiceData:
    """
    Datos completos de una factura — fuente de verdad para CUFE, UBL XML y firma.

    Montos en centavos (smallest unit COP). Conversión a decimales para CUFE/UBL
    se hace en el calculador/builder, no aquí.
    """
    # Emisor
    nit_emisor: str  # Sin DV, sin guiones (ej: "890123456")

    # Identificación de la factura
    tipo_documento: str  # '01' factura, '02' nota crédito, '91' nota débito
    numero_factura: str  # Ya asignado por el Edge Function (ej: "0000000001")
    fecha_expedicion: datetime  # En hora Colombia (UTC-5) o tz-aware

    # Cliente
    customer: CustomerData

    # Líneas y totales (en centavos COP)
    lines: List[InvoiceLine]
    subtotal_cents: int
    descuento_cents: int = 0
    impuestos_cents: int = 0
    retenciones_cents: int = 0
    total_cents: int = 0

    # Referencia interna (no va en CUFE)
    internal_number: str = ""
    parking_session_ids: List[str] = field(default_factory=list)
