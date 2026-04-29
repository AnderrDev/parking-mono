# CLAUDE.md — Microservicio DIAN: Facturación Electrónica

**Versión:** 1.0  
**Repo:** dian-fe-service  
**Stack:** Python 3.12 + FastAPI

---

## INTRO

Este es un microservicio independiente que gestiona toda la facturación electrónica contra la DIAN:
- Recibe datos de venta desde Edge Function de Supabase
- Genera XML UBL 2.1 completo
- Calcula CUFE (Código Único de Factura Electrónica)
- Firma con certificado digital (XAdES-EPES)
- Envía a DIAN via SOAP
- Retorna CUFE, XML, PDF

**Metodología**: Spec-Driven. Lee `specs/` antes de cambiar código.

---

## 1. SPECS TÉCNICAS (IMPRESCINDIBLE LEER)

- `specs/emit-invoice.spec.md` — Flujo completo de emisión
- `specs/cufe-calculation.spec.md` — Los 14 campos + SHA-384
- `specs/xades-signature.spec.md` — Estructura firma XAdES-EPES
- `specs/dian-soap-integration.spec.md` — Endpoints, WS-Security, métodos

**Antes de cambiar cualquier algoritmo, verifica que la spec lo documenta.**

---

## 2. ESTRUCTURA

```
app/
├── domain/
│   ├── entities/
│   │   ├── __init__.py
│   │   ├── invoice_entity.py         ← Dataclass puro
│   │   ├── credit_note_entity.py
│   │   ├── dian_response_entity.py
│   │   └── invoice_line_entity.py
│   ├── repositories/
│   │   ├── __init__.py
│   │   └── invoice_repository.py     ← ABC
│   └── usecases/
│       ├── __init__.py
│       ├── emit_invoice.py           ← UseCase
│       ├── cancel_invoice.py
│       └── check_invoice_status.py
│
├── data/
│   ├── models/
│   │   ├── __init__.py
│   │   ├── invoice_model.py          ← Pydantic (request/response)
│   │   └── dian_response_model.py
│   ├── datasources/
│   │   ├── __init__.py
│   │   ├── dian_datasource.py        ← ABC
│   │   ├── dian_datasource_impl.py   ← Real DIAN
│   │   └── dian_datasource_mock.py   ← Para testing
│   └── repositories/
│       ├── __init__.py
│       └── invoice_repository_impl.py
│
├── infrastructure/
│   ├── xml/
│   │   ├── __init__.py
│   │   └── ubl_builder.py            ← Genera XML UBL 2.1
│   ├── crypto/
│   │   ├── __init__.py
│   │   ├── cufe_calculator.py        ← SHA-384 (14 campos)
│   │   ├── software_security_code.py ← Clave DIAN
│   │   ├── xades_signer.py           ← Firma XAdES-EPES
│   │   └── cert_loader.py            ← Carga .p12
│   ├── soap/
│   │   ├── __init__.py
│   │   ├── dian_soap_client.py       ← Cliente SOAP
│   │   └── constants.py              ← URLs, namespaces
│   └── pdf/
│       ├── __init__.py
│       └── invoice_pdf_generator.py  ← Genera PDF desde XML
│
├── presentation/
│   ├── __init__.py
│   └── routes/
│       ├── __init__.py
│       ├── invoice_routes.py         ← POST /invoice, GET /status
│       └── health_routes.py          ← GET /health
│
├── core/
│   ├── __init__.py
│   ├── either.py                     ← Either<Left, Right> pattern
│   ├── failures.py                   ← ValidationFailure, DianFailure, etc
│   ├── config.py                     ← Pydantic Settings (.env)
│   └── di.py                         ← Dependency injection simple
│
├── __init__.py
└── main.py                           ← FastAPI app

tests/
├── __init__.py
├── test_cufe.py                      ← Tests del cálculo CUFE
├── test_xml_builder.py
└── test_either.py

requirements.txt                      ← Dependencias
Dockerfile                             ← Para Fly.io
.env.example                           ← Variables
```

---

## 3. ARQUITECTURA: EITHER PATTERN

Mismo patrón que en Angular. Todas las operaciones retornan `Either[Failure, Result]`:

```python
# app/core/either.py
from dataclasses import dataclass
from typing import TypeVar, Generic, Callable

L = TypeVar('L')
R = TypeVar('R')
B = TypeVar('B')

@dataclass(frozen=True)
class Left(Generic[L]):
    value: L
    def fold(self, on_left: Callable[[L], B], on_right: Callable) -> B:
        return on_left(self.value)

@dataclass(frozen=True)
class Right(Generic[R]):
    value: R
    def fold(self, on_left: Callable, on_right: Callable[[R], B]) -> B:
        return on_right(self.value)

Either = Left[L] | Right[R]
```

---

## 4. CONFIGURACIÓN (.env)

```
# DIAN
DIAN_NIT_EMISOR=890123456
DIAN_CLAVE_TECNICA=ABCD1234...  (96 chars)
DIAN_WSDL_URL=https://vpruebas.dian.gov.co/WcfDianCustomerService.svc?wsdl
DIAN_ENDPOINT=https://vpruebas.dian.gov.co/WcfDianCustomerService.svc
DIAN_TIMEOUT_SECONDS=30

# Certificado Digital
CERT_PATH=/secure/cert.p12
CERT_PASSWORD=securepassword

# Supabase (para actualizar BD)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_API_KEY=eyJhbG...

# Storage (para guardar XML/PDF)
STORAGE_BUCKET=invoices
STORAGE_PATH=/year/month/

# API
API_PORT=8000
API_DEBUG=false
```

---

## 5. FLUJO: EMIT INVOICE

### Input (JSON desde Edge Function)

```json
{
  "customer_name": "Juan Perez",
  "customer_doc_type": "CC",
  "customer_doc_number": "123456789",
  "customer_email": "juan@example.com",
  "invoice_type": "01",
  "invoice_date": "2026-04-28T14:35:30Z",
  "subtotal_cents": 1500000,
  "lines": [
    {
      "description": "Parqueadero 2h 30m",
      "quantity": 1,
      "unit_price_cents": 1200000,
      "tax_percent": 19.0
    }
  ]
}
```

### Pasos

1. **Validar request**
   - Usar Pydantic InvoiceEmissionRequest
   - Validar montos suma correcta
   - Validar documento cliente

2. **Generar XML UBL 2.1**
   ```python
   from app.infrastructure.xml import UBLBuilder
   ubl = UBLBuilder()
   xml = ubl.build(invoice_data)
   ```

3. **Calcular CUFE**
   ```python
   from app.infrastructure.crypto import CUFECalculator
   calc = CUFECalculator(DIAN_CLAVE_TECNICA)
   cufe = calc.calculate(invoice_data)
   ```

4. **Firmar con XAdES-EPES**
   ```python
   from app.infrastructure.crypto import XADESSigner
   signer = XADESSigner(cert_path, cert_password)
   signed_xml = signer.sign(xml, cufe)
   ```

5. **Enviar a DIAN**
   ```python
   from app.infrastructure.soap import DianSoapClient
   client = DianSoapClient(dian_endpoint, nit, clave_tecnica)
   response = client.send_bill_sync(signed_xml)
   ```

6. **Procesar respuesta**
   - Si aceptada: guardar XML, PDF (si viene) en Storage
   - Si rechazada: retornar errores DIAN
   - Si timeout: marcar como contingency (reintentar después)

7. **Actualizar BD**
   ```python
   supabase.table('invoices').update({
     'dian_status': response.status,
     'dian_cufe': response.cufe,
     'dian_xml_url': xml_url,
     'dian_pdf_url': pdf_url
   })
   ```

### Output (JSON al cliente)

```json
{
  "success": true,
  "invoice_number": "FAC-2026-04-28-0001",
  "cufe": "A1B2C3D4E5F6...",
  "dian_status": "accepted",
  "xml_url": "https://storage.../invoices/2026/04/FAC-0001.xml",
  "pdf_url": "https://storage.../invoices/2026/04/FAC-0001.pdf",
  "issued_at": "2026-04-28T14:35:30Z"
}
```

---

## 6. CUFE: LOS 14 CAMPOS

**Orden exacto (con separador |):**

1. NIT emisor (sin DV): `890123456`
2. Tipo doc: `01` (factura)
3. Número: `0000000001`
4. Fecha (YYYYMMDD): `20260428`
5. Hora (HHMMSS): `143530`
6. Subtotal (.2): `1500000.00`
7. Descuento (.2): `0.00`
8. IVA (.2): `285000.00`
9. Retenciones (.2): `0.00`
10. Total (.2): `1785000.00`
11. Doc cliente (sin guion): `0123456789`
12. Apellido cliente (MAYÚS): `PEREZ`
13. Nombre cliente (MAYÚS): `JUAN`
14. Clave técnica DIAN: `ABCD1234...` (96 chars)

**Algoritmo:**
```python
input_string = f"{c1}|{c2}|{c3}|{c4}|{c5}|{c6}|{c7}|{c8}|{c9}|{c10}|{c11}|{c12}|{c13}|{c14}"
cufe = hashlib.sha384(input_string.encode('utf-8')).hexdigest().upper()
```

---

## 7. TESTING

### Tests del CUFE (crítico)

Verificar contra ejemplos de DIAN:

```python
# tests/test_cufe.py
def test_cufe_calculation():
    calc = CUFECalculator(CLAVE_TECNICA_DIAN)
    
    invoice_data = {
        'nit_emisor': '890123456',
        'tipo_documento': '01',
        'numero': '0000000001',
        'fecha': date(2026, 4, 28),
        'hora': time(14, 35, 30),
        'subtotal_cents': 1500000,
        'impuestos_cents': 285000,
        'total_cents': 1785000,
        'doc_cliente': '123456789',
        'apellido': 'PEREZ',
        'nombre': 'JUAN'
    }
    
    cufe = calc.calculate(invoice_data)
    
    # Verificar formato (96 chars hex)
    assert len(cufe) == 96
    assert all(c in '0123456789ABCDEF' for c in cufe)
    
    # Verificar que es reproducible
    cufe2 = calc.calculate(invoice_data)
    assert cufe == cufe2
```

### Mock de DIAN (para dev)

```python
# app/data/datasources/dian_datasource_mock.py
class DianDataSourceMock(DianDataSource):
    async def send_bill_sync(self, xml: str) -> Either[Failure, DianResponse]:
        # Simular respuesta DIAN
        return Right(DianResponse(
            status_code=200,
            status='OK',
            track_id='12345',
            cufe='MOCKED_CUFE_...'
        ))
```

---

## 8. DEPLOYMENT (Fly.io)

```bash
# Login
fly auth login

# Deploy
fly deploy

# Ver logs
fly logs
```

Docker usa Python 3.12, instala dependencias desde `requirements.txt`.

---

## 9. CONSIDERACIONES DE SEGURIDAD

- **Certificado digital**: Almacenar en `/secure/` con permisos 0400. NUNCA comitear.
- **Clave técnica DIAN**: En .env, NUNCA en código.
- **Supabase API key**: En .env, usar role service_role (no anon).
- **Logs**: NO loguear XML/datos sensibles (usar pattern masking).
- **HTTPS**: Obligatorio en producción.

---

## PRÓXIMOS PASOS

1. ✅ Specs técnicas creadas
2. ⏳ Implementar Either pattern en Python
3. ⏳ Implementar UBLBuilder (XML UBL 2.1)
4. ⏳ Implementar CUFECalculator (SHA-384)
5. ⏳ Implementar XADESSigner (firma digital)
6. ⏳ Implementar DianSoapClient (WS)
7. ⏳ Rutas FastAPI (POST /invoice)
8. ⏳ Tests del CUFE
9. ⏳ Deploy en Fly.io

---

**v1.0** — Guía del microservicio DIAN. Actualizar cuando cambien specs.
