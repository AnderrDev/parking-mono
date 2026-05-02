"""
Dependency injection para FastAPI.

Cada `*Dep` es un alias `Annotated[T, Depends(factory)]` para usar como tipo
en parámetros de ruta. La factory de `EmitInvoiceUseCase` carga cert + arma
todos los componentes a partir de Settings.
"""
from functools import lru_cache
from typing import Annotated, Optional

from fastapi import Depends, HTTPException

from app.core.config import Settings, get_settings
from app.core.either import Left
from app.data.datasources.dian_datasource import DianDataSource
from app.data.datasources.dian_datasource_impl import DianDataSourceImpl
from app.data.datasources.dian_datasource_mock import DianDataSourceMock
from app.domain.entities.supplier_entity import SupplierData
from app.domain.usecases.emit_invoice import EmitInvoiceUseCase
from app.infrastructure.crypto.cert_loader import (
    load_p12_from_b64,
    load_p12_from_file,
)
from app.infrastructure.crypto.cufe_calculator import CUFECalculator
from app.infrastructure.crypto.xades_signer import XADESSigner
from app.infrastructure.soap.dian_soap_client import DianSoapClient
from app.infrastructure.xml.ubl_builder import UBLBuilder


SettingsDep = Annotated[Settings, Depends(get_settings)]


def _build_supplier(settings: Settings) -> SupplierData:
    return SupplierData(
        nit=settings.dian_nit_emisor,
        dv=settings.supplier_dv,
        legal_name=settings.supplier_legal_name,
        trade_name=settings.supplier_trade_name,
        address_line=settings.supplier_address_line,
        municipality_code=settings.supplier_municipality_code,
        department_code=settings.supplier_department_code,
        email=settings.supplier_email,
    )


def _build_dian_datasource(settings: Settings) -> DianDataSource:
    if settings.dian_mode == "real":
        client = DianSoapClient(
            endpoint=settings.dian_endpoint,
            nit=settings.dian_nit_emisor,
            clave_tecnica=settings.dian_clave_tecnica,
            timeout_seconds=settings.dian_timeout_seconds,
        )
        return DianDataSourceImpl(client)
    return DianDataSourceMock(scenario="accepted")


def _load_cert_or_fail(settings: Settings):
    """Carga private_key + certificate desde .p12 (file o base64)."""
    if settings.cert_b64:
        return load_p12_from_b64(settings.cert_b64, settings.cert_password)
    if settings.cert_path:
        return load_p12_from_file(settings.cert_path, settings.cert_password)
    return Left(__import__("app.core.failures", fromlist=["CryptoFailure"]).CryptoFailure(
        message="No hay CERT_PATH ni CERT_B64 configurado",
    ))


@lru_cache
def _cached_use_case_or_none() -> Optional[EmitInvoiceUseCase]:
    """
    Cachea el UseCase entre requests. None si la config no permite construirlo
    (ej: cert no encontrado en dev).
    """
    settings = get_settings()
    cert_either = _load_cert_or_fail(settings)
    if isinstance(cert_either, Left):
        return None
    private_key, certificate, _ = cert_either.value

    supplier = _build_supplier(settings)
    return EmitInvoiceUseCase(
        nit_emisor=settings.dian_nit_emisor,
        ubl_builder=UBLBuilder(supplier, settings.profile_execution_id),
        cufe_calculator=CUFECalculator(settings.dian_clave_tecnica),
        xades_signer=XADESSigner(private_key, certificate),
        dian_datasource=_build_dian_datasource(settings),
    )


def get_emit_invoice_use_case() -> EmitInvoiceUseCase:
    use_case = _cached_use_case_or_none()
    if use_case is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Servicio no configurado: faltan CERT_PATH/CERT_B64 o "
                "DIAN_CLAVE_TECNICA en .env"
            ),
        )
    return use_case


EmitInvoiceUseCaseDep = Annotated[
    EmitInvoiceUseCase, Depends(get_emit_invoice_use_case),
]
