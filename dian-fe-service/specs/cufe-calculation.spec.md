# Spec: CUFE Calculation (Código Único de Factura Electrónica)

## Identificador
`dian/cufe-calculation`

## Descripción
Cálculo del CUFE según el Anexo Técnico 1.9 de la DIAN. El CUFE es un identificador único para cada factura electrónica, calculado mediante SHA-384 sobre 14 campos específicos. Sin CUFE válido, la factura no es aceptada por DIAN.

## Algoritmo

```
CUFE = SHA384(
  campo1 |
  campo2 |
  campo3 |
  campo4 |
  campo5 |
  campo6 |
  campo7 |
  campo8 |
  campo9 |
  campo10 |
  campo11 |
  campo12 |
  campo13 |
  campo14
)
```

El símbolo `|` es un separador literal (carácter pipe).

## Los 14 Campos (en orden)

| # | Nombre | Tipo | Formato | Ejemplo | Validaciones |
|---|---|---|---|---|---|
| 1 | NIT del Emisor | int | 8-10 dígitos | 890123456 | Sin guiones, sin DV |
| 2 | Código Tipo de Documento | string | 2 caracteres | 01 | 01=factura, 02=nota crédito, 91=nota débito |
| 3 | Número de Factura | int | 1-20 caracteres | 0000000001 | Secuencial del rango de numeración |
| 4 | Fecha de Expedición | string | YYYYMMDD | 20260428 | Hora Colombia (UTC-5) |
| 5 | Hora de Expedición | string | HHMMSS | 143530 | Formato 24h |
| 6 | Subtotal | decimal | .2 decimales | 15000.00 | En pesos sin separadores |
| 7 | Descuento Global | decimal | .2 decimales | 0.00 | Si no aplica, 0.00 |
| 8 | Valor de Impuestos (IVA + Otros) | decimal | .2 decimales | 2850.00 | IVA a 19% normalmente |
| 9 | Honorarios (Rete IVA, Rete Fuente) | decimal | .2 decimales | 0.00 | Retenciones si aplican |
| 10 | Valor Total de la Factura | decimal | .2 decimales | 17850.00 | Subtotal - Desc + IVA - Retenciones |
| 11 | Nro. de Identificación del Adquiriente | int | Doc sin guiones | 123456789 | CC, NIT, CE, PA, etc |
| 12 | Primer Apellido del Adquiriente | string | 1-60 caracteres | PEREZ | Normalizar mayúsculas |
| 13 | Primer Nombre del Adquiriente | string | 1-60 caracteres | JUAN | O razón social si es empresa |
| 14 | Clave Técnica (Software Security Code) | string | 96 caracteres hex | [ver spec aparte] | Generado por DIAN, específico por NIT |

## Notas de Implementación

### Campo 1: NIT del Emisor
- El nuestro es fijo (9 dígitos sin DV)
- Ejemplo: `890123456` (NO `890123456-7`)

### Campos 4-5: Fecha y Hora
- Usar SIEMPRE hora Colombia (UTC-5)
- Convertir si el servidor está en UTC
- No incluir segundos en fecha, solo en hora

### Campos 6-10: Montos
- Siempre con 2 decimales: `15000.00`
- Separador decimal: punto (.)
- NO incluir separador de miles (NO `15,000.00`)
- Valores en pesos COP

### Campo 11: Documento del Cliente
- Formato: solo dígitos, sin guiones
- Si es NIT: sin DV (ej: `900123456` no `900123456-1`)

### Campo 12-13: Nombres del Cliente
- Normalizar a MAYÚSCULAS
- Si es persona jurídica: usar razón social en campo 13
- Trimear espacios
- Remover caracteres especiales (solo alfanuméricos y espacios)

### Campo 14: Clave Técnica (Software Security Code)
- Generado por DIAN y compartido al proveedor de software
- Específico por NIT del emisor
- 96 caracteres hexadecimales
- NO es parte de la firma del XML, solo del CUFE

## Proceso de Cálculo

```python
def calculate_cufe(invoice: InvoiceData) -> str:
    campo1 = invoice.nit_emisor  # "890123456"
    campo2 = invoice.tipo_documento  # "01"
    campo3 = str(invoice.numero_factura).zfill(10)  # "0000000001"
    campo4 = invoice.fecha_expedicion.strftime("%Y%m%d")  # "20260428"
    campo5 = invoice.hora_expedicion.strftime("%H%M%S")  # "143530"
    campo6 = f"{invoice.subtotal:.2f}"  # "15000.00"
    campo7 = f"{invoice.descuento:.2f}"  # "0.00"
    campo8 = f"{invoice.impuestos:.2f}"  # "2850.00"
    campo9 = f"{invoice.retenciones:.2f}"  # "0.00"
    campo10 = f"{invoice.total:.2f}"  # "17850.00"
    campo11 = str(invoice.doc_cliente).zfill(10)  # "0123456789"
    campo12 = invoice.apellido_cliente.upper().strip()  # "PEREZ"
    campo13 = invoice.nombre_cliente.upper().strip()  # "JUAN"
    campo14 = CLAVE_TECNICA_DIAN  # Desde .env
    
    input_string = f"{campo1}|{campo2}|{campo3}|{campo4}|{campo5}|{campo6}|{campo7}|{campo8}|{campo9}|{campo10}|{campo11}|{campo12}|{campo13}|{campo14}"
    
    cufe = hashlib.sha384(input_string.encode('utf-8')).hexdigest()
    return cufe.upper()
```

## Validación

El CUFE resultante debe ser:
- Exactamente 96 caracteres hexadecimales (0-9, A-F)
- Calculable nuevamente con los mismos 14 campos
- Único para cada combinación de emisor, documento, número y fecha

## Ejemplos (Ficticios)

### Ejemplo 1: Factura Simple

```
NIT Emisor: 890123456
Tipo Doc: 01
Número: 0000000001
Fecha: 2026-04-28
Hora: 14:35:30
Subtotal: $15,000.00
Descuento: $0.00
IVA (19%): $2,850.00
Retenciones: $0.00
Total: $17,850.00
Cliente NIT: 123456789
Apellido: PEREZ
Nombre: JUAN
Clave Técnica: [96 chars]

Input String:
"890123456|01|0000000001|20260428|143530|15000.00|0.00|2850.00|0.00|17850.00|0123456789|PEREZ|JUAN|[clave técnica]"

CUFE Result (ejemplo):
"A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B2C3D4E5F6A7B8C9D0"
```

## Dependencias

- `hashlib` (librería estándar Python)
- Software Security Code (DIAN) — del .env

---
Status: Pendiente de Implementación
