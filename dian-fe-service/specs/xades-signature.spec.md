# Spec: XAdES-EPES Signature

## Identificador
`dian/xades-signature`

## Descripción
Firma electrónica XAdES-EPES del documento XML UBL 2.1 según política DIAN v2. La firma contiene la firma digital + timestamp + referencia al certificado, todo embebido en el XML.

## Estructura de la Firma

```xml
<ext:UBLExtensions>
  <ext:UBLExtension>
    <ext:ExtensionContent>
      <ds:Signature Id="xmldsig-[UUID]">
        <!-- Signed Info -->
        <ds:SignedInfo>
          <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#" />
          <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" />
          
          <!-- 3 References -->
          <ds:Reference URI="" Id="xmldsig-[id1]">
            <ds:Transforms>
              <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature" />
              <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#" />
            </ds:Transforms>
            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />
            <ds:DigestValue>[SHA256 del documento]</ds:DigestValue>
          </ds:Reference>
          
          <ds:Reference URI="#xmldsig-[props-id]" Type="http://uri.etsi.org/01903#SignedProperties" Id="xmldsig-[id2]">
            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />
            <ds:DigestValue>[SHA256 de SignedProperties]</ds:DigestValue>
          </ds:Reference>
          
          <ds:Reference URI="#KeyInfo" Id="xmldsig-[id3]">
            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />
            <ds:DigestValue>[SHA256 del certificado]</ds:DigestValue>
          </ds:Reference>
        </ds:SignedInfo>
        
        <!-- Signature Value (la firma RSA-SHA256) -->
        <ds:SignatureValue Id="xmldsig-[sig-id]">
          [Base64 de la firma binaria]
        </ds:SignatureValue>
        
        <!-- Key Info -->
        <ds:KeyInfo Id="KeyInfo">
          <ds:X509Data>
            <ds:X509Certificate>[Certificado en Base64]</ds:X509Certificate>
          </ds:X509Data>
        </ds:KeyInfo>
        
        <!-- XAdES Object -->
        <ds:Object>
          <xades:QualifyingProperties>
            <xades:SignedProperties Id="xmldsig-[props-id]">
              <xades:SignedSignatureProperties>
                <xades:SigningTime>2026-04-28T14:35:30Z</xades:SigningTime>
                <xades:SigningCertificate>
                  <xades:Cert>
                    <xades:CertDigest>
                      <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />
                      <ds:DigestValue>[SHA256 del cert]</ds:DigestValue>
                    </xades:CertDigest>
                    <xades:IssuerSerial>
                      <ds:X509IssuerName>[Issuer del cert]</ds:X509IssuerName>
                      <ds:X509SerialNumber>[Serial]</ds:X509SerialNumber>
                    </xades:IssuerSerial>
                  </xades:Cert>
                </xades:SigningCertificate>
              </xades:SignedSignatureProperties>
              <xades:SignedDataObjectProperties>
                <xades:DataObjectFormat ObjectReference="#xmldsig-[ref-id]">
                  <xades:MimeType>application/xml</xades:MimeType>
                  <xades:Encoding>UTF-8</xades:Encoding>
                </xades:DataObjectFormat>
              </xades:SignedDataObjectProperties>
            </xades:SignedProperties>
            <xades:UnsignedProperties>
              <xades:UnsignedSignatureProperties>
                <xades:CounterSignature>
                  [Timestamp de servidor, si aplica]
                </xades:CounterSignature>
              </xades:UnsignedSignatureProperties>
            </xades:UnsignedProperties>
          </xades:QualifyingProperties>
        </ds:Object>
      </ds:Signature>
    </ext:ExtensionContent>
  </ext:UBLExtension>
</ext:UBLExtensions>
```

## Proceso de Firma

### 1. Cargar Certificado

```python
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

# Certificado en archivo .p12 (PKCS#12)
cert_file = "/path/to/certificate.p12"
cert_password = os.getenv("CERT_PASSWORD").encode()

with open(cert_file, 'rb') as f:
    private_key, certificate, ca_certs = \
        serialization.load_key_and_certificates(
            f.read(),
            cert_password,
            default_backend()
        )
```

### 2. Crear SignedInfo

```python
# Canonicalizar el documento
c14n_doc = canonicalize_xml(xml_document)

# Crear 3 references
ref1 = Reference(uri="", digest=sha256(c14n_doc))
ref2 = Reference(uri="#SignedProperties", digest=sha256(signed_props))
ref3 = Reference(uri="#KeyInfo", digest=sha256(certificate))

signed_info = SignedInfo(
    canonicalization_method="exc-c14n",
    signature_method="rsa-sha256",
    references=[ref1, ref2, ref3]
)
```

### 3. Firmar con RSA-SHA256

```python
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes

c14n_signed_info = canonicalize_xml(signed_info)
signature_value = private_key.sign(
    c14n_signed_info,
    padding.PKCS1v15(),
    hashes.SHA256()
)
signature_value_b64 = base64.b64encode(signature_value).decode()
```

### 4. Embebecer en XML

```python
# Agregar <ds:SignatureValue>
xml.find(".//ds:Signature").append(
    Element("ds:SignatureValue", text=signature_value_b64)
)

# Agregar <ds:KeyInfo>
# Agregar <ds:Object> con XAdES
# Insertar en <ext:UBLExtensions>
```

## Validación

Después de crear la firma:
1. Verificar que SignatureValue sea válido (recrear digest y validar firma)
2. Verificar que todos los References tengan DigestValue correcto
3. Verificar que el certificado sea válido (no expirado)
4. Verificar que la firma XML sea bien-formada

## Certificado Digital

### Requisitos (según DIAN)

- Algoritmo: RSA mínimo 2048 bits
- Hash: SHA-256 mínimo
- Emisor: Autoridad Certificadora colombiana registrada ante MinTIC
- Propósito: Factura Electrónica
- Validez: Mínimo 1 año

### Configuración (.env)

```
CERT_PATH=/secure/path/to/certificate.p12
CERT_PASSWORD=securepassword
CERT_THUMBPRINT=ABCD1234...  # Para validación
```

## Política DIAN v2

- **Política de firma**: http://www.dian.gov.co/...
- **Especificación de marca de tiempo**: RFC 3161
- **Formato de encapsulado**: XAdES-EPES (Equipo Pro Sellos)

## Dependencias

- `signxml` — para firmar XML
- `xmlsec` — validación de firma
- `cryptography` — manejo de certificados

---
Status: Pendiente de Implementación
