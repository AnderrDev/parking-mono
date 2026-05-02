# Plan de Trabajo — `dian-fe-service`

**Versión:** 1.0  
**Creado:** 2026-05-01  
**Stack:** Python 3.12 + FastAPI + Fly.io  
**Referencia arquitectura:** `dian-fe-service/CLAUDE.md`  
**Specs base:** `dian-fe-service/specs/` (4 specs ya escritas)

---

## Protocolo

- **Spec-driven**: los 4 specs existentes son fuente de verdad. Antes de cambiar comportamiento → actualiza spec primero.
- **Either everywhere**: todas las operaciones retornan `Either[Failure, Result]`. Sin `raise` para control de flujo.
- **Idioma**: comentarios y copy en español colombiano. Identificadores en inglés.
- **Moneda**: `*_cents` integers (COP).
- **Sesiones**: una entrada en `sessions/` por sesión de trabajo.

---

## Fases

| # | Fase | Descripción | Estado |
|---|---|---|---|
| D1 | Bootstrap | Estructura, deps, Dockerfile, .env, config | ⏳ pendiente |
| D2 | Either + Failures | `core/either.py`, `core/failures.py`, tests | ⏳ pendiente |
| D3 | UBL Builder | XML UBL 2.1 completo según spec | ⏳ pendiente |
| D4 | CUFE Calculator | SHA-384 con los 14 campos según spec | ⏳ pendiente |
| D5 | XAdES Signer | Firma digital XAdES-EPES con cert .p12 | ⏳ pendiente |
| D6 | SOAP Client | Cliente WS DIAN + WS-Security | ⏳ pendiente |
| D7 | FastAPI + Domain | Entities, UseCases, Repos, rutas HTTP | ⏳ pendiente |
| D8 | Docker + Fly.io | Containerización, secrets, deploy staging | ⏳ pendiente |
| D9 | Switch Edge Function | Cambiar stub → URL real en `request-invoice` | ⏳ pendiente |
| D10 | QA DIAN sandbox | Pruebas contra ambiente habilitación DIAN | ⏳ pendiente |

**Fase actual:** D1 — Bootstrap

---

## Fase D1 — Bootstrap

🎯 **Goal:** Proyecto Python corriendo con FastAPI. Estructura de directorios con `__init__.py` en todos los módulos. Config desde `.env`. Health check funcional.

📋 **Tareas:**
- [ ] `requirements.txt` con deps fijadas: `fastapi`, `uvicorn[standard]`, `pydantic-settings`, `python-zeep`, `lxml`, `cryptography`, `supabase`, `httpx`
- [ ] `app/__init__.py` y todos los `__init__.py` internos (reemplazar `.gitkeep`)
- [ ] `app/core/config.py` — `Settings` con Pydantic (`DIAN_NIT_EMISOR`, `DIAN_CLAVE_TECNICA`, etc.)
- [ ] `app/main.py` — app FastAPI básica con `lifespan`, CORS, `/health`
- [ ] `app/presentation/routes/health_routes.py` — GET `/health` → `{status: "ok", service: "dian-fe-service"}`
- [ ] `.env.example` completo (con todos los vars del `CLAUDE.md §4`)
- [ ] `Dockerfile` — Python 3.12-slim, no root, cert montado como secret
- [ ] `fly.toml` mínimo con app name, region `gru` (São Paulo, más cercano a Colombia)
- [ ] `tests/__init__.py` + `tests/test_health.py` (smoke test FastAPI)

✅ **DoD:**
```bash
cd dian-fe-service
pip install -r requirements.txt
uvicorn app.main:app --reload
# GET http://localhost:8000/health → {"status": "ok"}
# GET http://localhost:8000/docs → Swagger UI
```

---

## Fase D2 — Either + Failures

🎯 **Goal:** Pattern de errores idéntico al Angular pero en Python. Sin excepciones para control de flujo.

📋 **Tareas:**
- [ ] `app/core/either.py` — `Left`, `Right`, `Either = Left[L] | Right[R]`, métodos `fold`, `map`, `flat_map`, `is_left`, `is_right`, factories
- [ ] `app/core/failures.py` — `Failure` base + subclases: `ValidationFailure`, `BusinessRuleFailure`, `DianFailure` (rechazada/timeout/contingencia), `XmlFailure`, `CryptoFailure`, `NetworkFailure`, `ServerFailure`
- [ ] `tests/test_either.py` — cobertura 100%: fold, map, flat_map, isinstance cada Failure

✅ **DoD:**
```bash
python -m pytest tests/test_either.py -v
# Todos pasan, 0 warnings
```

---

## Fase D3 — UBL Builder

🎯 **Goal:** Generador de XML UBL 2.1 válido según los namespaces y estructura requerida por DIAN Colombia.

📐 **Spec:** `specs/emit-invoice.spec.md` §"Construir XML UBL 2.1"

📋 **Tareas:**
- [ ] `app/infrastructure/xml/ubl_builder.py` — clase `UBLBuilder` con método `build(invoice: InvoiceData) -> Either[XmlFailure, str]`
- [ ] Namespaces DIAN Colombia: `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2`, CBC, CAC, ext
- [ ] Secciones obligatorias: `UBLExtensions` (placeholder para firma), `UBLVersionID`, `CustomizationID`, `ProfileID`, `ID` (número factura), `IssueDate`, `IssueTime`, `InvoiceTypeCode`, `AccountingSupplierParty`, `AccountingCustomerParty`, `TaxTotal`, `LegalMonetaryTotal`, `InvoiceLine`
- [ ] `tests/test_xml_builder.py` — test básico: `build()` retorna XML parseable, contiene campos clave, namespace correcto

✅ **DoD:**
```bash
python -m pytest tests/test_xml_builder.py -v
# XML válido parseado con lxml sin error
```

---

## Fase D4 — CUFE Calculator

🎯 **Goal:** Implementación exacta del CUFE según Anexo Técnico 1.9 DIAN.

📐 **Spec:** `specs/cufe-calculation.spec.md` (los 14 campos, formato exacto)

📋 **Tareas:**
- [ ] `app/infrastructure/crypto/cufe_calculator.py` — clase `CUFECalculator(clave_tecnica: str)` con `calculate(invoice: InvoiceData) -> str`
- [ ] Formateo exacto de cada campo según spec (zfill, strftime, f-string con :.2f, upper/strip)
- [ ] `app/infrastructure/crypto/software_security_code.py` — helper para generar el Software Security Code si se requiere
- [ ] `tests/test_cufe.py` — reproducibilidad, exactamente 96 chars hex, ejemplo del spec

✅ **DoD:**
```bash
python -m pytest tests/test_cufe.py -v
# CUFE reproducible, 96 chars, solo 0-9A-F
```

---

## Fase D5 — XAdES Signer

🎯 **Goal:** Firma digital XAdES-EPES compatible con DIAN Colombia.

📐 **Spec:** `specs/xades-signature.spec.md`

📋 **Tareas:**
- [ ] `app/infrastructure/crypto/cert_loader.py` — carga `.p12`, extrae private key + cert chain
- [ ] `app/infrastructure/crypto/xades_signer.py` — `XADESSigner` con `sign(xml: str) -> Either[CryptoFailure, str]`
  - Firma enveloped (dentro del XML)
  - Algoritmo: `RSA-SHA256`
  - Política DIAN v2 (`https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf`)
  - `SignedProperties` con `SigningTime`, `SigningCertificate`, `SignaturePolicyIdentifier`
  - 3 referencias: `#xmldsig-ref0` (doc), `#xmldsig-signedprops` (props), `#xmldsig-ref-signature` (sig)
- [ ] `tests/test_xades_signer.py` — usa cert de prueba (autofirmado), valida que XML firmado es parseable y contiene nodo `Signature`

✅ **DoD:**
```bash
python -m pytest tests/test_xades_signer.py -v
# XML firmado contiene <ds:Signature>
```

---

## Fase D6 — SOAP Client

🎯 **Goal:** Cliente SOAP que envía la factura firmada a DIAN y parsea la respuesta.

📐 **Spec:** `specs/dian-soap-integration.spec.md`

📋 **Tareas:**
- [ ] `app/infrastructure/soap/constants.py` — URLs sandbox y producción, namespaces
- [ ] `app/infrastructure/soap/dian_soap_client.py` — `DianSoapClient` con `send_bill_sync(signed_xml: str) -> Either[DianFailure, DianResponse]`
  - WS-Security (UsernameToken o BinarySecurityToken según spec)
  - Timeout configurable (`DIAN_TIMEOUT_SECONDS`)
  - Mapear respuesta a `DianResponse` entity
  - Si timeout → retornar `DianFailure(status='contingency')`
- [ ] `app/data/datasources/dian_datasource_mock.py` — mock para dev/tests
- [ ] `tests/test_dian_soap_client.py` — test con mock HTTP (httpx mock), no hace llamadas reales

✅ **DoD:**
```bash
python -m pytest tests/test_dian_soap_client.py -v
# Pruebas con mock pasan. Sin llamadas reales a DIAN.
```

---

## Fase D7 — FastAPI + Domain Layer

🎯 **Goal:** Dominio completo (entities, repos, usecases) + rutas HTTP funcionando end-to-end con mock de DIAN.

📋 **Tareas:**
- [ ] `app/domain/entities/invoice_entity.py`, `invoice_line_entity.py`, `dian_response_entity.py`
- [ ] `app/domain/repositories/invoice_repository.py` (ABC)
- [ ] `app/domain/usecases/emit_invoice.py` — orquesta: validar → build XML → calcular CUFE → firmar → enviar → guardar en BD
- [ ] `app/domain/usecases/check_invoice_status.py`
- [ ] `app/data/models/invoice_model.py` — Pydantic `InvoiceEmissionRequest` / `InvoiceEmissionResponse`
- [ ] `app/data/repositories/invoice_repository_impl.py`
- [ ] `app/presentation/routes/invoice_routes.py` — `POST /invoice`, `GET /invoice/{id}/status`
- [ ] `app/core/di.py` — inyección simple (factories o `Depends`)
- [ ] `tests/test_emit_invoice.py` — happy path + 5 edge cases del spec

✅ **DoD:**
```bash
# Con mock de DIAN activo:
curl -X POST http://localhost:8000/invoice -d @tests/fixtures/sample_invoice.json
# → {"success": true, "dian_status": "accepted", "cufe": "MOCK..."}
python -m pytest tests/ -v
# Todos pasan
```

---

## Fase D8 — Docker + Fly.io

🎯 **Goal:** Imagen Docker lista, app desplegada en Fly.io staging, secrets gestionados.

📋 **Tareas:**
- [ ] `Dockerfile` multi-stage (builder + runtime), usuario no-root, `EXPOSE 8000`
- [ ] `.dockerignore` — excluir `*.p12`, `.env`, `__pycache__`
- [ ] `fly.toml` con health check, región `gru`, escala mínima `min_machines_running = 1`
- [ ] Secrets en Fly: `fly secrets set DIAN_CLAVE_TECNICA=... CERT_PASSWORD=...`
- [ ] Certificado .p12 como secret montado (no en imagen): `fly secrets set CERT_B64=$(base64 cert.p12)`
- [ ] Health check `/health` pasa en producción

✅ **DoD:**
```bash
fly status
# → running
curl https://<app>.fly.dev/health
# → {"status": "ok"}
```

---

## Fase D9 — Switch Edge Function

🎯 **Goal:** Reemplazar el stub DIAN en `request-invoice` con la URL real del microservicio.

📋 **Tareas:**
- [ ] Verificar contrato JSON: `InvoiceEmissionRequest` del servicio ↔ lo que envía la Edge Function
- [ ] Actualizar `parqueadero-backend/supabase/functions/request-invoice/index.ts`: cambiar URL de stub a `DIAN_FE_SERVICE_URL`
- [ ] Añadir `DIAN_FE_SERVICE_URL` a los secrets de Supabase (`supabase secrets set`)
- [ ] Test end-to-end: Edge Function → microservicio → respuesta real (con mock DIAN activo)
- [ ] Documentar en `parqueadero-backend/specs/edge-functions/request-invoice.spec.md` §"Integración real"

✅ **DoD:**
- Emitir factura desde la UI → llega al microservicio → respuesta `cufe` real en BD.

---

## Fase D10 — QA DIAN Sandbox

🎯 **Goal:** Factura aceptada por el ambiente de habilitación oficial de DIAN.

⚠️ **Prerequisitos:**
- Cuenta de habilitación DIAN del contribuyente activa
- Certificado digital de prueba (.p12) emitido para el NIT del parqueadero
- Clave técnica de prueba (96 chars) asignada por DIAN al software
- Rango de numeración de prueba autorizado en DIAN

📋 **Tareas:**
- [ ] Configurar env `DIAN_WSDL_URL` con endpoint sandbox: `https://vpruebas.dian.gov.co/WcfDianCustomerService.svc?wsdl`
- [ ] Enviar 3 facturas de prueba con datos del NIT habilitado
- [ ] Verificar en portal DIAN que aparecen con estado "Aceptada"
- [ ] Probar caso de rechazo (montos inconsistentes) → respuesta mapea a `DianFailure`
- [ ] Probar timeout simulado → status='contingency'

✅ **DoD:**
- Al menos 1 factura con `dian_status='accepted'` y CUFE real verificable en portal DIAN sandbox.

---

## Estado actual

- [x] D1 — Bootstrap ✅ (2026-05-01)
- [x] D2 — Either + Failures ✅ (2026-05-01)
- [x] D3 — UBL Builder ✅ (2026-05-01)
- [x] D4 — CUFE Calculator ✅ (2026-05-01)
- [x] D5 — XAdES Signer ✅ (2026-05-01) — verificado con cert autofirmado, firma criptográficamente válida
- [x] D6 — SOAP Client ✅ (2026-05-01) — manual SOAP + httpx.MockTransport, ZIP+base64 según DIAN
- [x] D7 — FastAPI + Domain Layer ✅ (2026-05-01) — `POST /invoice` + UseCase + DI con cache
- [x] D8 — Docker build ✅ (deploy a Fly.io pendiente; requiere `fly auth` + cert real)
- [ ] D9 — Switch Edge Function ⏳ pendiente (requiere D8 deploy + URL pública)
- [ ] D10 — QA DIAN Sandbox ⏳ pendiente (requiere cert real + clave técnica + habilitación)

**Fase actual:** ⏳ Bloqueo externo — esperando materiales DIAN del usuario

**Tests acumulados:** 107 — pasan en 0.70s
- test_either: 19 · test_health: 2 · test_cufe: 15 · test_xml_builder: 16
- test_cert_loader: 7 · test_xades_signer: 16
- test_dian_soap_client: 13 · test_dian_datasource_mock: 5
- test_emit_invoice: 5 · test_invoice_routes: 9
