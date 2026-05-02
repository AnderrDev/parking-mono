"""Rutas de emisión de facturas electrónicas."""
from fastapi import APIRouter, HTTPException

from app.core.di import EmitInvoiceUseCaseDep
from app.core.either import Left
from app.core.failures import (
    CryptoFailure,
    DianFailure,
    NetworkFailure,
    ValidationFailure,
    XmlFailure,
)
from app.data.models.invoice_model import (
    InvoiceEmissionRequest,
    InvoiceEmissionResponse,
)


router = APIRouter(tags=["invoice"])


def _failure_to_http(failure) -> HTTPException:
    if isinstance(failure, ValidationFailure):
        return HTTPException(status_code=400, detail={
            "error": "validation",
            "message": failure.message,
            "fields": failure.fields,
        })
    if isinstance(failure, XmlFailure):
        return HTTPException(status_code=500, detail={
            "error": "xml", "message": failure.message,
        })
    if isinstance(failure, CryptoFailure):
        return HTTPException(status_code=500, detail={
            "error": "crypto", "message": failure.message,
        })
    if isinstance(failure, DianFailure):
        # contingency → 503, otros → 502
        code = 503 if failure.status == "contingency" else 502
        return HTTPException(status_code=code, detail={
            "error": "dian",
            "status": failure.status,
            "message": failure.message,
            "dian_messages": failure.dian_messages,
        })
    if isinstance(failure, NetworkFailure):
        return HTTPException(status_code=502, detail={
            "error": "network", "message": failure.message,
        })
    return HTTPException(status_code=500, detail={
        "error": "internal", "message": getattr(failure, "message", "unknown"),
    })


@router.post("/invoice", response_model=InvoiceEmissionResponse)
def emit_invoice(
    request: InvoiceEmissionRequest,
    use_case: EmitInvoiceUseCaseDep,
) -> InvoiceEmissionResponse:
    result = use_case.execute(request)

    if isinstance(result, Left):
        raise _failure_to_http(result.value)

    success = result.value
    return InvoiceEmissionResponse(
        success=(success.dian_status == "accepted"),
        invoice_number=success.invoice_number,
        cufe=success.cufe,
        dian_status=success.dian_status,
        dian_messages=success.dian_messages,
        track_id=success.track_id,
        issued_at=success.issued_at,
    )
