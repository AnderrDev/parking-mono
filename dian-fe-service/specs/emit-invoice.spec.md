# Spec: Emit Invoice (Factura Electrónica)

## Identificador
`dian/emit-invoice`

## Descripción
Flujo completo de emisión de factura electrónica contra DIAN. Recibe datos de venta (cliente, líneas, montos), genera XML UBL 2.1 validado, lo firma con XAdES-EPES, calcula CUFE, y lo envía al WS SOAP de DIAN. Retorna número de factura asignado, CUFE, XML y PDF (si DIAN los genera).

## Actor
Sistema (invocado desde Edge Function de Supabase cuando se cierra caja o se emite factura manual)

## Input (Params)

```python
@dataclass
class InvoiceEmissionRequest:
    # Cliente
    customer_id: str  # UUID de Supabase
    customer_name: str
    customer_doc_type: str  # 'CC', 'NIT', 'PASAPORTE'
    customer_doc_number: str
    customer_responsabilidades_fiscales: List[str]  # ['05', '08', '13']
    customer_email: str
    customer_phone: str
    customer_municipality: str
    customer_department: str
    
    # Factura
    invoice_type: str  # '01' (factura), '02' (nota crédito), '91' (nota débito)
    invoice_date: datetime  # Hora Colombia (UTC-5)
    subtotal_cents: int
    tax_percent: float  # 19.0 por defecto (IVA)
    lines: List[InvoiceLineRequest]
    
    # Referencia interna
    internal_number: str  # 'FAC-2026-04-28-0001'
    parking_session_ids: List[str]  # UUIDs de sesiones que se facturan
```

## Output (Result)

```python
@dataclass
class InvoiceEmissionResult:
    success: bool
    invoice_number: str  # CUFE (identificador único)
    dian_status: str  # 'accepted' | 'rejected' | 'contingency'
    dian_messages: List[str]  # Mensajes de DIAN
    xml_url: str  # URL de Storage para descargar XML
    pdf_url: str  # URL de Storage para descargar PDF
    issued_at: datetime
    soft_response: Optional[Dict]  # Respuesta raw de DIAN si hay error
```

## Reglas de Negocio

1. **Numeración de factura**: Asignada secuencialmente en Edge Function (no en este servicio). Este servicio recibe `internal_number` ya asignado.

2. **Validación de cliente**: NIT/CC debe cumplir formato, si es NIT debe tener DV correcto.

3. **Líneas de factura**: Mínimo 1, máximo ilimitado. Cada línea:
   - Descripción: 1-1000 caracteres
   - Cantidad: > 0
   - Precio unitario: en centavos (enteros)
   - IVA: 0%, 5%, 19% (según producto)

4. **Montos consistentes**:
   ```
   subtotal_calc = SUM(línea.cantidad * línea.precioUnitario)
   tax_calc = subtotal_calc * (tax_percent / 100)
   total = subtotal_calc + tax_calc
   ```
   Deben coincidir con los parámetros recibidos (dentro de 1 centavo de redondeo).

5. **Timestamp**: La factura se emite en hora local Colombia (UTC-5). En el XML va en UTC.

6. **Firma**: Con certificado digital del contribuyente (*.p12). Política DIAN v2.

7. **Reintento**: Si DIAN está caída o timeout, retornar status='contingency' (documento sin enviar aún, puede reintentarse).

## Flujo Principal

1. **Validar request**
   - Verificar que cliente existe y está activo en BD
   - Validar documento (NIT con DV, CC con formato)
   - Validar líneas (cantidad > 0, montos positivos)
   - Verificar suma de montos

2. **Generar UUID para factura** (si no viene)
   - `invoice_id = UUID v4`

3. **Construir XML UBL 2.1**
   - Usar `UBLBuilder` para generar XML válido
   - Incluir 14 campos requeridos para CUFE
   - Validar estructura contra esquema XSD (offline)

4. **Calcular CUFE**
   - Aplicar algoritmo DIAN (SHA-384 sobre 14 campos)
   - `CUFE = SHA384(campo1|campo2|...|campo14)`

5. **Firmar XML con XAdES-EPES**
   - Cargar certificado .p12 (del .env o Storage)
   - Crear firma con 3 referencias (Signature, SignedProperties, documento)
   - Incluir timestamp de servidor
   - Validar que firma sea válida antes de enviar

6. **Conectar a DIAN**
   - Usar `DianSoapClient` para enviar
   - Endpoint: `https://vpfe.dian.gov.co/WcfDianCustomerService.svc` (producción)
   - Método: `SendBillSync` o `SendBillAsync` (sync preferido para este caso)

7. **Procesar respuesta DIAN**
   - Si aceptada: extraer XML y PDF (si vienen), guardar en Storage
   - Si rechazada: retornar mensaje de error (validación DIAN)
   - Si timeout: retornar status='contingency' (para reintentar)

8. **Guardar resultado en BD**
   - UPDATE `invoices` SET:
     - dian_status = resultado
     - dian_cufe = CUFE
     - dian_xml_url = URL Storage
     - dian_pdf_url = URL Storage (si aplica)

9. **Retornar resultado** al cliente/Edge Function

## Edge Cases

- **Cliente sin responsabilidades fiscales**: Usar defaults ['05'] (contribuyente ordinario)
- **Línea con IVA 0%**: Permitir, pero documentar en descripción
- **Moneda**: Siempre COP, no soportar otras
- **Factura rechazada por DIAN**: Marcar en BD para que admin revise
- **Certificado expirado**: Fallar con error claro "Certificado digital expirado"
- **DIAN caída**: Guardar con status='contingency', no reintentar automáticamente

## Dependencias

- `UBLBuilder` — genera XML UBL 2.1
- `CUFECalculator` — calcula SHA-384
- `XADESSigner` — firma con XAdES-EPES
- `DianSoapClient` — envía a DIAN
- `StorageService` — guarda XML/PDF
- Supabase — actualiza `invoices`

---
Status: Pendiente de Implementación
