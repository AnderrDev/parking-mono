"""
Carga de certificado .p12 (PKCS#12) desde archivo o desde base64 (Fly.io secrets).

Spec: dian-fe-service/specs/xades-signature.spec.md §"Cargar Certificado"
"""
import base64
from typing import Tuple

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from cryptography.x509 import Certificate

from app.core.either import Either, Left, Right
from app.core.failures import CryptoFailure


# (private_key, cert_principal, lista_de_cas)
LoadedCert = Tuple[RSAPrivateKey, Certificate, list]


def load_p12_from_bytes(data: bytes, password: str) -> Either[CryptoFailure, LoadedCert]:
    """Decodifica un blob PKCS#12 con contraseña."""
    try:
        pwd_bytes = password.encode("utf-8") if password else None
        private_key, certificate, ca_certs = pkcs12.load_key_and_certificates(
            data, pwd_bytes, default_backend()
        )
        if private_key is None:
            return Left(CryptoFailure(message="El .p12 no contiene clave privada"))
        if certificate is None:
            return Left(CryptoFailure(message="El .p12 no contiene certificado principal"))
        return Right((private_key, certificate, ca_certs or []))
    except Exception as exc:
        return Left(CryptoFailure(message=f"Error decodificando .p12: {exc}"))


def load_p12_from_file(path: str, password: str) -> Either[CryptoFailure, LoadedCert]:
    """Lee y decodifica un .p12 desde el filesystem."""
    try:
        with open(path, "rb") as f:
            data = f.read()
    except FileNotFoundError:
        return Left(CryptoFailure(message=f"Certificado no encontrado: {path}"))
    except PermissionError:
        return Left(CryptoFailure(message=f"Sin permisos para leer: {path}"))
    return load_p12_from_bytes(data, password)


def load_p12_from_b64(b64_str: str, password: str) -> Either[CryptoFailure, LoadedCert]:
    """
    Decodifica un .p12 desde un string base64.
    Útil para Fly.io secrets: `fly secrets set CERT_B64=$(base64 cert.p12)`.
    """
    try:
        data = base64.b64decode(b64_str)
    except Exception as exc:
        return Left(CryptoFailure(message=f"Base64 inválido: {exc}"))
    return load_p12_from_bytes(data, password)
