from dataclasses import dataclass


@dataclass(frozen=True)
class SupplierData:
    """
    Datos del emisor (parqueadero). Constantes por instalación —
    se inyectan en `UBLBuilder` desde `Settings`, no por factura.
    """
    nit: str               # Sin DV ni guiones (ej: "890123456")
    dv: str                # Dígito de verificación (ej: "7")
    legal_name: str        # Razón social (ej: "Parqueadero Central S.A.S.")
    trade_name: str = ""   # Nombre comercial (opcional)
    fiscal_responsibility_code: str = "R-99-PN"  # No responsable IVA por defecto
    tax_scheme_id: str = "01"   # 01 = IVA
    tax_scheme_name: str = "IVA"

    # Domicilio
    address_line: str = ""
    municipality_code: str = "11001"  # Bogotá D.C.
    department_code: str = "11"
    country_code: str = "CO"
    postal_zone: str = "110111"

    # Contacto
    email: str = ""
    phone: str = ""

    # Régimen
    company_id_scheme_id: str = "9"   # NIT con DV
    company_id_scheme_name: str = "31"  # NIT
