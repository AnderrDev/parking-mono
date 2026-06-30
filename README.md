# Parqueadero: Sistema de Administración de Parqueadero Colombiano

Sistema web para administrar un parqueadero en Colombia con soporte para rotación por horas y mensualidades. Incluye facturación electrónica directa contra DIAN y pagos en línea via Wompi. La operación requiere conexión a internet.

## Stack Técnico

| Componente | Tecnología | Descripción |
|---|---|---|
| **Frontend** | Angular 18 + TypeScript + SCSS | SPA online-only, arquitectura limpia |
| **Backend** | Supabase (PostgreSQL + Edge Functions) | BaaS con RLS, realtime, storage |
| **Facturación** | Python 3.12 + FastAPI (Fly.io) | Microservicio independiente, DIAN + SOAP |
| **Pagos** | Wompi API | Procesamiento de pagos online |
| **Auth** | Supabase JWT | Autenticación y RLS |

## Estructura del Proyecto

```
parqueadero/
├── parqueadero-web/          ← Cliente Angular SPA
│   ├── specs/                ← Especificaciones de features
│   ├── src/app/
│   │   ├── core/             ← Either, Failures, DI, Guards
│   │   ├── features/         ← Parking, Invoicing, Payments, etc
│   │   │   └── {feature}/
│   │   │       ├── domain/   ← Entities, Repositories (contracts), UseCases
│   │   │       ├── data/     ← Models, DataSources, Repository implementations
│   │   │       └── presentation/  ← Pages, Components, Forms
│   │   └── shared/           ← Components, Pipes, Validators, Utils
│   └── CLAUDE.md             ← Documentación del repo
│
├── parqueadero-backend/      ← Supabase (PostgreSQL + Edge Functions)
│   ├── specs/                ← Schema, RLS policies
│   ├── supabase/
│   │   ├── migrations/       ← SQL migrations (000X_*.sql)
│   │   ├── functions/        ← Edge Functions (deno/typescript)
│   │   └── seed.sql          ← Datos de prueba
│   └── CLAUDE.md
│
└── dian-fe-service/          ← Microservicio de facturación DIAN
    ├── specs/                ← CUFE, XAdES, SOAP, flujos
    ├── app/
    │   ├── domain/           ← Entities, Repositories, UseCases
    │   ├── data/             ← Models, DataSources, implementations
    │   ├── infrastructure/   ← XML, Crypto, SOAP, PDF
    │   ├── presentation/     ← FastAPI routes
    │   └── core/             ← Either, Failures, Config, DI
    └── CLAUDE.md
```

## Metodología: Spec-Driven Development (SDD)

**Regla de oro**: Nada se implementa sin una spec.

```
1. SPEC       → Escribir en specs/ (qué hace, inputs, outputs, reglas)
2. CONTRATO   → Crear interfaz/abstract class en domain/
3. TEST       → Escribir test que valida el contrato
4. IMPLEMENTAR → Código en data/ y presentation/
5. REVISAR    → Verifica vs spec punto por punto
```

Antes de implementar cualquier feature:
1. Abre la spec en `specs/features/{feature}/{usecase}.spec.md`
2. Verifica que exista. Si no, créala.
3. Verifica que los contratos en `domain/` la reflejan
4. Recién entonces implementa

## Arquitectura Limpia

### Las Tres Capas

```
Presentación
(Pages, Components, Forms)
        ↓
    Domain
(Entities, Repositories abstract, UseCases)
        ↓
     Data
(Models, DataSources, Repository implementations)
```

**Regla crítica**: `Domain` NUNCA importa `Data` ni `Presentation`.

### Either Pattern

Todas las operaciones retornan `Either<Failure, Result>`. No hay exceptions para control de flujo.

```typescript
// Resultado exitoso
Right<ParkingSessionEntity>

// Error esperado (manejable)
Left<ValidationFailure>
Left<BusinessRuleFailure>
Left<NotFoundFailure>
Left<NetworkFailure>
Left<ServerFailure>
```

## Reglas de Negocio (Clave)

1. **Una placa = una sesión activa** → UNIQUE constraint en BD + validación UseCase
2. **Minutos de gracia** → Sin cobro si sale antes de X minutos
3. **Tope diario** → Nunca se cobra más que el límite configurado
4. **Mensualidad vigente** → Sesión gratis si está dentro del período
5. **Numeración de facturas** → Asignada por servidor, nunca por cliente
6. **DIAN directa** → Factura electrónica contra WS DIAN sin intermediario
7. **Online-only** → La operación se confirma contra Supabase; sin conexión se informa error y no se persiste localmente
8. **Audit trail** → Todo cambio sensible queda registrado

## Flujos Principales

### Registro de Entrada de Vehículo

```
Operario toca "Registrar Entrada"
        ↓
Busca placa (autocomplete)
        ↓
Sistema verifica:
  • ¿Placa duplicada? → Error
  • ¿Hay caja abierta? → Error
  • ¿Tiene mensualidad vigente? → Usar plan, sino usar tarifa
        ↓
Registra sesión con entry_at = NOW()
        ↓
Operario ve: "ABC123 registrado a las 14:32"
```

### Registro de Salida & Cobro

```
Operario toca "Registrar Salida" en sesión activa
        ↓
Sistema calcula:
  • Duración = NOW() - entry_at
  • Si es mensualidad: cobro = $0
  • Si es rotación:
    - Aplica minutos de gracia
    - Calcula tarifa (por hora, minuto, día)
    - Aplica tope diario
        ↓
Muestra monto a cobrar (ej: $5.000)
        ↓
Operario selecciona método: efectivo | tarjeta | etc
        ↓
Registra pago y cierra sesión
        ↓
Si hay conexión: invoca Edge Function → dian-fe-service para emitir factura
```

### Facturación Electrónica (DIAN)

```
Edge Function (Supabase) recibe cierre de caja
        ↓
Asigna número secuencial (FAC-2026-04-28-0001)
        ↓
Llama a dian-fe-service POST /invoice
        ↓
dian-fe-service:
  1. Genera XML UBL 2.1
  2. Calcula CUFE (SHA-384 de 14 campos)
  3. Firma con XAdES-EPES
  4. Envía a DIAN via SOAP
  5. Retorna CUFE, XML, PDF
        ↓
Edge Function actualiza invoice en BD
        ↓
Operario ve: "Factura emitida - CUFE: ABC123..."
```

## Cómo Empezar

### 1. Clonar y Instalar

```bash
git clone https://github.com/tu-org/parqueadero.git
cd parqueadero

# Frontend
cd parqueadero-web
npm install

# Backend (local)
cd ../parqueadero-backend
npm install -g supabase
supabase start

# FE Service (local)
cd ../dian-fe-service
pip install -r requirements.txt
```

### 2. Configurar Variables de Entorno

```bash
# parqueadero-web/.env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
DIAN_FE_SERVICE_URL=http://localhost:8000

# parqueadero-backend/.env
# (Supabase genera automáticamente)

# dian-fe-service/.env
DIAN_NIT_EMISOR=890123456
DIAN_CLAVE_TECNICA=ABCD1234...
CERT_PATH=/secure/cert.p12
CERT_PASSWORD=...
SUPABASE_URL=...
SUPABASE_API_KEY=...
```

### 3. Ejecutar Localmente

```bash
# Terminal 1: Frontend
cd parqueadero-web
ng serve

# Terminal 2: Backend
cd parqueadero-backend
supabase start

# Terminal 3: Microservicio DIAN
cd dian-fe-service
python -m uvicorn app.main:app --reload
```

Accede a `http://localhost:4200`

## Documentación por Repo

- **`parqueadero-web/CLAUDE.md`** — Arquitectura Angular, SDD, estructura completa
- **`parqueadero-backend/CLAUDE.md`** — Schema, RLS, Edge Functions, seed data
- **`dian-fe-service/CLAUDE.md`** — CUFE, XAdES, SOAP, flujo de emisión

## Testing

```bash
# Angular
cd parqueadero-web
ng test

# Python
cd dian-fe-service
pytest tests/test_cufe.py -v
```

## Deployment

### Frontend (Vercel / Netlify)
```bash
cd parqueadero-web
ng build --configuration production
# Sube a Vercel/Netlify
```

### Backend (Supabase)
```bash
cd parqueadero-backend
supabase db push --linked
supabase functions deploy
```

### Microservicio (Fly.io)
```bash
cd dian-fe-service
fly deploy
```

## Contribuciones

1. Lee la spec del feature en `specs/`
2. Crea rama: `git checkout -b feature/parking-reporting`
3. Implementa según la arquitectura limpia
4. Verifica que cumple la spec punto por punto
5. Escribe tests
6. Abre PR

## Licencia

Propietaria — Parqueadero Colombia

## Contacto

admin@parqueadero.local

---

**v1.0** — Proyecto de referencia: Spec-Driven Development + Arquitectura Limpia + Factura Electrónica DIAN
