"""
Fixtures compartidos para tests del dian-fe-service.

Genera un certificado autofirmado al inicio de la sesión para tests de XAdES
sin necesidad de un .p12 real de DIAN.
"""
from datetime import datetime, timedelta, timezone

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID


TEST_P12_PASSWORD = "test1234"


def _build_self_signed_cert():
    """Genera un par (private_key, certificate) RSA-2048 autofirmado válido 1 año."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "CO"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Bogotá D.C."),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Parqueadero Test S.A.S."),
        x509.NameAttribute(NameOID.COMMON_NAME, "DIAN FE Test Cert"),
    ])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=1))
        .not_valid_after(now + timedelta(days=365))
        .sign(private_key, hashes.SHA256())
    )
    return private_key, cert


@pytest.fixture(scope="session")
def self_signed_cert():
    """Tuple (private_key, certificate) reutilizado por toda la sesión."""
    return _build_self_signed_cert()


@pytest.fixture(scope="session")
def self_signed_p12(self_signed_cert) -> bytes:
    """Mismo cert serializado a .p12 con contraseña conocida."""
    private_key, cert = self_signed_cert
    return pkcs12.serialize_key_and_certificates(
        name=b"test",
        key=private_key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(
            TEST_P12_PASSWORD.encode("utf-8"),
        ),
    )
