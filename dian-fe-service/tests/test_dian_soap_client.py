"""
Tests del cliente SOAP DIAN — usa httpx.MockTransport para evitar llamadas reales.
"""
import base64
import io
import zipfile

import httpx
import pytest
from lxml import etree

from app.core.either import Left, Right
from app.core.failures import DianFailure, NetworkFailure
from app.domain.entities.dian_response_entity import DianResponse
from app.infrastructure.soap.constants import (
    NS_SOAP,
    NS_WCF,
    NS_WSSE,
)
from app.infrastructure.soap.dian_soap_client import DianSoapClient


SAMPLE_SIGNED_XML = """<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">FE-1</cbc:ID></Invoice>"""


def _build_dian_response_xml(
    status_code: str = "00",
    status_description: str = "Procesado Correctamente",
    track_id: str = "abcd1234",
    signature: str = "C" * 96,
) -> bytes:
    """Construye una respuesta SOAP plausible de DIAN."""
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<s:Envelope xmlns:s="{NS_SOAP}">\n'
        f'  <s:Body>\n'
        f'    <SendBillSyncResponse xmlns="{NS_WCF}">\n'
        f'      <SendBillSyncResult>\n'
        f'        <StatusCode>200</StatusCode>\n'
        f'        <Status>OK</Status>\n'
        f'        <StatusDescription>{status_description}</StatusDescription>\n'
        f'        <TrackId>{track_id}</TrackId>\n'
        f'        <Signature>{signature}</Signature>\n'
        f'      </SendBillSyncResult>\n'
        f'    </SendBillSyncResponse>\n'
        f'  </s:Body>\n'
        f'</s:Envelope>'
    ).encode("utf-8")


def _build_dian_rejection_xml() -> bytes:
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<s:Envelope xmlns:s="{NS_SOAP}">\n'
        f'  <s:Body>\n'
        f'    <SendBillSyncResponse xmlns="{NS_WCF}">\n'
        f'      <SendBillSyncResult>\n'
        f'        <StatusCode>400</StatusCode>\n'
        f'        <Status>REJECTION</Status>\n'
        f'        <ErrorMessage>\n'
        f'          <LineNumber>1</LineNumber>\n'
        f'          <ErrorCode>FAB23</ErrorCode>\n'
        f'          <ErrorMessage>NIT del adquiriente no válido</ErrorMessage>\n'
        f'        </ErrorMessage>\n'
        f'      </SendBillSyncResult>\n'
        f'    </SendBillSyncResponse>\n'
        f'  </s:Body>\n'
        f'</s:Envelope>'
    ).encode("utf-8")


# ── Happy path ────────────────────────────────────────────────────────────────

def test_send_bill_sync_success():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = request.content
        captured["headers"] = dict(request.headers)
        return httpx.Response(200, content=_build_dian_response_xml())

    transport = httpx.MockTransport(handler)
    http_client = httpx.Client(transport=transport)

    client = DianSoapClient(
        endpoint="https://vpruebas.dian.gov.co/WcfDianCustomerService.svc",
        nit="890123456",
        clave_tecnica="A" * 96,
        http_client=http_client,
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")

    assert isinstance(result, Right)
    response = result.value
    assert response.is_accepted
    assert response.track_id == "abcd1234"
    assert response.signature == "C" * 96


def test_envelope_includes_wsse_credentials():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.content
        return httpx.Response(200, content=_build_dian_response_xml())

    transport = httpx.MockTransport(handler)
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="SECRET" + "X" * 90,
        http_client=httpx.Client(transport=transport),
    )
    client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")

    body = etree.fromstring(captured["body"])
    user = body.find(
        f".//{{{NS_WSSE}}}UsernameToken/{{{NS_WSSE}}}Username"
    )
    pwd = body.find(
        f".//{{{NS_WSSE}}}UsernameToken/{{{NS_WSSE}}}Password"
    )
    assert user is not None and user.text == "890123456"
    assert pwd is not None
    assert pwd.text.startswith("SECRET")


def test_envelope_zips_xml_in_base64_content_file():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.content
        return httpx.Response(200, content=_build_dian_response_xml())

    transport = httpx.MockTransport(handler)
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="A" * 96,
        http_client=httpx.Client(transport=transport),
    )
    client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")

    body = etree.fromstring(captured["body"])
    content_node = body.find(f".//{{{NS_WCF}}}contentFile")
    file_name_node = body.find(f".//{{{NS_WCF}}}fileName")
    assert content_node is not None
    assert file_name_node is not None
    assert file_name_node.text == "890123456_FE-1.zip"

    # El contenido debe ser un ZIP base64 que contenga el XML original.
    zip_bytes = base64.b64decode(content_node.text)
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        assert "890123456_FE-1.xml" in names
        assert zf.read(names[0]).decode("utf-8") == SAMPLE_SIGNED_XML


def test_soap_action_header_set():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("SOAPAction", "").endswith("SendBillSync")
        assert "soap+xml" in request.headers.get("Content-Type", "")
        return httpx.Response(200, content=_build_dian_response_xml())

    transport = httpx.MockTransport(handler)
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="A" * 96,
        http_client=httpx.Client(transport=transport),
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")
    assert isinstance(result, Right)


# ── Errores y casos negativos ─────────────────────────────────────────────────

def test_dian_rejection_parsed():
    transport = httpx.MockTransport(
        lambda req: httpx.Response(200, content=_build_dian_rejection_xml())
    )
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="A" * 96,
        http_client=httpx.Client(transport=transport),
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")
    # Es un Right con DianResponse.is_rejected (es respuesta válida, factura rechazada)
    assert isinstance(result, Right)
    assert result.value.is_rejected
    assert len(result.value.errors) >= 1
    assert "NIT" in result.value.errors[0].message


def test_http_401_returns_dian_failure():
    transport = httpx.MockTransport(
        lambda req: httpx.Response(401, content=b"")
    )
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="A" * 96,
        http_client=httpx.Client(transport=transport),
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")
    assert isinstance(result, Left)
    assert isinstance(result.value, DianFailure)
    assert result.value.status == "rejected"


def test_http_503_returns_contingency():
    transport = httpx.MockTransport(
        lambda req: httpx.Response(503, content=b"")
    )
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="A" * 96,
        http_client=httpx.Client(transport=transport),
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")
    assert isinstance(result, Left)
    assert isinstance(result.value, DianFailure)
    assert result.value.status == "contingency"


def test_http_500_returns_contingency():
    transport = httpx.MockTransport(
        lambda req: httpx.Response(500, content=b"")
    )
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="A" * 96,
        http_client=httpx.Client(transport=transport),
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")
    assert isinstance(result, Left)
    assert result.value.status == "contingency"


def test_timeout_returns_contingency():
    def raise_timeout(req):
        raise httpx.TimeoutException("simulado")

    transport = httpx.MockTransport(raise_timeout)
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="A" * 96,
        http_client=httpx.Client(transport=transport),
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")
    assert isinstance(result, Left)
    assert isinstance(result.value, DianFailure)
    assert result.value.status == "contingency"


def test_network_error_returns_network_failure():
    def raise_network(req):
        raise httpx.ConnectError("conexión rechazada")

    transport = httpx.MockTransport(raise_network)
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="A" * 96,
        http_client=httpx.Client(transport=transport),
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")
    assert isinstance(result, Left)
    assert isinstance(result.value, NetworkFailure)


def test_empty_clave_tecnica_short_circuits():
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="",
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")
    assert isinstance(result, Left)
    assert "vacía" in result.value.message.lower()


def test_unparseable_response_returns_failure():
    transport = httpx.MockTransport(
        lambda req: httpx.Response(200, content=b"<not-xml-but-200")
    )
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="A" * 96,
        http_client=httpx.Client(transport=transport),
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")
    assert isinstance(result, Left)


def test_response_without_result_node_returns_failure():
    transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            content=f'<?xml version="1.0"?><s:Envelope xmlns:s="{NS_SOAP}"><s:Body/></s:Envelope>'.encode(),
        )
    )
    client = DianSoapClient(
        endpoint="https://x", nit="890123456", clave_tecnica="A" * 96,
        http_client=httpx.Client(transport=transport),
    )
    result = client.send_bill_sync(SAMPLE_SIGNED_XML, "FE-1")
    assert isinstance(result, Left)
    assert "SendBillSyncResult" in result.value.message
