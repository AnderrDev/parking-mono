"""Implementación real — delega en `DianSoapClient`."""
from app.core.either import Either
from app.core.failures import DianFailure
from app.data.datasources.dian_datasource import DianDataSource
from app.domain.entities.dian_response_entity import DianResponse
from app.infrastructure.soap.dian_soap_client import DianSoapClient


class DianDataSourceImpl(DianDataSource):
    def __init__(self, soap_client: DianSoapClient):
        self._soap_client = soap_client

    def send_bill(
        self, signed_xml: str, invoice_id: str,
    ) -> Either[DianFailure, DianResponse]:
        return self._soap_client.send_bill_sync(signed_xml, invoice_id)
