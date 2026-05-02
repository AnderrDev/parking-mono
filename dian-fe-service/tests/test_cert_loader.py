"""Tests del cargador de certificados PKCS#12."""
import base64

from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from cryptography.x509 import Certificate

from app.core.either import Left, Right
from app.core.failures import CryptoFailure
from app.infrastructure.crypto.cert_loader import (
    load_p12_from_b64,
    load_p12_from_bytes,
    load_p12_from_file,
)
from tests.conftest import TEST_P12_PASSWORD


def test_load_from_bytes_returns_key_and_cert(self_signed_p12):
    result = load_p12_from_bytes(self_signed_p12, TEST_P12_PASSWORD)
    assert isinstance(result, Right)
    private_key, certificate, ca_certs = result.value
    assert isinstance(private_key, RSAPrivateKey)
    assert isinstance(certificate, Certificate)
    assert ca_certs == []


def test_load_from_bytes_wrong_password(self_signed_p12):
    result = load_p12_from_bytes(self_signed_p12, "contrasena-mala")
    assert isinstance(result, Left)
    assert isinstance(result.value, CryptoFailure)


def test_load_from_bytes_corrupt_data():
    result = load_p12_from_bytes(b"no-es-pkcs12", TEST_P12_PASSWORD)
    assert isinstance(result, Left)


def test_load_from_b64(self_signed_p12):
    b64 = base64.b64encode(self_signed_p12).decode("ascii")
    result = load_p12_from_b64(b64, TEST_P12_PASSWORD)
    assert isinstance(result, Right)


def test_load_from_b64_invalid():
    result = load_p12_from_b64("##no-es-base64##", TEST_P12_PASSWORD)
    assert isinstance(result, Left)


def test_load_from_file_not_found():
    result = load_p12_from_file("/tmp/no-existe-este-cert.p12", "x")
    assert isinstance(result, Left)
    assert "no encontrado" in result.value.message.lower()


def test_load_from_file_ok(tmp_path, self_signed_p12):
    p12_file = tmp_path / "test.p12"
    p12_file.write_bytes(self_signed_p12)
    result = load_p12_from_file(str(p12_file), TEST_P12_PASSWORD)
    assert isinstance(result, Right)
