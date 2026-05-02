"""
Generador de XML UBL 2.1 según el formato DIAN Colombia.

Spec: dian-fe-service/specs/emit-invoice.spec.md §"Construir XML UBL 2.1"

Notas:
- El nodo `cbc:UUID` recibe el CUFE ya calculado (calcularlo afuera).
- El segundo `ext:UBLExtension` queda vacío para que el firmador XAdES (D5)
  inserte allí la firma XAdES-EPES.
- Montos en el XML van en pesos (COP) con 2 decimales.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

from lxml import etree

from app.core.either import Either, Left, Right
from app.core.failures import XmlFailure
from app.domain.entities.invoice_entity import InvoiceData, InvoiceLine
from app.domain.entities.supplier_entity import SupplierData


NS = {
    "default": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "ext": "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    "sts": "dian:gov:co:facturaelectronica:Structures-2-1",
    "xades": "http://uri.etsi.org/01903/v1.3.2#",
    "ds": "http://www.w3.org/2000/09/xmldsig#",
}

BOGOTA_TZ = timezone(timedelta(hours=-5))


def _q(prefix: str, local: str) -> str:
    """QName con namespace expandido para lxml."""
    return f"{{{NS[prefix]}}}{local}"


def _cents_to_pesos(cents: int) -> str:
    """1500000 (cents) → '15000.00' (pesos con 2 decimales)."""
    pesos = Decimal(cents) / Decimal(100)
    return f"{pesos:.2f}"


def _to_bogota(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=BOGOTA_TZ)
    return dt.astimezone(BOGOTA_TZ)


class UBLBuilder:
    """
    Construye un XML UBL 2.1 listo para firma XAdES.

    Uso:
        supplier = SupplierData(nit="890123456", dv="7", ...)
        builder = UBLBuilder(supplier=supplier, profile_execution_id="2")  # 2=pruebas
        either = builder.build(invoice, cufe="A1B2...")
    """

    def __init__(self, supplier: SupplierData, profile_execution_id: str = "2"):
        self.supplier = supplier
        # 1=Producción, 2=Pruebas
        self.profile_execution_id = profile_execution_id

    def build(self, invoice: InvoiceData, cufe: str) -> Either[XmlFailure, str]:
        """
        Genera el XML UBL 2.1 como string UTF-8 con declaración.
        """
        if not cufe or len(cufe) != 96:
            return Left(XmlFailure(
                message=f"CUFE inválido: longitud esperada 96, recibida {len(cufe) if cufe else 0}",
            ))

        try:
            root = self._build_root()
            self._append_extensions(root)
            self._append_header(root, invoice, cufe)
            self._append_supplier(root)
            self._append_customer(root, invoice)
            self._append_tax_total(root, invoice)
            self._append_legal_monetary_total(root, invoice)
            self._append_lines(root, invoice.lines)

            xml_bytes = etree.tostring(
                root,
                xml_declaration=True,
                encoding="UTF-8",
                standalone=False,
            )
            return Right(xml_bytes.decode("utf-8"))
        except Exception as exc:  # lxml puede lanzar varios tipos
            return Left(XmlFailure(message=f"Error generando XML UBL: {exc}"))

    # ── Bloques ───────────────────────────────────────────────────────────────

    def _build_root(self) -> etree._Element:
        nsmap = {
            None: NS["default"],
            "cac": NS["cac"],
            "cbc": NS["cbc"],
            "ext": NS["ext"],
            "sts": NS["sts"],
            "xades": NS["xades"],
            "ds": NS["ds"],
        }
        return etree.Element(_q("default", "Invoice"), nsmap=nsmap)

    def _append_extensions(self, root: etree._Element) -> None:
        """
        Dos extensiones obligatorias DIAN:
         1) SoftwareSecurityCode + AuthorizationProvider (lo agrega el contribuyente
            o queda vacío si aún no se gestionó la habilitación).
         2) Reservada para la firma XAdES — llenada por XADESSigner.
        """
        extensions = etree.SubElement(root, _q("ext", "UBLExtensions"))

        # Extensión #1: estructura DIAN (vacía por ahora — se llena en habilitación)
        ext1 = etree.SubElement(extensions, _q("ext", "UBLExtension"))
        etree.SubElement(ext1, _q("ext", "ExtensionContent"))

        # Extensión #2: placeholder para firma XAdES
        ext2 = etree.SubElement(extensions, _q("ext", "UBLExtension"))
        etree.SubElement(ext2, _q("ext", "ExtensionContent"))

    def _append_header(self, root: etree._Element, invoice: InvoiceData, cufe: str) -> None:
        fecha = _to_bogota(invoice.fecha_expedicion)

        header_fields = [
            ("UBLVersionID", "UBL 2.1"),
            ("CustomizationID", "10"),
            ("ProfileID", "DIAN 2.1"),
            ("ProfileExecutionID", self.profile_execution_id),
            ("ID", invoice.numero_factura),
        ]
        for tag, text in header_fields:
            elem = etree.SubElement(root, _q("cbc", tag))
            elem.text = text

        # UUID = CUFE (schemeID="2" significa CUFE-SHA384)
        uuid_elem = etree.SubElement(
            root, _q("cbc", "UUID"),
            attrib={"schemeID": "2", "schemeName": "CUFE-SHA384"},
        )
        uuid_elem.text = cufe

        date_elem = etree.SubElement(root, _q("cbc", "IssueDate"))
        date_elem.text = fecha.strftime("%Y-%m-%d")

        time_elem = etree.SubElement(root, _q("cbc", "IssueTime"))
        time_elem.text = fecha.strftime("%H:%M:%S-05:00")

        type_elem = etree.SubElement(root, _q("cbc", "InvoiceTypeCode"))
        type_elem.text = invoice.tipo_documento

        currency_elem = etree.SubElement(root, _q("cbc", "DocumentCurrencyCode"))
        currency_elem.text = "COP"

        line_count = etree.SubElement(root, _q("cbc", "LineCountNumeric"))
        line_count.text = str(len(invoice.lines))

    def _append_supplier(self, root: etree._Element) -> None:
        s = self.supplier
        accounting_supplier = etree.SubElement(root, _q("cac", "AccountingSupplierParty"))
        party = etree.SubElement(accounting_supplier, _q("cac", "Party"))

        party_name = etree.SubElement(party, _q("cac", "PartyName"))
        name = etree.SubElement(party_name, _q("cbc", "Name"))
        name.text = s.trade_name or s.legal_name

        tax_scheme = etree.SubElement(party, _q("cac", "PartyTaxScheme"))
        reg_name = etree.SubElement(tax_scheme, _q("cbc", "RegistrationName"))
        reg_name.text = s.legal_name

        company_id = etree.SubElement(
            tax_scheme, _q("cbc", "CompanyID"),
            attrib={
                "schemeID": s.dv,
                "schemeName": s.company_id_scheme_name,
                "schemeAgencyID": "195",
                "schemeAgencyName": "CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)",
            },
        )
        company_id.text = s.nit

        ts = etree.SubElement(tax_scheme, _q("cac", "TaxScheme"))
        ts_id = etree.SubElement(ts, _q("cbc", "ID"))
        ts_id.text = s.tax_scheme_id
        ts_name = etree.SubElement(ts, _q("cbc", "Name"))
        ts_name.text = s.tax_scheme_name

    def _append_customer(self, root: etree._Element, invoice: InvoiceData) -> None:
        c = invoice.customer
        accounting_customer = etree.SubElement(root, _q("cac", "AccountingCustomerParty"))
        party = etree.SubElement(accounting_customer, _q("cac", "Party"))

        tax_scheme = etree.SubElement(party, _q("cac", "PartyTaxScheme"))

        reg_name = etree.SubElement(tax_scheme, _q("cbc", "RegistrationName"))
        reg_name.text = f"{c.first_name} {c.last_name}".strip()

        # schemeName por tipo de documento (13=CC, 31=NIT, 22=CE, 41=PA)
        doc_type_map = {"CC": "13", "NIT": "31", "CE": "22", "PA": "41"}
        scheme_name = doc_type_map.get(c.doc_type, "13")
        company_id = etree.SubElement(
            tax_scheme, _q("cbc", "CompanyID"),
            attrib={"schemeID": "0", "schemeName": scheme_name},
        )
        company_id.text = c.doc_number

        ts = etree.SubElement(tax_scheme, _q("cac", "TaxScheme"))
        ts_id = etree.SubElement(ts, _q("cbc", "ID"))
        ts_id.text = "01"
        ts_name = etree.SubElement(ts, _q("cbc", "Name"))
        ts_name.text = "IVA"

        if c.email:
            contact = etree.SubElement(party, _q("cac", "Contact"))
            email = etree.SubElement(contact, _q("cbc", "ElectronicMail"))
            email.text = c.email

    def _append_tax_total(self, root: etree._Element, invoice: InvoiceData) -> None:
        tax_total = etree.SubElement(root, _q("cac", "TaxTotal"))

        tax_amount = etree.SubElement(
            tax_total, _q("cbc", "TaxAmount"),
            attrib={"currencyID": "COP"},
        )
        tax_amount.text = _cents_to_pesos(invoice.impuestos_cents)

        subtotal = etree.SubElement(tax_total, _q("cac", "TaxSubtotal"))

        taxable = etree.SubElement(
            subtotal, _q("cbc", "TaxableAmount"),
            attrib={"currencyID": "COP"},
        )
        taxable.text = _cents_to_pesos(invoice.subtotal_cents)

        sub_amount = etree.SubElement(
            subtotal, _q("cbc", "TaxAmount"),
            attrib={"currencyID": "COP"},
        )
        sub_amount.text = _cents_to_pesos(invoice.impuestos_cents)

        tax_category = etree.SubElement(subtotal, _q("cac", "TaxCategory"))
        percent = etree.SubElement(tax_category, _q("cbc", "Percent"))
        # Por simplicidad asumimos un solo % de IVA (el de la 1ª línea)
        line_pct = invoice.lines[0].tax_percent if invoice.lines else 0.0
        percent.text = f"{line_pct:.2f}"

        ts = etree.SubElement(tax_category, _q("cac", "TaxScheme"))
        ts_id = etree.SubElement(ts, _q("cbc", "ID"))
        ts_id.text = "01"
        ts_name = etree.SubElement(ts, _q("cbc", "Name"))
        ts_name.text = "IVA"

    def _append_legal_monetary_total(self, root: etree._Element, invoice: InvoiceData) -> None:
        lmt = etree.SubElement(root, _q("cac", "LegalMonetaryTotal"))
        for tag, cents in [
            ("LineExtensionAmount", invoice.subtotal_cents),
            ("TaxExclusiveAmount", invoice.subtotal_cents),
            ("TaxInclusiveAmount", invoice.total_cents),
            ("PayableAmount", invoice.total_cents),
        ]:
            elem = etree.SubElement(lmt, _q("cbc", tag), attrib={"currencyID": "COP"})
            elem.text = _cents_to_pesos(cents)

    def _append_lines(self, root: etree._Element, lines: list[InvoiceLine]) -> None:
        for idx, line in enumerate(lines, start=1):
            inv_line = etree.SubElement(root, _q("cac", "InvoiceLine"))

            line_id = etree.SubElement(inv_line, _q("cbc", "ID"))
            line_id.text = str(idx)

            qty = etree.SubElement(
                inv_line, _q("cbc", "InvoicedQuantity"),
                attrib={"unitCode": "NAR"},  # NAR = number of articles
            )
            qty.text = str(line.quantity)

            line_amt = etree.SubElement(
                inv_line, _q("cbc", "LineExtensionAmount"),
                attrib={"currencyID": "COP"},
            )
            line_amt.text = _cents_to_pesos(line.subtotal_cents)

            # Tax block por línea
            tt = etree.SubElement(inv_line, _q("cac", "TaxTotal"))
            tt_amount = etree.SubElement(
                tt, _q("cbc", "TaxAmount"),
                attrib={"currencyID": "COP"},
            )
            tt_amount.text = _cents_to_pesos(line.tax_cents)

            ts = etree.SubElement(tt, _q("cac", "TaxSubtotal"))
            taxable = etree.SubElement(
                ts, _q("cbc", "TaxableAmount"),
                attrib={"currencyID": "COP"},
            )
            taxable.text = _cents_to_pesos(line.subtotal_cents)

            ts_amount = etree.SubElement(
                ts, _q("cbc", "TaxAmount"),
                attrib={"currencyID": "COP"},
            )
            ts_amount.text = _cents_to_pesos(line.tax_cents)

            tc = etree.SubElement(ts, _q("cac", "TaxCategory"))
            percent = etree.SubElement(tc, _q("cbc", "Percent"))
            percent.text = f"{line.tax_percent:.2f}"

            scheme = etree.SubElement(tc, _q("cac", "TaxScheme"))
            sid = etree.SubElement(scheme, _q("cbc", "ID"))
            sid.text = "01"
            sname = etree.SubElement(scheme, _q("cbc", "Name"))
            sname.text = "IVA"

            # Item
            item = etree.SubElement(inv_line, _q("cac", "Item"))
            desc = etree.SubElement(item, _q("cbc", "Description"))
            desc.text = line.description

            # Price
            price = etree.SubElement(inv_line, _q("cac", "Price"))
            price_amt = etree.SubElement(
                price, _q("cbc", "PriceAmount"),
                attrib={"currencyID": "COP"},
            )
            price_amt.text = _cents_to_pesos(line.unit_price_cents)
            base_qty = etree.SubElement(
                price, _q("cbc", "BaseQuantity"),
                attrib={"unitCode": "NAR"},
            )
            base_qty.text = "1"
