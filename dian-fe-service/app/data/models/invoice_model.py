"""
Modelos Pydantic para `POST /invoice`.

Validación en frontera: si llega algo malformado, FastAPI devuelve 422
automáticamente sin entrar al UseCase.
"""
from datetime import datetime
from typing import List, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class InvoiceLineModel(BaseModel):
    description: str = Field(min_length=1, max_length=1000)
    quantity: int = Field(gt=0)
    unit_price_cents: int = Field(ge=0)
    tax_percent: float = Field(default=19.0, ge=0, le=100)


class CustomerModel(BaseModel):
    doc_type: Literal["CC", "NIT", "CE", "PA"]
    doc_number: str = Field(min_length=1, max_length=20)
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    email: str = ""
    phone: str = ""
    municipality: str = ""
    department: str = ""

    @field_validator("doc_number")
    @classmethod
    def doc_number_digits_only(cls, v: str) -> str:
        cleaned = v.replace("-", "").replace(" ", "")
        if not cleaned.isdigit():
            raise ValueError("doc_number debe contener solo dígitos (sin DV ni guiones)")
        return cleaned


class InvoiceEmissionRequest(BaseModel):
    """JSON que la Edge Function envía a `POST /invoice`."""
    internal_number: str = Field(min_length=1, max_length=50)
    invoice_type: Literal["01", "02", "91"] = "01"
    invoice_date: datetime
    customer: CustomerModel
    lines: List[InvoiceLineModel] = Field(min_length=1)
    subtotal_cents: int = Field(ge=0)
    impuestos_cents: int = Field(ge=0)
    total_cents: int = Field(ge=0)
    descuento_cents: int = Field(default=0, ge=0)
    retenciones_cents: int = Field(default=0, ge=0)
    parking_session_ids: List[str] = []


class InvoiceEmissionResponse(BaseModel):
    success: bool
    invoice_number: str
    cufe: str
    dian_status: str  # 'accepted' | 'rejected' | 'contingency'
    dian_messages: List[str] = []
    track_id: str = ""
    issued_at: datetime
