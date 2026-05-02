"""
Tests del XAdES Signer — usa cert autofirmado generado en conftest.

Verifica:
 - Estructura DIAN: 3 references (doc, SignedProperties, KeyInfo).
 - Firma criptográficamente válida (verificable con la pública del cert).
 - SignedProperties con SigningTime, SigningCertificate, SignaturePolicyIdentifier.
 - El cert va en X509Certificate (base64).
"""
import base64
from datetime import datetime, timezone

import pytest
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from lxml import etree

from app.core.either import Left, Right
from app.core.failures import CryptoFailure
from app.domain.entities.invoice_entity import (
    CustomerData,
    InvoiceData,
    InvoiceLine,
)
from app.domain.entities.supplier_entity import SupplierData
from app.infrastructure.crypto.xades_signer import (
    DIAN_POLICY_V2_HASH_B64,
    DIAN_POLICY_V2_URL,
    NS as XADES_NS,
    XADESSigner,
    _c14n,
)
from app.infrastructure.xml.ubl_builder import (
    NS as UBL_NS,
    UBLBuilder,
)


CUFE_SAMPLE = "B" * 96


def _supplier() -> SupplierData:
    return SupplierData(
        nit="890123456",
        dv="7",
        legal_name="Parqueadero Test S.A.S.",
    )


def _invoice() -> InvoiceData:
    return InvoiceData(
        nit_emisor="890123456",
        tipo_documento="01",
        numero_factura="FE-1",
        fecha_expedicion=datetime(2026, 4, 28, 14, 35, 30),
        customer=CustomerData(
            doc_type="CC",
            doc_number="123456789",
            first_name="Juan",
            last_name="Perez",
        ),
        lines=[
            InvoiceLine(
                description="Parqueadero",
                quantity=1,
                unit_price_cents=1500000,
                tax_percent=19.0,
            ),
        ],
        subtotal_cents=1500000,
        impuestos_cents=285000,
        total_cents=1785000,
    )


@pytest.fixture
def unsigned_xml():
    builder = UBLBuilder(_supplier())
    return builder.build(_invoice(), CUFE_SAMPLE).value


@pytest.fixture
def signer(self_signed_cert):
    private_key, cert = self_signed_cert
    return XADESSigner(private_key, cert)


# ── Happy path ────────────────────────────────────────────────────────────────

def test_sign_returns_right(signer, unsigned_xml):
    result = signer.sign(unsigned_xml)
    assert isinstance(result, Right)


def test_signed_xml_is_parseable(signer, unsigned_xml):
    signed = signer.sign(unsigned_xml).value
    root = etree.fromstring(signed.encode("utf-8"))
    assert root is not None


def test_signature_inserted_in_second_extension(signer, unsigned_xml):
    signed = signer.sign(unsigned_xml).value
    root = etree.fromstring(signed.encode("utf-8"))
    extensions = root.findall(
        f"{{{UBL_NS['ext']}}}UBLExtensions/{{{UBL_NS['ext']}}}UBLExtension"
    )
    # La 1ª extensión sigue vacía (placeholder DIAN).
    sig_in_first = extensions[0].find(
        f"{{{UBL_NS['ext']}}}ExtensionContent/{{{XADES_NS['ds']}}}Signature"
    )
    assert sig_in_first is None
    # La 2ª contiene la firma.
    sig_in_second = extensions[1].find(
        f"{{{UBL_NS['ext']}}}ExtensionContent/{{{XADES_NS['ds']}}}Signature"
    )
    assert sig_in_second is not None


def test_signature_has_three_references(signer, unsigned_xml):
    signed = signer.sign(unsigned_xml).value
    root = etree.fromstring(signed.encode("utf-8"))
    refs = root.findall(
        f".//{{{XADES_NS['ds']}}}SignedInfo/{{{XADES_NS['ds']}}}Reference"
    )
    assert len(refs) == 3
    # Reference 1: documento (URI vacío)
    assert refs[0].get("URI") == ""
    # Reference 2: SignedProperties
    assert refs[1].get("Type") == "http://uri.etsi.org/01903#SignedProperties"
    # Reference 3: KeyInfo
    assert refs[2].get("URI", "").startswith("#xmldsig-")


def test_all_references_have_digest(signer, unsigned_xml):
    signed = signer.sign(unsigned_xml).value
    root = etree.fromstring(signed.encode("utf-8"))
    digests = root.findall(
        f".//{{{XADES_NS['ds']}}}SignedInfo/{{{XADES_NS['ds']}}}Reference"
        f"/{{{XADES_NS['ds']}}}DigestValue"
    )
    assert len(digests) == 3
    for d in digests:
        assert d.text  # no vacío
        # Base64 válido
        decoded = base64.b64decode(d.text)
        assert len(decoded) == 32  # SHA-256 = 32 bytes


def test_signature_value_is_base64(signer, unsigned_xml):
    signed = signer.sign(unsigned_xml).value
    root = etree.fromstring(signed.encode("utf-8"))
    sigval = root.find(f".//{{{XADES_NS['ds']}}}SignatureValue")
    assert sigval is not None
    raw = base64.b64decode(sigval.text)
    # RSA-2048 → firma de 256 bytes
    assert len(raw) == 256


def test_certificate_in_x509data(signer, unsigned_xml, self_signed_cert):
    signed = signer.sign(unsigned_xml).value
    root = etree.fromstring(signed.encode("utf-8"))
    cert_elem = root.find(
        f".//{{{XADES_NS['ds']}}}KeyInfo/{{{XADES_NS['ds']}}}X509Data"
        f"/{{{XADES_NS['ds']}}}X509Certificate"
    )
    assert cert_elem is not None
    # El cert debe corresponder al de la fixture
    from cryptography.hazmat.primitives import serialization
    expected_b64 = base64.b64encode(
        self_signed_cert[1].public_bytes(serialization.Encoding.DER),
    ).decode("ascii")
    assert cert_elem.text == expected_b64


def test_signed_properties_has_signing_time(signer, unsigned_xml):
    signed = signer.sign(unsigned_xml).value
    root = etree.fromstring(signed.encode("utf-8"))
    st = root.find(f".//{{{XADES_NS['xades']}}}SigningTime")
    assert st is not None
    # Formato ISO con sufijo Z (UTC)
    assert st.text.endswith("Z")
    # Parseable como datetime
    datetime.strptime(st.text, "%Y-%m-%dT%H:%M:%SZ")


def test_signing_time_can_be_overridden(signer, unsigned_xml):
    fixed = datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
    signed = signer.sign(unsigned_xml, signing_time=fixed).value
    root = etree.fromstring(signed.encode("utf-8"))
    st = root.find(f".//{{{XADES_NS['xades']}}}SigningTime")
    assert st.text == "2026-01-15T10:00:00Z"


def test_signed_properties_has_signing_certificate(signer, unsigned_xml):
    signed = signer.sign(unsigned_xml).value
    root = etree.fromstring(signed.encode("utf-8"))
    sc = root.find(f".//{{{XADES_NS['xades']}}}SigningCertificate")
    assert sc is not None
    cert_digest = sc.find(
        f"{{{XADES_NS['xades']}}}Cert/{{{XADES_NS['xades']}}}CertDigest"
        f"/{{{XADES_NS['ds']}}}DigestValue"
    )
    assert cert_digest is not None and cert_digest.text


def test_signature_policy_identifier_is_dian_v2(signer, unsigned_xml):
    signed = signer.sign(unsigned_xml).value
    root = etree.fromstring(signed.encode("utf-8"))
    spi = root.find(f".//{{{XADES_NS['xades']}}}SignaturePolicyIdentifier")
    assert spi is not None
    identifier = spi.find(
        f".//{{{XADES_NS['xades']}}}SigPolicyId/{{{XADES_NS['xades']}}}Identifier"
    )
    assert identifier.text == DIAN_POLICY_V2_URL
    hash_val = spi.find(
        f".//{{{XADES_NS['xades']}}}SigPolicyHash/{{{XADES_NS['ds']}}}DigestValue"
    )
    assert hash_val.text == DIAN_POLICY_V2_HASH_B64


# ── Verificación criptográfica de la firma ────────────────────────────────────

def test_signature_value_verifies_with_public_key(signer, unsigned_xml, self_signed_cert):
    """
    Recanonicalizar SignedInfo y verificar la firma con la clave pública del cert.
    Si esto pasa, la firma es matemáticamente válida.
    """
    _, cert = self_signed_cert
    signed = signer.sign(unsigned_xml).value
    root = etree.fromstring(signed.encode("utf-8"))

    signed_info = root.find(f".//{{{XADES_NS['ds']}}}SignedInfo")
    sigval_b64 = root.find(f".//{{{XADES_NS['ds']}}}SignatureValue").text
    sig_bytes = base64.b64decode(sigval_b64)

    si_c14n = _c14n(signed_info)

    # No debe lanzar
    cert.public_key().verify(
        sig_bytes, si_c14n, padding.PKCS1v15(), hashes.SHA256(),
    )


def test_verification_fails_if_xml_tampered(signer, unsigned_xml, self_signed_cert):
    """Cambiar un dígito del XML debe invalidar el digest del documento (no el sig en sí)."""
    _, cert = self_signed_cert
    signed = signer.sign(unsigned_xml).value
    # Tamperar: cambiar el ID de la factura
    tampered = signed.replace("FE-1", "FE-9")
    root = etree.fromstring(tampered.encode("utf-8"))

    # Recomputar digest del documento como lo haría el verificador
    import hashlib as _hashlib
    root_copy = etree.fromstring(etree.tostring(root))
    for sig in root_copy.iter(f"{{{XADES_NS['ds']}}}Signature"):
        sig.getparent().remove(sig)
    actual_digest = base64.b64encode(
        _hashlib.sha256(_c14n(root_copy)).digest(),
    ).decode("ascii")

    stored_digest = root.findall(
        f".//{{{XADES_NS['ds']}}}SignedInfo/{{{XADES_NS['ds']}}}Reference"
        f"/{{{XADES_NS['ds']}}}DigestValue"
    )[0].text

    assert actual_digest != stored_digest


# ── Errores ───────────────────────────────────────────────────────────────────

def test_sign_fails_with_empty_xml(signer):
    result = signer.sign("")
    assert isinstance(result, Left)
    assert isinstance(result.value, CryptoFailure)


def test_sign_fails_with_malformed_xml(signer):
    result = signer.sign("<not-xml")
    assert isinstance(result, Left)


def test_sign_fails_when_signature_slot_missing(signer):
    """XML sin las dos extensiones UBL debe fallar."""
    minimal_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>'
    )
    result = signer.sign(minimal_xml)
    assert isinstance(result, Left)
    assert "ExtensionContent" in result.value.message
