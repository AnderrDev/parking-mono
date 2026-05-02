"""
Firma XAdES-EPES sobre XML UBL 2.1 según política de firma DIAN v2.

Spec: dian-fe-service/specs/xades-signature.spec.md

Implementación manual sobre `cryptography` + `lxml` (sin signxml/xmlsec1) para
control total sobre los detalles que pide DIAN: 3 references (documento +
SignedProperties + KeyInfo), enveloped-signature + exc-c14n, política de firma
embebida con su hash, RSA-SHA256.

La firma se inserta en el SEGUNDO `ext:UBLExtension/ext:ExtensionContent` que
deja el `UBLBuilder` reservado.
"""
import base64
import hashlib
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from cryptography.x509 import Certificate
from lxml import etree

from app.core.either import Either, Left, Right
from app.core.failures import CryptoFailure


NS = {
    "ext": "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    "ds": "http://www.w3.org/2000/09/xmldsig#",
    "xades": "http://uri.etsi.org/01903/v1.3.2#",
}

BOGOTA_TZ = timezone(timedelta(hours=-5))

# Política de firma DIAN v2 (público)
DIAN_POLICY_V2_URL = (
    "https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf"
)
# SHA-256 del PDF de la política, en base64. Si DIAN actualiza la política,
# actualizar este hash.
DIAN_POLICY_V2_HASH_B64 = "dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y="

ALG_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#"
ALG_RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
ALG_SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256"
ALG_ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"


def _q(prefix: str, local: str) -> str:
    return f"{{{NS[prefix]}}}{local}"


def _c14n(elem: etree._Element) -> bytes:
    """Canonicalización exclusiva (xml-exc-c14n) sin comentarios."""
    return etree.tostring(elem, method="c14n", exclusive=True, with_comments=False)


def _sha256_b64(data: bytes) -> str:
    return base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")


class XADESSigner:
    """
    Firma XAdES-EPES sobre un XML UBL 2.1 generado por `UBLBuilder`.

    Uso:
        signer = XADESSigner(private_key, certificate)
        either = signer.sign(unsigned_xml)
    """

    def __init__(
        self,
        private_key: RSAPrivateKey,
        certificate: Certificate,
        policy_url: str = DIAN_POLICY_V2_URL,
        policy_hash_b64: str = DIAN_POLICY_V2_HASH_B64,
    ):
        self.private_key = private_key
        self.certificate = certificate
        self.policy_url = policy_url
        self.policy_hash_b64 = policy_hash_b64

        cert_der = certificate.public_bytes(serialization.Encoding.DER)
        self._cert_b64 = base64.b64encode(cert_der).decode("ascii")
        self._cert_digest_b64 = _sha256_b64(cert_der)
        self._issuer_name = certificate.issuer.rfc4514_string()
        self._serial_number = str(certificate.serial_number)

    def sign(
        self,
        xml_str: str,
        signing_time: Optional[datetime] = None,
    ) -> Either[CryptoFailure, str]:
        if not xml_str:
            return Left(CryptoFailure(message="XML vacío"))

        try:
            root = etree.fromstring(xml_str.encode("utf-8"))
        except etree.XMLSyntaxError as exc:
            return Left(CryptoFailure(message=f"XML mal formado: {exc}"))

        target = self._find_signature_slot(root)
        if target is None:
            return Left(CryptoFailure(
                message="No se encontró el segundo ext:ExtensionContent para insertar la firma",
            ))

        try:
            signed_root = self._build_and_insert_signature(
                root, target, signing_time or datetime.now(timezone.utc),
            )
            xml_bytes = etree.tostring(
                signed_root, xml_declaration=True, encoding="UTF-8", standalone=False,
            )
            return Right(xml_bytes.decode("utf-8"))
        except Exception as exc:
            return Left(CryptoFailure(message=f"Error firmando XML: {exc}"))

    # ── Internos ──────────────────────────────────────────────────────────────

    def _find_signature_slot(self, root: etree._Element) -> Optional[etree._Element]:
        extensions = root.findall(
            f"{_q('ext', 'UBLExtensions')}/{_q('ext', 'UBLExtension')}"
        )
        if len(extensions) < 2:
            return None
        return extensions[1].find(_q("ext", "ExtensionContent"))

    def _build_and_insert_signature(
        self,
        root: etree._Element,
        slot: etree._Element,
        signing_time: datetime,
    ) -> etree._Element:
        uid = uuid.uuid4().hex[:16]
        ids = {
            "sig": f"xmldsig-{uid}",
            "sigval": f"xmldsig-{uid}-sigvalue",
            "keyinfo": f"xmldsig-{uid}-keyinfo",
            "ref0": f"xmldsig-{uid}-ref0",
            "ref_sp": f"xmldsig-{uid}-ref-signedprops",
            "ref_keyinfo": f"xmldsig-{uid}-ref-keyinfo",
            "sp": f"xmldsig-{uid}-signedprops",
            "object": f"xmldsig-{uid}-object",
        }

        # 1) Esqueleto de la firma con placeholders en DigestValue / SignatureValue.
        signature = etree.SubElement(slot, _q("ds", "Signature"), Id=ids["sig"])
        signed_info = self._build_signed_info(signature, ids)
        sigval = etree.SubElement(signature, _q("ds", "SignatureValue"), Id=ids["sigval"])
        keyinfo = self._build_keyinfo(signature, ids)
        signed_props = self._build_object(signature, ids, signing_time)

        # 2) Computar digests reales.
        # Reference 1 — documento con enveloped-signature transform + exc-c14n.
        digest1 = self._compute_document_digest(root, signature)
        # Reference 2 — SignedProperties canonicalizado.
        digest2 = _sha256_b64(_c14n(signed_props))
        # Reference 3 — KeyInfo canonicalizado.
        digest3 = _sha256_b64(_c14n(keyinfo))

        # Llenar los DigestValue en el orden de las references.
        digest_values = signed_info.findall(
            f"{_q('ds', 'Reference')}/{_q('ds', 'DigestValue')}"
        )
        digest_values[0].text = digest1
        digest_values[1].text = digest2
        digest_values[2].text = digest3

        # 3) Firmar SignedInfo canonicalizado con RSA-SHA256.
        si_c14n = _c14n(signed_info)
        sig_bytes = self.private_key.sign(
            si_c14n, padding.PKCS1v15(), hashes.SHA256(),
        )
        sigval.text = base64.b64encode(sig_bytes).decode("ascii")

        return root

    def _build_signed_info(
        self, signature: etree._Element, ids: dict,
    ) -> etree._Element:
        signed_info = etree.SubElement(signature, _q("ds", "SignedInfo"))
        etree.SubElement(
            signed_info, _q("ds", "CanonicalizationMethod"), Algorithm=ALG_C14N,
        )
        etree.SubElement(
            signed_info, _q("ds", "SignatureMethod"), Algorithm=ALG_RSA_SHA256,
        )

        # Reference 1: documento (URI vacío = el doc root)
        ref1 = etree.SubElement(
            signed_info, _q("ds", "Reference"), URI="", Id=ids["ref0"],
        )
        transforms = etree.SubElement(ref1, _q("ds", "Transforms"))
        etree.SubElement(transforms, _q("ds", "Transform"), Algorithm=ALG_ENVELOPED)
        etree.SubElement(transforms, _q("ds", "Transform"), Algorithm=ALG_C14N)
        etree.SubElement(ref1, _q("ds", "DigestMethod"), Algorithm=ALG_SHA256)
        etree.SubElement(ref1, _q("ds", "DigestValue"))  # placeholder

        # Reference 2: SignedProperties
        ref2 = etree.SubElement(
            signed_info, _q("ds", "Reference"),
            URI=f"#{ids['sp']}",
            Type="http://uri.etsi.org/01903#SignedProperties",
            Id=ids["ref_sp"],
        )
        etree.SubElement(ref2, _q("ds", "DigestMethod"), Algorithm=ALG_SHA256)
        etree.SubElement(ref2, _q("ds", "DigestValue"))  # placeholder

        # Reference 3: KeyInfo
        ref3 = etree.SubElement(
            signed_info, _q("ds", "Reference"),
            URI=f"#{ids['keyinfo']}", Id=ids["ref_keyinfo"],
        )
        etree.SubElement(ref3, _q("ds", "DigestMethod"), Algorithm=ALG_SHA256)
        etree.SubElement(ref3, _q("ds", "DigestValue"))  # placeholder

        return signed_info

    def _build_keyinfo(
        self, signature: etree._Element, ids: dict,
    ) -> etree._Element:
        keyinfo = etree.SubElement(signature, _q("ds", "KeyInfo"), Id=ids["keyinfo"])
        x509data = etree.SubElement(keyinfo, _q("ds", "X509Data"))
        cert_elem = etree.SubElement(x509data, _q("ds", "X509Certificate"))
        cert_elem.text = self._cert_b64
        return keyinfo

    def _build_object(
        self,
        signature: etree._Element,
        ids: dict,
        signing_time: datetime,
    ) -> etree._Element:
        obj = etree.SubElement(signature, _q("ds", "Object"), Id=ids["object"])
        qp = etree.SubElement(
            obj, _q("xades", "QualifyingProperties"), Target=f"#{ids['sig']}",
        )
        sp = etree.SubElement(
            qp, _q("xades", "SignedProperties"), Id=ids["sp"],
        )
        ssp = etree.SubElement(sp, _q("xades", "SignedSignatureProperties"))

        # SigningTime — UTC con sufijo Z
        st = etree.SubElement(ssp, _q("xades", "SigningTime"))
        st_utc = signing_time if signing_time.tzinfo else signing_time.replace(tzinfo=timezone.utc)
        st.text = st_utc.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        # SigningCertificate
        sc = etree.SubElement(ssp, _q("xades", "SigningCertificate"))
        cert = etree.SubElement(sc, _q("xades", "Cert"))
        cd = etree.SubElement(cert, _q("xades", "CertDigest"))
        etree.SubElement(cd, _q("ds", "DigestMethod"), Algorithm=ALG_SHA256)
        cdv = etree.SubElement(cd, _q("ds", "DigestValue"))
        cdv.text = self._cert_digest_b64
        ist = etree.SubElement(cert, _q("xades", "IssuerSerial"))
        x509name = etree.SubElement(ist, _q("ds", "X509IssuerName"))
        x509name.text = self._issuer_name
        x509serial = etree.SubElement(ist, _q("ds", "X509SerialNumber"))
        x509serial.text = self._serial_number

        # SignaturePolicyIdentifier — DIAN v2 (lo que distingue EPES de BES)
        spi = etree.SubElement(ssp, _q("xades", "SignaturePolicyIdentifier"))
        spi_id = etree.SubElement(spi, _q("xades", "SignaturePolicyId"))
        sp_id_inner = etree.SubElement(spi_id, _q("xades", "SigPolicyId"))
        identifier = etree.SubElement(sp_id_inner, _q("xades", "Identifier"))
        identifier.text = self.policy_url
        sp_hash = etree.SubElement(spi_id, _q("xades", "SigPolicyHash"))
        etree.SubElement(sp_hash, _q("ds", "DigestMethod"), Algorithm=ALG_SHA256)
        sp_hash_val = etree.SubElement(sp_hash, _q("ds", "DigestValue"))
        sp_hash_val.text = self.policy_hash_b64

        return sp

    def _compute_document_digest(
        self, root: etree._Element, signature_inserted: etree._Element,
    ) -> str:
        """
        Computa el digest del documento aplicando enveloped-signature transform
        (remueve la <ds:Signature> recién insertada) + exc-c14n.

        Hacemos copia del root, removemos la firma, canonicalizamos.
        """
        root_bytes = etree.tostring(root)
        root_copy = etree.fromstring(root_bytes)
        # Buscar y quitar TODAS las ds:Signature (debería haber una sola)
        for sig in root_copy.iter(_q("ds", "Signature")):
            parent = sig.getparent()
            if parent is not None:
                parent.remove(sig)
        c14n_doc = _c14n(root_copy)
        return _sha256_b64(c14n_doc)
