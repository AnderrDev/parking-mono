"""
Cliente SOAP del WS de DIAN para SendBillSync.

Spec: dian-fe-service/specs/dian-soap-integration.spec.md

Implementación manual con httpx + lxml (sin `zeep` con WSDL) para:
 - Tests determinísticos con `httpx.MockTransport` sin pegarle a DIAN.
 - Control total sobre el header WS-Security.
 - Sin depender de la disponibilidad del WSDL de DIAN al arrancar.
"""
import base64
import io
import zipfile
from typing import Optional

import httpx
from lxml import etree

from app.core.either import Either, Left, Right
from app.core.failures import DianFailure, NetworkFailure
from app.domain.entities.dian_response_entity import (
    DianResponse,
    DianValidationError,
)
from app.infrastructure.soap.constants import (
    NS_SOAP,
    NS_WCF,
    NS_WSSE,
    PASSWORD_TYPE_TEXT,
    SOAP_ACTION_SEND_BILL,
)


def _zip_xml(xml_str: str, inner_filename: str) -> bytes:
    """
    Empaqueta el XML firmado en un ZIP DEFLATED.
    DIAN espera un ZIP con el XML adentro, no el XML pelado.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(inner_filename, xml_str)
    return buf.getvalue()


def _build_envelope(
    nit: str, clave_tecnica: str, content_b64: str, file_name: str,
) -> bytes:
    """Construye el SOAP envelope con WS-Security UsernameToken (PasswordText)."""
    nsmap = {
        "soap": NS_SOAP,
        "wsse": NS_WSSE,
        "wcf": NS_WCF,
    }
    envelope = etree.Element(f"{{{NS_SOAP}}}Envelope", nsmap=nsmap)

    # Header — WS-Security
    header = etree.SubElement(envelope, f"{{{NS_SOAP}}}Header")
    security = etree.SubElement(header, f"{{{NS_WSSE}}}Security")
    security.set(f"{{{NS_SOAP}}}mustUnderstand", "1")
    token = etree.SubElement(security, f"{{{NS_WSSE}}}UsernameToken")
    user = etree.SubElement(token, f"{{{NS_WSSE}}}Username")
    user.text = nit
    pwd = etree.SubElement(
        token, f"{{{NS_WSSE}}}Password", attrib={"Type": PASSWORD_TYPE_TEXT},
    )
    pwd.text = clave_tecnica

    # Body — SendBillSync
    body = etree.SubElement(envelope, f"{{{NS_SOAP}}}Body")
    send_bill = etree.SubElement(body, f"{{{NS_WCF}}}SendBillSync")
    content = etree.SubElement(send_bill, f"{{{NS_WCF}}}contentFile")
    content.text = content_b64
    fn = etree.SubElement(send_bill, f"{{{NS_WCF}}}fileName")
    fn.text = file_name

    return etree.tostring(
        envelope, xml_declaration=True, encoding="UTF-8", standalone=False,
    )


def _parse_response(soap_xml: bytes) -> Either[DianFailure, DianResponse]:
    """
    Parsea el `<SendBillSyncResult>` de la respuesta DIAN.
    Funciona aún con namespaces variantes (algunas instancias usan distintos).
    """
    try:
        root = etree.fromstring(soap_xml)
    except etree.XMLSyntaxError as exc:
        return Left(DianFailure(
            message=f"Respuesta DIAN no es XML válido: {exc}",
            status="rejected",
        ))

    # Buscar el resultado sin asumir prefijo: por local-name.
    result_node = root.find(".//{*}SendBillSyncResult")
    if result_node is None:
        return Left(DianFailure(
            message="Respuesta DIAN sin <SendBillSyncResult>",
            status="rejected",
            dian_messages=[soap_xml.decode("utf-8", errors="replace")[:500]],
        ))

    def _text(local: str) -> str:
        node = result_node.find(f"{{*}}{local}")
        return node.text.strip() if (node is not None and node.text) else ""

    status_code_str = _text("StatusCode") or "0"
    try:
        status_code = int(status_code_str)
    except ValueError:
        status_code = 0

    errors: list[DianValidationError] = []
    for err_node in result_node.findall(".//{*}ErrorMessage/{*}string"):
        if err_node.text:
            errors.append(DianValidationError(message=err_node.text.strip()))
    # Algunas variantes anidan los errores con campos individuales:
    for err_node in result_node.findall("{*}ErrorMessage"):
        line = err_node.findtext("{*}LineNumber") or ""
        code = err_node.findtext("{*}ErrorCode") or ""
        msg = err_node.findtext("{*}ErrorMessage") or ""
        if msg:
            errors.append(DianValidationError(
                line_number=line, error_code=code, message=msg,
            ))

    return Right(DianResponse(
        status_code=status_code,
        status=_text("Status") or _text("StatusDescription"),
        track_id=_text("TrackId") or _text("XmlDocumentKey"),
        signature=_text("Signature") or _text("XmlDocumentKey"),
        xml_base64=_text("XmlBase64Bytes"),
        pdf_base64=_text("PdfBase64Bytes"),
        errors=errors,
        raw_response=soap_xml.decode("utf-8", errors="replace"),
    ))


class DianSoapClient:
    """
    Cliente SOAP sync para los WS de DIAN.

    Inyecta `http_client` para tests (ej: `httpx.Client(transport=MockTransport(...))`).
    """

    def __init__(
        self,
        endpoint: str,
        nit: str,
        clave_tecnica: str,
        timeout_seconds: int = 30,
        http_client: Optional[httpx.Client] = None,
    ):
        self.endpoint = endpoint
        self.nit = nit
        self.clave_tecnica = clave_tecnica
        self.timeout_seconds = timeout_seconds
        self._http_client = http_client
        self._owns_client = http_client is None

    def __enter__(self):
        if self._owns_client and self._http_client is None:
            self._http_client = httpx.Client(timeout=self.timeout_seconds)
        return self

    def __exit__(self, *args):
        if self._owns_client and self._http_client is not None:
            self._http_client.close()
            self._http_client = None

    def _client(self) -> httpx.Client:
        if self._http_client is None:
            self._http_client = httpx.Client(timeout=self.timeout_seconds)
        return self._http_client

    def send_bill_sync(
        self, signed_xml: str, invoice_id: str,
    ) -> Either[DianFailure, DianResponse]:
        """
        Envía la factura firmada a DIAN.
        `invoice_id`: identificador para nombrar el ZIP (ej: "FE-1001").
        """
        if not self.clave_tecnica:
            return Left(DianFailure(
                message="DIAN_CLAVE_TECNICA vacía. No se puede autenticar.",
                status="rejected",
            ))

        zip_filename = f"{self.nit}_{invoice_id}.zip"
        xml_filename = f"{self.nit}_{invoice_id}.xml"

        try:
            zip_bytes = _zip_xml(signed_xml, xml_filename)
        except Exception as exc:
            return Left(DianFailure(
                message=f"Error empaquetando XML: {exc}", status="rejected",
            ))

        content_b64 = base64.b64encode(zip_bytes).decode("ascii")
        envelope = _build_envelope(
            self.nit, self.clave_tecnica, content_b64, zip_filename,
        )

        headers = {
            "Content-Type": "application/soap+xml; charset=utf-8",
            "SOAPAction": SOAP_ACTION_SEND_BILL,
        }

        try:
            response = self._client().post(
                self.endpoint, content=envelope, headers=headers,
            )
        except httpx.TimeoutException:
            return Left(DianFailure(
                message="Timeout esperando respuesta DIAN",
                status="contingency",
            ))
        except httpx.HTTPError as exc:
            return Left(NetworkFailure(message=f"Error de red contra DIAN: {exc}"))

        if response.status_code == 401:
            return Left(DianFailure(
                message="Credenciales DIAN inválidas (HTTP 401)",
                status="rejected",
            ))
        if response.status_code == 503:
            return Left(DianFailure(
                message="DIAN no disponible (HTTP 503)",
                status="contingency",
            ))
        if response.status_code >= 500:
            return Left(DianFailure(
                message=f"Error en DIAN (HTTP {response.status_code})",
                status="contingency",
            ))

        return _parse_response(response.content)
