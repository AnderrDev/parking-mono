# Sesión: DIAN FE Service — Plan + D1 a D8

**Fecha:** 2026-05-01
**Subproyecto(s):** dian-fe-service
**Estado:** completada

## Objetivos
- [x] Crear PLAN-DIAN.md con D1–D10
- [x] D1 Bootstrap (FastAPI, config, Dockerfile)
- [x] D2 Either + Failures
- [x] D3 UBL Builder (XML UBL 2.1 con namespaces DIAN)
- [x] D4 CUFE Calculator (SHA-384 con 14 campos)
- [x] D5 XAdES Signer (firma EPES con política DIAN v2)
- [x] D6 SOAP Client (manual + mock)
- [x] D7 FastAPI domain layer + ruta `POST /invoice`
- [x] D8 Docker build + run verified
- [ ] D9/D10 — bloqueados por materiales externos (cert + clave técnica DIAN)

## Avance

### Setup
- Python 3.12 instalado vía `brew install python@3.12` (sistema solo tenía 3.9.6).
- Stack: fastapi 0.115.5, uvicorn 0.32.1, pydantic-settings 2.6.1, zeep 4.3.1, lxml 5.3.0, cryptography 44.0.0, supabase 2.18.1, httpx 0.27.2, pytest 8.3.3.

### D1 Bootstrap
- Estructura `app/{core,domain,data,infrastructure,presentation}` con `__init__.py`.
- `Settings` Pydantic con `get_settings()` cacheado.
- `app/main.py` FastAPI con CORS + lifespan + health router.
- Dockerfile multi-stage, no-root, expone 8000.
- `.dockerignore`, `.gitignore`, `.env.example`, `fly.toml`, `pyproject.toml`.

### D2 Either + Failures
- `Left`/`Right` frozen dataclasses con `fold/map/flat_map/is_left/is_right`.
- 7 subclases de `Failure`: ValidationFailure (con fields), BusinessRuleFailure, XmlFailure, CryptoFailure, DianFailure (con status + dian_messages), NetworkFailure, ServerFailure.

### D3 UBL Builder
- `SupplierData` entity (NIT/DV, razón social, dirección, régimen).
- `UBLBuilder(supplier, profile_execution_id)` → `Either[XmlFailure, str]`.
- Namespaces DIAN: default Invoice-2, cac, cbc, ext, sts, xades, ds.
- 2 extensiones (#1 placeholder DIAN, #2 reservada para firma XAdES).
- Header completo con CUFE en `cbc:UUID schemeID=2`.
- Bloques: AccountingSupplierParty, AccountingCustomerParty (map doc_type → schemeName), TaxTotal, LegalMonetaryTotal, InvoiceLine[].

### D4 CUFE Calculator
- `InvoiceData` + `CustomerData` + `InvoiceLine` entities.
- `CUFECalculator(clave_tecnica)` con SHA-384 sobre los 14 campos exactos del spec.
- Helpers: `_to_bogota` (UTC→UTC-5), `_format_cents` (Decimal /100), `_normalize_name` (upper+strip).

### D5 XAdES Signer
- `cert_loader.py`: `load_p12_from_{file,bytes,b64}` para .p12 (file o base64 desde Fly.io secret).
- `xades_signer.py`: implementación manual con `cryptography` + `lxml` (sin signxml/xmlsec1).
  - 3 references: documento (con enveloped-signature + exc-c14n), SignedProperties, KeyInfo.
  - SignedProperties con SigningTime UTC, SigningCertificate (digest + IssuerSerial), SignaturePolicyIdentifier (DIAN v2 URL + hash).
  - SignedInfo canonicalizado y firmado con RSA-SHA256.
  - Firma insertada en el 2º `ext:UBLExtension` que dejó UBLBuilder.
- Tests con cert autofirmado generado en `conftest.py` (RSA-2048, válido 1 año).
- Test crucial: `test_signature_value_verifies_with_public_key` valida la firma con la pública del cert (cripto end-to-end).

### D6 SOAP Client
- `dian_response_entity.py`: `DianResponse` + `DianValidationError`.
- `soap/constants.py`: URLs sandbox/prod, namespaces SOAP/WSSE/WCF, SOAPAction.
- `dian_soap_client.py`:
  - Sync con httpx, inyectable para tests.
  - Empaqueta XML en ZIP DEFLATED + base64 (formato real DIAN, no XML pelado).
  - WS-Security UsernameToken con `mustUnderstand=1`.
  - Mapea errores HTTP: 401→rejected, 503/500→contingency, timeout→contingency.
  - Parser tolerante a variaciones de namespace usando `{*}local-name`.
- Datasources: `DianDataSource` ABC + `DianDataSourceImpl` (real) + `DianDataSourceMock` (3 escenarios: accepted/rejected/contingency).

### D7 FastAPI + Domain Layer
- `invoice_model.py`: Pydantic `InvoiceEmissionRequest`/`Response` + `CustomerModel` + `InvoiceLineModel`. Validación en frontera (Literal types, ge/gt, validator de doc_number sin guiones).
- `emit_invoice.py`: `EmitInvoiceUseCase` orquesta UBL → CUFE → XAdES → DIAN. Cortocircuita en cada Left.
- `core/di.py`: `_cached_use_case_or_none()` con `lru_cache`; lee cert de `CERT_PATH` o `CERT_B64`. Si falta config → 503 claro.
- `invoice_routes.py`: `POST /invoice` con map de `Failure → HTTPException` (400/500/502/503).
- DIAN rejection devuelve **HTTP 200 con body.success=false** (procesado, rechazado), no es error HTTP.

### D8 Docker
- Build OK: `docker build -t parqueadero-dian-fe:test .` produce imagen Python 3.12-slim multi-arch.
- Run verificado: contenedor responde `/health` en puerto 8000.
- **Deploy a Fly.io NO ejecutado** (regla absoluta: `fly deploy` requiere confirmación + cert real).

## Decisiones
- **Python 3.12 vía brew**: el sistema solo tenía 3.9.6.
- **`zeep` (no `python-zeep`)**: nombre del paquete en PyPI.
- **Supabase 2.18.1 + httpx 0.27.2**: 2.10 conflicto con httpx 0.28.
- **`cryptography` directo, no `signxml`**: control total sobre los detalles XAdES-EPES de DIAN; signxml/xmlsec1 son opacos para la política DIAN v2.
- **ZIP+base64 en SendBillSync** (no XML pelado): es lo que realmente espera DIAN, aunque el spec del proyecto era informal.
- **`httpx.MockTransport`** para tests del cliente SOAP: zero llamadas reales a DIAN, determinístico.
- **DIAN rejection → HTTP 200**: una factura que DIAN rechaza por validación es una respuesta válida del servicio, no un error HTTP. Solo timeouts/503/500 mapean a 502/503.
- **`lru_cache` para el UseCase**: el cert se lee una vez al primer request y se reutiliza. Reset solo con restart.
- **Cert autofirmado en tests**: generado en `conftest.py` con RSA-2048; permite verificar firma cripto end-to-end sin DIAN real.

## Bloqueos / Pendientes
- **D9/D10 bloqueados** esperando del usuario:
  1. Certificado digital `.p12` para el NIT del parqueadero (de Andes SCD, Certicámara, GSE, etc.).
  2. Clave técnica DIAN (96 hex chars) — registrar el software en MUISCA → Habilitación.
  3. Resolución de numeración de habilitación (rango FE en MUISCA).
  4. Habilitación pasada (set de pruebas DIAN aceptado).
- **D8 deploy** pendiente de confirmación + materiales arriba.

## Verificación
- `pytest tests/` → **107/107 pasan en 0.70s**.
  - test_either: 19 · test_health: 2 · test_cufe: 15 · test_xml_builder: 16
  - test_cert_loader: 7 · test_xades_signer: 16
  - test_dian_soap_client: 13 · test_dian_datasource_mock: 5
  - test_emit_invoice: 5 · test_invoice_routes: 9
- `uvicorn app.main:app` → `/health`, `/openapi.json`, `POST /invoice` (503 sin cert configurado, esperado).
- `docker build` + `docker run` → contenedor responde `/health` en puerto 8000.

## Next Steps
- [ ] Cuando el usuario tenga **cert .p12 + clave técnica + habilitación**:
  - Configurar `.env` con `CERT_PATH`, `CERT_PASSWORD`, `DIAN_CLAVE_TECNICA`, `DIAN_NIT_EMISOR`, `SUPPLIER_*`.
  - Setear `DIAN_MODE=real` para que la DI use `DianDataSourceImpl` en vez del mock.
  - Probar `POST /invoice` localmente contra `vpruebas.dian.gov.co`.
- [ ] **D8 deploy a Fly.io** (con confirmación):
  - `fly auth login`
  - `fly secrets set DIAN_NIT_EMISOR=... DIAN_CLAVE_TECNICA=... CERT_B64=$(base64 cert.p12) CERT_PASSWORD=... SUPPLIER_LEGAL_NAME=...`
  - `fly deploy`
- [ ] **D9 Switch Edge Function**:
  - Actualizar `parqueadero-backend/supabase/functions/request-invoice/index.ts` para llamar a la URL pública del servicio en lugar del stub.
  - `supabase secrets set DIAN_FE_SERVICE_URL=https://parqueadero-dian-fe.fly.dev`.
  - Verificar contrato JSON.
- [ ] **D10 QA DIAN Sandbox**:
  - Enviar set de pruebas DIAN (8–12 escenarios).
  - Verificar `Aceptado` en portal DIAN.
  - Solicitar habilitación a producción.
- [ ] **Volver al PLAN.md raíz** → continuar con Fase 8 (Offline / PowerSync).
