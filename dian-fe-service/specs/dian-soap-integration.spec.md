# Spec: DIAN SOAP Integration

## Identificador
`dian/soap-integration`

## Propósito
Cliente SOAP que se conecta a los Web Services de la DIAN para enviar facturas electrónicas, consultar estado y validar información.

## Endpoints DIAN

### Ambiente de Prueba (Habilitación)

```
WSDL: https://vpruebas.dian.gov.co/WcfDianCustomerService.svc?wsdl
Endpoint (SendBillSync): https://vpruebas.dian.gov.co/WcfDianCustomerService.svc
```

**Métodos disponibles:**
- `SendBillSync(contentFile, fileName)`
- `GetStatus(trackId)`
- `GetNumberingRange(nit)`

### Ambiente de Producción

```
WSDL: https://vpfe.dian.gov.co/WcfDianCustomerService.svc?wsdl
Endpoint: https://vpfe.dian.gov.co/WcfDianCustomerService.svc
```

**Exactamente los mismos métodos.**

## Autenticación: WS-Security

Cada request SOAP debe incluir credenciales en el header WS-Security:

```xml
<soap:Header>
  <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
    <wsse:UsernameToken>
      <wsse:Username>NIT_EMISOR</wsse:Username>
      <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">
        CLAVE_TECNICA_DIAN
      </wsse:Password>
    </wsse:UsernameToken>
  </wsse:Security>
</soap:Header>
```

Dónde:
- `NIT_EMISOR`: NIT del contribuyente (sin DV)
- `CLAVE_TECNICA_DIAN`: Clave técnica de DIAN (96 chars)

## Método: SendBillSync

### Request

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wcf="http://www.dian.gov.co/serviciosweb/wcfdianservices">
  <soap:Header>
    <!-- WS-Security (ver arriba) -->
  </soap:Header>
  <soap:Body>
    <wcf:SendBillSync>
      <wcf:contentFile>[XML UBL en Base64]</wcf:contentFile>
      <wcf:fileName>FAC-2026-04-28-0001.xml</wcf:fileName>
    </wcf:SendBillSync>
  </soap:Body>
</soap:Envelope>
```

### Response (Exitosa)

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SendBillSyncResponse xmlns="http://www.dian.gov.co/serviciosweb/wcfdianservices">
      <SendBillSyncResult>
        <StatusCode>200</StatusCode>
        <Status>OK</Status>
        <TrackId>12345678</TrackId>  <!-- ID para consultar estado -->
        <Signature>CUFE...</Signature>
        <XmlBase64Bytes>[XML respondido por DIAN]</XmlBase64Bytes>  <!-- Opcional -->
        <PdfBase64Bytes>[PDF de factura]</PdfBase64Bytes>  <!-- Opcional -->
      </SendBillSyncResult>
    </SendBillSyncResponse>
  </soap:Body>
</soap:Envelope>
```

### Response (Validación Fallida)

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SendBillSyncResponse xmlns="http://www.dian.gov.co/serviciosweb/wcfdianservices">
      <SendBillSyncResult>
        <StatusCode>400</StatusCode>
        <Status>REJECTION</Status>
        <ErrorMessage>
          <LineNumber>1</LineNumber>
          <ErrorCode>234</ErrorCode>
          <ErrorMessage>El NIT del adquiriente no es válido</ErrorMessage>
        </ErrorMessage>
        <TrackId>NULL</TrackId>
      </SendBillSyncResult>
    </SendBillSyncResponse>
  </soap:Body>
</soap:Envelope>
```

## Método: GetStatus

Consultar estado de una factura ya enviada.

### Request

```xml
<wcf:GetStatus>
  <wcf:trackId>12345678</wcf:trackId>
</wcf:GetStatus>
```

### Response

```xml
<GetStatusResponse>
  <GetStatusResult>
    <StatusCode>200</StatusCode>
    <CurrentStatus>ACEPTADO</CurrentStatus>  <!-- ACEPTADO, RECHAZADO, PENDIENTE -->
    <StatusMessage>Factura aceptada</StatusMessage>
  </GetStatusResult>
</GetStatusResponse>
```

## Códigos de Estado HTTP

| Código | Significado | Acción |
|---|---|---|
| 200 | OK | Factura procesada (revisar `Status` en respuesta) |
| 400 | Bad Request | Erro de validación (rechazada) |
| 401 | Unauthorized | Credenciales inválidas (WS-Security) |
| 500 | Server Error | Error de DIAN (reintentar con backoff) |
| 503 | Service Unavailable | DIAN caída (marcar como contingencia) |

## Implementación con `zeep` (Python)

```python
from zeep import Client, Settings
from zeep.wsse import UsernameToken
from zeep.wsse.username_token import PasswordDigestType

# Configurar credenciales
username_token = UsernameToken(
    username=NIT_EMISOR,
    password=CLAVE_TECNICA_DIAN,
    password_digest=PasswordDigestType.Text
)

# Cliente SOAP
settings = Settings(strict=False)  # Lenient parsing
client = Client(
    wsdl=DIAN_WSDL_URL,
    settings=settings,
    wsse=username_token
)

# Invocar SendBillSync
result = client.service.SendBillSync(
    contentFile=xml_base64,
    fileName=invoice_filename
)

# Procesar respuesta
if result['StatusCode'] == 200:
    if result['Status'] == 'OK':
        # Aceptada
        cufe = result['Signature']
    else:
        # Rechazada
        error_msg = result['ErrorMessage']['ErrorMessage']
else:
    # Error técnico
    error_msg = result['StatusCode']
```

## Manejo de Errores

- **Validación (400)**: La factura no cumple esquema DIAN. Retornar lista de errores al usuario.
- **Autenticación (401)**: Credenciales inválidas (NIT o CLAVE_TECNICA). Fallar y alertar admin.
- **Servidor (500)**: Error en DIAN. Reintentar con backoff exponencial (máx 3 intentos).
- **Caída (503)**: DIAN no disponible. Marcar factura como 'contingency' (enviar después).
- **Timeout**: Esperar máximo 30s. Si expira, reintentar.

## Configuración (.env)

```
DIAN_NIT_EMISOR=890123456
DIAN_CLAVE_TECNICA=ABCD1234...
DIAN_WSDL_URL=https://vpruebas.dian.gov.co/WcfDianCustomerService.svc?wsdl
DIAN_ENDPOINT=https://vpruebas.dian.gov.co/WcfDianCustomerService.svc
DIAN_TIMEOUT_SECONDS=30
DIAN_MAX_RETRIES=3
```

## Flujo de Integración Completo

```
1. [parqueadero-web UI] Cerrar caja / Emitir factura
2. [Supabase Edge Function] request-invoice
   → Asignar número secuencial
   → Llamar a dian-fe-service POST /invoice
3. [dian-fe-service] Recibir JSON, construir XML UBL
   → Calcular CUFE
   → Firmar con XAdES-EPES
   → Llamar a DianSoapClient.SendBillSync()
4. [DIAN WS] Validar y procesar
   → Si OK: retornar CUFE, XML, PDF
   → Si error: retornar lista de errores
5. [dian-fe-service] Procesar respuesta
   → Guardar en Supabase (dian_status, dian_cufe, URLs)
   → Guardar XML/PDF en Storage
   → Retornar resultado a Edge Function
6. [Supabase] Actualizar invoice en BD
7. [parqueadero-web] Mostrar resultado al operario
```

---
Status: Pendiente de Implementación
